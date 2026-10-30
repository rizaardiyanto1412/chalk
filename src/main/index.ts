import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { Server } from 'node:http'
import { findFrame, type FrameId, type Op } from '../shared/model'
import { Store } from './store'
import { Browser } from './browser'
import { startServer, DEFAULT_PORT, previews } from './server'
import { renderUrl } from './render'
import { randomUUID } from 'node:crypto'
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

/** Text fields in the built-in browser keep their own undo; everything else goes to the renderer. */
function history(direction: 'undo' | 'redo'): void {
  const page = browser.view.webContents
  if (page.isFocused()) return direction === 'undo' ? page.undo() : page.redo()
  send('history', direction)
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
      {
        label: 'Edit',
        submenu: [
          { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: () => history('undo') },
          { label: 'Redo', accelerator: 'CmdOrCtrl+Shift+Z', click: () => history('redo') },
          { type: 'separator' },
          { role: 'cut' },
          { role: 'copy' },
          { role: 'paste' },
          { role: 'selectAll' }
        ]
      },
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

/** Only the app's own top-level page may call IPC. Frame designs and other pages may not. */
function trusted(e: Electron.IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? ''
  return e.sender === win?.webContents && e.senderFrame === win.webContents.mainFrame && (url.startsWith('file://') || (!!process.env.ELECTRON_RENDERER_URL && url.startsWith(process.env.ELECTRON_RENDERER_URL)))
}

function handle(channel: string, fn: (e: Electron.IpcMainInvokeEvent, ...args: any[]) => unknown): void {
  ipcMain.handle(channel, (e, ...args) => {
    if (!trusted(e)) throw new Error('untrusted sender')
    return fn(e, ...args)
  })
}

function registerIpc(): void {
  handle('init', () => ({
    doc: store.doc,
    project: { dir: store.dir, name: basename(store.dir) },
    port,
    mcpUrl: mcpUrl(),
    claudePath: findClaude(),
    models: MODELS,
    browser: browser.state(),
    agentStatus: agent.status
  }))
  handle('op', (_e, op: Op) => void store.dispatch(op))
  handle('history', (_e, direction: 'undo' | 'redo') => store.travel(direction))
  handle('select', (_e, ids: FrameId[]) => {
    store.selection = ids
  })
  handle('browser', async (_e, action: string, arg?: unknown) => {
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
  handle('agent:send', (_e, { text, model }: { text: string; model: string }) => {
    const selectedFrames = store.selection.flatMap((id) => findFrame(store.doc, id) ?? [])
    void agent.send(text, { selectedFrames, browserPick: store.browserPick, browserUrl: browser.state().url }, model)
  })
  handle('agent:stop', () => agent.stop())
  handle('agent:reset', () => agent.reset())
  handle('frame', async (_e, action: string, id: string) => {
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
  handle('clipboard', (_e, text: string) => clipboard.writeText(text))
  handle('project', (_e, action: 'new' | 'open' | 'reveal') => (action === 'reveal' ? shell.openPath(store.dir) : chooseProject(action === 'new')))
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
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.on('will-frame-navigate', (e) => {
    if (e.isMainFrame) e.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
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
    measure: async (html, width) => {
      const token = randomUUID()
      previews.set(token, html)
      try {
        return (await renderUrl(`http://127.0.0.1:${port}/preview/${token}`, width)).contentHeight
      } finally {
        previews.delete(token)
      }
    },
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
