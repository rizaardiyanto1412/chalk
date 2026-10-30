import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { Server } from 'node:http'
import { findFrame, type FrameId, type Op } from '../shared/model'
import { Store } from './store'
import { Browser } from './browser'
import { startServer, DEFAULT_PORT } from './server'
import type { ToolContext } from './tools'
import { Agent, findClaude, MODELS } from './agent'
import { frameDocument } from './frameHtml'

const store = new Store()
let win: BrowserWindow | null = null
let browser: Browser
let agent: Agent
let port = Number(process.env.EASEL_PORT) || DEFAULT_PORT
let server: Server | null = null

const configFile = () => join(app.getPath('userData'), 'config.json')
const readConfig = (): { projectDir?: string } => {
  try {
    return JSON.parse(readFileSync(configFile(), 'utf8'))
  } catch {
    return {}
  }
}
const writeConfig = (c: { projectDir: string }) => writeFileSync(configFile(), JSON.stringify(c))

const mcpUrl = () => `http://127.0.0.1:${port}/mcp`
const send = (channel: string, payload?: unknown) => win?.webContents.send(channel, payload)

function openProject(dir: string): void {
  store.open(dir)
  writeConfig({ projectDir: dir })
  agent?.reset()
  win?.setTitle(`${basename(dir)} · Easel`)
  send('project', { dir, name: basename(dir) })
}

async function chooseProject(create: boolean): Promise<void> {
  if (!win) return
  const res = create
    ? await dialog.showSaveDialog(win, { title: 'New Easel project', defaultPath: join(homedir(), 'Easel', 'Untitled'), buttonLabel: 'Create' })
    : await dialog.showOpenDialog(win, { title: 'Open Easel project folder', defaultPath: join(homedir(), 'Easel'), properties: ['openDirectory', 'createDirectory'] })
  const dir = 'filePath' in res ? res.filePath : res.filePaths[0]
  if (res.canceled || !dir) return
  mkdirSync(dir, { recursive: true })
  openProject(dir)
}

function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      { role: 'appMenu' },
      {
        label: 'File',
        submenu: [
          { label: 'New Project…', accelerator: 'CmdOrCtrl+Shift+N', click: () => void chooseProject(true) },
          { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => void chooseProject(false) },
          { label: 'Show Project in Finder', click: () => shell.openPath(store.dir) },
          { type: 'separator' },
          { role: 'close' }
        ]
      },
      { role: 'editMenu' },
      {
        label: 'View',
        submenu: [{ role: 'reload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'togglefullscreen' }]
      },
      { role: 'windowMenu' }
    ])
  )
}

async function listen(ctx: ToolContext): Promise<void> {
  for (let p = port; p < port + 10; p++) {
    try {
      server = await startServer(ctx, p)
      port = p
      return
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw err
    }
  }
  throw new Error(`Ports ${port}-${port + 9} are all in use.`)
}

function registerIpc(): void {
  ipcMain.handle('init', () => ({
    doc: store.doc,
    project: { dir: store.dir, name: basename(store.dir) },
    port,
    mcpUrl: mcpUrl(),
    claudePath: findClaude(),
    models: MODELS,
    browser: browser.state(),
    agentStatus: agent.status
  }))
  ipcMain.handle('op', (_e, op: Op) => void store.dispatch(op))
  ipcMain.handle('select', (_e, ids: FrameId[]) => {
    store.selection = ids
  })
  ipcMain.handle('browser', async (_e, action: string, arg?: unknown) => {
    switch (action) {
      case 'bounds':
        return browser.setBounds(arg as Electron.Rectangle)
      case 'visible':
        return browser.setVisible(!!arg)
      case 'navigate':
        return browser.navigate(String(arg))
      case 'back':
        return browser.back()
      case 'forward':
        return browser.forward()
      case 'reload':
        return browser.reload()
      case 'pick':
        return arg ? browser.startPick() : browser.cancelPick()
      case 'clearPick':
        store.browserPick = null
        return send('browser:pick', null)
      case 'capture': {
        const { TOOLS } = await import('./tools')
        return TOOLS.find((t) => t.name === 'browser_capture_to_canvas')!.run({ full_page: true } as never, toolContext)
      }
    }
  })
  ipcMain.handle('agent:send', (_e, { text, model }: { text: string; model: string }) => {
    const selectedFrames = store.selection.flatMap((id) => findFrame(store.doc, id) ?? [])
    void agent.send(text, { selectedFrames, browserPick: store.browserPick, browserUrl: browser.state().url }, model)
  })
  ipcMain.handle('agent:stop', () => agent.stop())
  ipcMain.handle('agent:reset', () => agent.reset())
  ipcMain.handle('frame', async (_e, action: string, id: string) => {
    const f = findFrame(store.doc, id)
    if (!f) return
    const html = f.kind === 'html' ? frameDocument(f) : ''
    if (action === 'copy') clipboard.writeText(html)
    if (action === 'open') void shell.openExternal(`http://127.0.0.1:${port}/frame/${f.id}`)
    if (action === 'export' && win) {
      const res = await dialog.showSaveDialog(win, { defaultPath: join(homedir(), 'Downloads', `${f.name.replace(/[^\w -]+/g, '').trim() || 'frame'}.html`) })
      if (!res.canceled && res.filePath) writeFileSync(res.filePath, html)
    }
  })
  ipcMain.handle('clipboard', (_e, text: string) => clipboard.writeText(text))
  ipcMain.handle('project', (_e, action: 'new' | 'open' | 'reveal') => (action === 'reveal' ? shell.openPath(store.dir) : chooseProject(action === 'new')))
}

let toolContext: ToolContext

function createWindow(): void {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    title: `${basename(store.dir)} · Easel`,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    backgroundColor: '#f4f4f5',
    webPreferences: { preload: join(import.meta.dirname, '../preload/index.cjs'), sandbox: false }
  })
  browser.attach(win)
  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(import.meta.dirname, '../renderer/index.html'))
  win.on('closed', () => {
    win = null
  })
}

app.setName('Easel')

app.whenReady().then(async () => {
  const saved = readConfig().projectDir
  const fallback = join(homedir(), 'Easel', 'Untitled')
  store.open(process.env.EASEL_PROJECT_DIR || (saved && existsSync(saved) ? saved : fallback))
  if (!process.env.EASEL_PROJECT_DIR) writeConfig({ projectDir: store.dir })

  browser = new Browser()
  toolContext = {
    store,
    browser,
    frameUrl: (f) => `http://127.0.0.1:${port}/frame/${f.id}?v=${f.updatedAt}`,
    focus: (target) => send('focus', target)
  }
  agent = new Agent(mcpUrl, () => store.dir)

  store.on('change', (doc) => send('doc', doc))
  browser.on('state', (s) => send('browser:state', s))
  browser.on('pick', (pick) => {
    store.browserPick = pick
    send('browser:pick', pick)
  })
  agent.on('event', (e) => send('agent:event', e))
  agent.on('status', (s) => send('agent:status', s))

  await listen(toolContext)
  registerIpc()
  buildMenu()
  createWindow()
})

app.on('before-quit', () => {
  store.flush()
  agent?.stop()
  server?.close()
})
app.on('window-all-closed', () => app.quit())
