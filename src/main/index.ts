import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import type { Server } from 'node:http'
import { BROWSER_DEVICE_IDS, type BrowserDeviceId, EXPORT_FORMATS, findFrame, type AgentEvent, type CopyImageResult, type ExportActivity, type ExportResult, type EditCommand, type NativeEditCommand, type FrameId, type Op } from '../shared/model'
import { chatIdSchema } from '../shared/chats'
import { selectedElements, removeElements } from './elements'
import { elementHitSchema, samePath } from '../shared/elementSelection'
import { frameIdSchema, safeAssetName } from './frameCommands'
import { Browser } from './browser'
import { startServer, DEFAULT_PORT } from './server'
import { createPreview } from './previews'
import type { PhotoKeys } from './photos'
import { measureUrl } from './render'
import { randomUUID } from 'node:crypto'
import { MODELS } from './agent'
import { frameDocument } from './frameHtml'
import { buildExport, copyFrameImage, exportFileName, exportFormatSchema, snapshotExport, writeExport } from './export'
import { loadStyle, styleChoiceSchema, styleSummaries } from './styles'
import { z } from 'zod'
import { CONNECT_LEARN_URL, connectAgentIdSchema } from '../shared/connectAgents'
import { configLocations, createConnections, type ConnectDeps } from './connectAgents'
import { findCli } from './agentCli'
import { Run } from './run'
import { WorkerRegistry, type PageCapture } from './worker'
import { Workspace } from './workspace'
import { Codebase, hasProductBrief, saveCodebase } from './codebase'
import { isOrdinary, priorRunNote, runSettingsSchema } from '../shared/run'

let win: BrowserWindow | null = null
let browser: Browser
const registry = new WorkerRegistry()
/** Open project tabs by folder. `ws` is the visible one; the others keep working in the background. */
const workspaces = new Map<string, Workspace>()
let ws: Workspace
let port = Number(process.env.CHALK_PORT) || DEFAULT_PORT
let server: Server | null = null

interface Config {
  projectDir?: string
  /** Project folders open as tabs, in tab order. */
  projects: string[]
  recentUrls: string[]
  /** Browser viewport preset. Replaced the older browserDevice key so earlier saved "responsive" choices reset to desktop once. */
  browserViewport?: BrowserDeviceId
  /** Optional stock photo API keys. Without them, photo search uses Wikimedia Commons. */
  photoKeys?: PhotoKeys
}

const configFile = () => join(app.getPath('userData'), 'config.json')
/** Settings from before the rename live under the old app name. */
const legacyConfigFile = () => join(app.getPath('appData'), 'Easel', 'config.json')
function readConfig(): Config {
  try {
    const c = JSON.parse(readFileSync(existsSync(configFile()) ? configFile() : legacyConfigFile(), 'utf8'))
    return { browserViewport: z.enum(BROWSER_DEVICE_IDS).catch('desktop').parse(c.browserViewport ?? 'desktop'), projectDir: c.projectDir, projects: Array.isArray(c.projects) ? c.projects : [], recentUrls: Array.isArray(c.recentUrls) ? c.recentUrls : [], photoKeys: z.object({ unsplash: z.string().min(1).optional(), pexels: z.string().min(1).optional() }).catch({}).parse(c.photoKeys ?? {}) }
  } catch {
    return { projects: [], recentUrls: [] }
  }
}
let config: Config = { projects: [], recentUrls: [] }
const photoKeys = (): PhotoKeys => ({
  unsplash: process.env.CHALK_UNSPLASH_ACCESS_KEY || config.photoKeys?.unsplash,
  pexels: process.env.CHALK_PEXELS_API_KEY || config.photoKeys?.pexels
})
/** Test runs pin a project with CHALK_PROJECT_DIR and must not touch the user's saved tabs. */
function updateConfig(patch: Partial<Config>): void {
  config = { ...config, ...patch }
  if (!process.env.CHALK_PROJECT_DIR) writeFileSync(configFile(), JSON.stringify(config))
}

const tabs = () => config.projects.map((dir) => ({ dir, name: basename(dir), busy: !!workspaces.get(dir)?.busy }))
const MAX_RECENT = 30

const mcpUrl = () => `http://127.0.0.1:${port}/mcp`
const send = (channel: string, payload?: unknown) => win?.webContents.send(channel, payload)
let chatDialogOpen = false
function nativeEdit(command: NativeEditCommand | 'duplicate'): void {
  const contents = browser.view.webContents.isFocused() ? browser.view.webContents : win?.webContents
  if (command !== 'duplicate') contents?.[command]()
}

function edit(command: EditCommand): void {
  if (browser.view.webContents.isFocused()) return nativeEdit(command)
  send('edit', command)
}

function workspaceFor(dir: string): Workspace {
  let found = workspaces.get(dir)
  if (!found) {
    found = new Workspace(dir, {
      browser: () => browser,
      origin: () => `http://127.0.0.1:${port}`,
      photoKeys,
      measure: async (html, width) => {
        const preview = createPreview(html, `http://127.0.0.1:${port}`)
        try {
          return await measureUrl(preview.url, width)
        } finally {
          preview.dispose()
        }
      },
      send: (from, channel, payload) => { if (from === ws) send(channel, payload) },
      busyChanged: () => send('tabs', tabs()),
      isActive: (candidate) => candidate === ws
    })
    workspaces.set(dir, found)
  }
  return found
}

/** Show a project. Agents in other tabs keep working; only the visible tab talks to the window. */
function openProject(dir: string): void {
  if ((ws && dir === ws.dir) || chatDialogOpen) return
  // Only tabs with a working agent stay alive in the background. Idle tabs reload from disk when shown, as before.
  for (const idle of [ws, workspaces.get(dir)]) if (idle && !idle.busy) {
    idle.close()
    workspaces.delete(idle.dir)
  }
  ws = workspaceFor(dir)
  updateConfig({ projectDir: dir, projects: config.projects.includes(dir) ? config.projects : [...config.projects, dir] })
  win?.setTitle(`${basename(dir)} · Chalk`)
  send('project', { dir, name: basename(dir), epoch: ws.store.projectEpoch })
  send('doc', ws.store.doc)
  send('selection', ws.store.selection)
  send('element:selection', ws.store.selectedElements)
  send('browser:pick', ws.store.browserPick)
  send('chats:state', ws.chats.state())
  send('agent:status', ws.busy ? 'running' : 'idle')
  send('presence', ws.presence.state)
  send('run:live', ws.live.state())
  send('codebase', codebaseState())
  void browser.present(ws.presence.state.visual).catch(() => {})
  send('tabs', tabs())
}

const codebaseState = () => (ws.codebase ? { name: ws.codebase.name, path: ws.codebase.root, hasBrief: hasProductBrief(ws.dir) } : null)

async function chooseCodebase(): Promise<void> {
  if (!win) return
  const owner = ws
  const res = await dialog.showOpenDialog(win, { title: 'Link a codebase', message: 'Chalk\'s agent can read this folder (read-only) to learn the product before designing.', defaultPath: owner.codebase?.root ?? homedir(), properties: ['openDirectory'] })
  if (res.canceled || !res.filePaths[0]) return
  owner.codebase = new Codebase(res.filePaths[0])
  saveCodebase(owner.dir, owner.codebase.root)
  if (owner === ws) send('codebase', codebaseState())
}

function closeProject(dir: string): void {
  const closing = workspaces.get(dir)
  if (closing?.busy || chatDialogOpen) return
  const projects = config.projects.filter((p) => p !== dir)
  if (projects.length === 0) return
  updateConfig({ projects })
  if (dir === ws.dir) openProject(projects[Math.max(0, config.projects.indexOf(dir) - 1)] ?? projects[0])
  closing?.close()
  workspaces.delete(dir)
  send('tabs', tabs())
}

/** A new untitled project in ~/Chalk, opened straight away like a new document. */
function newUntitled(): void {
  if (chatDialogOpen) return
  const root = join(homedir(), 'Chalk')
  let n = 1
  while (existsSync(join(root, n === 1 ? 'Untitled' : `Untitled ${n}`))) n++
  const dir = join(root, n === 1 ? 'Untitled' : `Untitled ${n}`)
  mkdirSync(dir, { recursive: true })
  openProject(dir)
}

function rememberUrl(url: string): void {
  if (!/^https?:/.test(url)) return
  const clean = url.replace(/#.*$/, '')
  updateConfig({ recentUrls: [clean, ...config.recentUrls.filter((u) => u !== clean)].slice(0, MAX_RECENT) })
  send('browser:recent', config.recentUrls)
}

async function chooseProject(create: boolean): Promise<void> {
  if (!win || chatDialogOpen) return
  const res = create
    ? await dialog.showSaveDialog(win, { title: 'New Chalk project', defaultPath: join(homedir(), 'Chalk', 'Untitled'), buttonLabel: 'Create' })
    : await dialog.showOpenDialog(win, { title: 'Open Chalk project folder', defaultPath: join(homedir(), 'Chalk'), properties: ['openDirectory', 'createDirectory'] })
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

let uiExportInFlight = false
const exportActivity = (activity: ExportActivity) => send('export:activity', activity)

function exportSnapshot(id: unknown) {
  const frame = findFrame(ws.store.doc, z.string().parse(id))
  if (!frame) throw new Error('Select one frame to export.')
  return snapshotExport(frame, ws.store.dir, `http://127.0.0.1:${port}`)
}

async function uiExportAction<T extends ExportResult | CopyImageResult>(message: string, action: () => Promise<T>): Promise<T | { status: 'error'; message: string }> {
  if (uiExportInFlight) return { status: 'error', message: 'An export is already running.' }
  uiExportInFlight = true
  exportActivity({ status: 'busy', message })
  try {
    const result = await action()
    exportActivity(result)
    return result
  } catch (err) {
    const result = { status: 'error', message: err instanceof Error ? err.message : String(err) } as const
    exportActivity(result)
    return result
  } finally {
    uiExportInFlight = false
  }
}

function exportFromUi(id: unknown, rawFormat: unknown): Promise<ExportResult> {
  return uiExportAction('Preparing export…', async () => {
    const parsed = exportFormatSchema.safeParse(rawFormat)
    if (!parsed.success) throw new Error('Choose PNG, JPEG, HTML, or PDF for export.')
    const format = parsed.data
    const snapshot = exportSnapshot(id)
    if (!win) throw new Error('The Chalk window is unavailable.')
    const ext = format === 'jpeg' ? 'jpg' : format
    const result = await dialog.showSaveDialog(win, {
      title: `Export ${format.toUpperCase()}`,
      defaultPath: join(app.getPath('downloads'), exportFileName(snapshot.frame, ext)),
      filters: [{ name: format.toUpperCase(), extensions: [ext] }]
    })
    if (result.canceled || !result.filePath) return { status: 'canceled' }
    exportActivity({ status: 'busy', message: `Exporting ${format.toUpperCase()}…` })
    const file = await buildExport(snapshot, format)
    writeExport(result.filePath, file.bytes)
    return { status: 'saved', path: result.filePath, format, bytes: file.bytes.length, width: file.width, height: file.height }
  })
}

function copyImageFromUi(id: unknown): Promise<CopyImageResult> {
  return uiExportAction('Copying PNG…', () => copyFrameImage(exportSnapshot(id)))
}

function exportSelection(format: unknown): void {
  if (uiExportInFlight) return
  if (ws.store.selection.length !== 1) return exportActivity({ status: 'error', message: 'Select one frame to export.' })
  void exportFromUi(ws.store.selection[0], format)
}

function buildMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        role: 'appMenu',
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => send('settings:open') },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideOthers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'File',
        submenu: [
          { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: () => newUntitled() },
          { label: 'New Project in Folder…', accelerator: 'CmdOrCtrl+Shift+N', click: () => void chooseProject(true) },
          { label: 'Open Project…', accelerator: 'CmdOrCtrl+O', click: () => void chooseProject(false) },
          { label: 'Show Project in Finder', click: () => shell.openPath(ws.store.dir) },
          { label: 'Export Selection', submenu: EXPORT_FORMATS.map((format) => ({ label: format.toUpperCase(), click: () => exportSelection(format) })) },
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
          { label: 'Cut', accelerator: 'CmdOrCtrl+X', click: () => edit('cut') },
          { label: 'Copy', accelerator: 'CmdOrCtrl+C', click: () => edit('copy') },
          { label: 'Paste', accelerator: 'CmdOrCtrl+V', click: () => edit('paste') },
          { label: 'Select All', accelerator: 'CmdOrCtrl+A', click: () => edit('selectAll') },
          { label: 'Duplicate', accelerator: 'CmdOrCtrl+D', click: () => edit('duplicate') }
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

async function listen(): Promise<void> {
  const contexts = { active: () => ws.ctx, byToken: (token: string) => [...workspaces.values()].find((w) => w.token === token)?.ctx, all: () => [ws.ctx, ...[...workspaces.values()].filter((w) => w !== ws).map((w) => w.ctx)] }
  for (let p = port; p < port + 10; p++) {
    try {
      server = await startServer(contexts, p, registry)
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

/** Isolated runs (CHALK_PROJECT_DIR) must never touch the user's agent configs or run their real CLIs. */
function connectDeps(): ConnectDeps {
  if (!process.env.CHALK_PROJECT_DIR) return { locations: configLocations(homedir()), findCli, openExternal: (url) => shell.openExternal(url) }
  const home = join(app.getPath('userData'), 'agent-home')
  const bin = process.env.CHALK_CONNECT_BIN
  return {
    locations: configLocations(home, [join(home, 'Applications')]),
    findCli: (name) => (bin && existsSync(join(bin, name)) ? join(bin, name) : null),
    openExternal: async () => {}
  }
}

function registerIpc(): void {
  const connections = createConnections(connectDeps())
  handle('connect:state', (_e, raw: unknown) => connections.state(connectAgentIdSchema.parse(raw), mcpUrl()))
  handle('connect:add', (_e, raw: unknown) => connections.connect(connectAgentIdSchema.parse(raw), mcpUrl()))
  handle('connect:learn', () => shell.openExternal(CONNECT_LEARN_URL))

  handle('init', () => ({
    doc: ws.store.doc,
    selectedElements: ws.store.selectedElements,
    project: { dir: ws.store.dir, name: basename(ws.store.dir), epoch: ws.store.projectEpoch },
    port,
    mcpUrl: mcpUrl(),
    claudePath: findCli('claude'),
    models: MODELS,
    styles: styleSummaries(),
    browser: browser.state(),
    recentUrls: config.recentUrls,
    tabs: tabs(),
    agentStatus: ws.busy ? 'running' : 'idle',
    chatHistory: ws.chats.state(),
    presence: ws.presence.state,
    codebase: codebaseState()
  }))
  handle('op', (_e, input: Op | Op[]) => {
    const ops = Array.isArray(input) ? input : [input]
    for (const op of ops) {
      if (op.type === 'add' && op.frame.kind === 'image' && !safeAssetName(op.frame.asset)) throw new Error('Unsafe image asset path.')
    }
    ws.store.dispatch(input)
  })
  handle('edit:native', (_e, command: unknown) => nativeEdit(z.enum(['copy', 'cut', 'paste', 'selectAll', 'undo', 'redo']).parse(command)))
  handle('frames:command', async (_e, command: unknown) => {
    try {
      await ws.frameCommands.run(command)
    } catch (err) {
      send('frames:error', err instanceof Error ? err.message : String(err))
    }
  })
  handle('history', (_e, direction: 'undo' | 'redo') => ws.store.travel(direction))
  handle('select', (_e, ids: FrameId[]) => {
    ws.store.selection = z.array(frameIdSchema).parse(ids).filter((id) => findFrame(ws.store.doc, id))
    ws.store.selectedElements = []
    send('element:selection', [])
    send('selection', ws.store.selection)
  })
  handle('element:select', (_e, raw: unknown) => {
    const input = z.object({ frameId: frameIdSchema, projectEpoch: z.number().int(), html: z.string(), hits: z.array(elementHitSchema).max(10000), mode: z.enum(['replace', 'add', 'toggle']) }).strict().parse(raw)
    if (input.projectEpoch !== ws.store.projectEpoch) return
    const frame = findFrame(ws.store.doc, input.frameId)
    if (frame?.kind !== 'html' || frame.html !== input.html) return
    const incoming = selectedElements(frame, input.hits)
    const next = input.mode !== 'replace' && ws.store.selectedElements[0]?.frameId === frame.id ? [...ws.store.selectedElements] : []
    for (const hit of incoming) {
      const index = next.findIndex((picked) => samePath(picked.path, hit.path))
      if (index < 0) next.push(hit)
      else if (input.mode === 'toggle') next.splice(index, 1)
    }
    ws.store.selection = [frame.id]
    ws.store.selectedElements = next
    send('selection', ws.store.selection)
    send('element:selection', next)
  })
  handle('element:delete', (_e, raw: unknown) => {
    const epoch = z.number().int().parse(raw)
    const picked = ws.store.selectedElements
    if (epoch !== ws.store.projectEpoch || !picked.length) return
    const frame = findFrame(ws.store.doc, picked[0].frameId)
    if (frame?.kind !== 'html') return
    const html = removeElements(frame, picked.map((element) => element.path))
    ws.store.selectedElements = []
    send('element:selection', [])
    ws.store.dispatch({ type: 'patch', id: frame.id, patch: { html } })
  })
  handle('browser', async (_e, action: string, arg?: unknown) => {
    switch (action) {
      case 'device':
        return browser.setDevice(z.enum(BROWSER_DEVICE_IDS).parse(arg))
      case 'bounds':
        return browser.setBounds(z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite().nonnegative(), height: z.number().finite().nonnegative() }).parse(arg))
      case 'visible':
        return browser.setVisible(!!arg)
      case 'obscured':
        return browser.setObscured(z.boolean().parse(arg))
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
      case 'clearRecent':
        updateConfig({ recentUrls: [] })
        return send('browser:recent', [])
      case 'clearPick':
        ws.store.browserPick = null
        return send('browser:pick', null)
      case 'capture': {
        const { TOOLS } = await import('./tools')
        return TOOLS.find((t) => t.name === 'browser_capture_to_canvas')!.run({ full_page: true } as never, ws.ctx)
      }
    }
  })
  handle('agent:send', (_e, raw: unknown) => {
    if (ws.busy || chatDialogOpen) return
    try {
      const { text, model, style, parallel } = z.object({ text: z.string().trim().min(1), model: z.string(), style: styleChoiceSchema.nullish(), parallel: runSettingsSchema.optional() }).strict().parse(raw)
      const resolved = style ? loadStyle({ name: style.id, variant: style.variant }) : null
      if (style && resolved?.id !== style.id) throw new Error('Style attachments require a canonical style ID from the catalog.')
      const selectedFrames = ws.store.selection.flatMap((id) => findFrame(ws.store.doc, id) ?? [])
      const turn = { codebase: ws.codebase ? { name: ws.codebase.name, hasBrief: hasProductBrief(ws.dir) } : undefined, selectedFrames, selectedElements: ws.store.selectedElements, browserPick: ws.store.browserPick, browserUrl: browser.state().url, style: resolved, priorRuns: priorRunNote(ws.chats.current.events, ws.store.doc.frames) ?? undefined }
      if (!parallel || isOrdinary(parallel)) {
        void ws.agent.send(text, turn, model)
        return
      }
      // The run belongs to this tab even if the user switches away; it reports to the window only while visible.
      const owner = ws
      const own = (channel: string, payload?: unknown) => { if (owner === ws) send(channel, payload) }
      const chatId = owner.chats.current.id
      const emit = (event: AgentEvent) => {
        if (owner.chats.current.id !== chatId) return
        owner.chats.append(event)
        own('agent:event', event)
      }
      const activeRun = new Run({ store: owner.store, registry, emit, capturePage, measure: owner.ctx.measure, origin: owner.ctx.origin, photoKeys, live: owner.live,
        focus: frameId => own('focus', { mode: 'canvas', frameId, source: 'agent' }),
        progress: progress => {
          own('run:progress', progress)
          owner.presence.dispatch({ type: 'activity', activity: progress.activity })
        }
      }, parallel, text, turn, model)
      owner.run = activeRun
      own('agent:status', 'running')
      send('tabs', tabs())
      owner.presence.dispatch({ type: 'turn-start', since: Date.now(), model: model || null })
      void activeRun.start().finally(() => {
        if (owner.run !== activeRun) return
        owner.chats.flush()
        owner.presence.dispatch({ type: 'turn-end' })
        own('agent:status', 'idle')
        send('tabs', tabs())
      })
    } catch (error) {
      ws.chats.append({ type: 'error', text: `Invalid style or message: ${error instanceof Error ? error.message : String(error)}` })
    }
  })
  handle('run:show', (_e, raw: unknown) => {
    const id = frameIdSchema.parse(raw)
    if (findFrame(ws.store.doc, id)) send('focus', { mode: 'canvas', frameId: id })
  })
  handle('agent:stop', () => ws.run?.active ? ws.run.stop() : ws.agent.stop())
  const newChat = () => {
    if (ws.busy || chatDialogOpen) return
    ws.chats.new()
    ws.agent.useSession()
  }
  handle('agent:reset', newChat)
  handle('chats:new', newChat)
  handle('chats:list', () => ws.chats.state())
  handle('chats:open', (_e, raw: unknown) => {
    const id = chatIdSchema.parse(raw)
    if (ws.busy || chatDialogOpen) return
    ws.chats.open(id)
    ws.agent.useSession(ws.chats.current.sessionId)
  })
  handle('chats:delete', async (_e, raw: unknown) => {
    const id = chatIdSchema.parse(raw)
    if (!win || ws.busy || chatDialogOpen || !ws.chats.state().chats.some((chat) => chat.id === id)) return
    chatDialogOpen = true
    try {
      const { response } = await dialog.showMessageBox(win, { type: 'warning', message: 'Delete this chat?', detail: 'This removes its saved messages from this project.', buttons: ['Cancel', 'Delete Chat'], defaultId: 0, cancelId: 0, noLink: true })
      if (response !== 1) return
      ws.chats.delete(id)
      ws.agent.useSession(ws.chats.current.sessionId)
    } finally {
      chatDialogOpen = false
    }
  })
  handle('chats:clear', async () => {
    if (!win || ws.busy || chatDialogOpen) return
    chatDialogOpen = true
    try {
      const { response } = await dialog.showMessageBox(win, { type: 'warning', message: 'Clear Agent History?', detail: 'This removes all saved chats from this project.', buttons: ['Cancel', 'Clear Agent History'], defaultId: 0, cancelId: 0, noLink: true })
      if (response !== 1) return
      ws.chats.clear()
      ws.agent.useSession()
    } finally {
      chatDialogOpen = false
    }
  })
  handle('frame', async (_e, rawAction: unknown, rawId: unknown) => {
    const action = z.enum(['copy', 'open']).parse(rawAction)
    const f = findFrame(ws.store.doc, z.string().parse(rawId))
    if (!f) return
    const html = f.kind === 'html' ? frameDocument(f) : ''
    if (action === 'copy') clipboard.writeText(html)
    if (action === 'open') void shell.openExternal(`http://127.0.0.1:${port}/frame/${f.id}`)
  })
  handle('frame:export', (_e, id: unknown, format: unknown) => exportFromUi(id, format))
  handle('frame:copy-image', (_e, id: unknown) => copyImageFromUi(id))
  handle('clipboard', (_e, text: string) => clipboard.writeText(text))
  handle('codebase', async (_e, action: unknown) => {
    const parsed = z.enum(['get', 'choose', 'clear']).parse(action)
    if (parsed === 'choose') await chooseCodebase()
    if (parsed === 'clear') {
      ws.codebase = null
      saveCodebase(ws.dir, null)
      send('codebase', null)
    }
    return codebaseState()
  })
  handle('settings:photoKeys', (_e, next?: unknown) => {
    if (next !== undefined) {
      const keys = z.object({ unsplash: z.string().trim().max(200), pexels: z.string().trim().max(200) }).parse(next)
      updateConfig({ photoKeys: { unsplash: keys.unsplash || undefined, pexels: keys.pexels || undefined } })
    }
    const k = photoKeys()
    return { unsplash: config.photoKeys?.unsplash ?? '', pexels: config.photoKeys?.pexels ?? '', active: k.unsplash ? 'unsplash' : k.pexels ? 'pexels' : 'wikimedia' }
  })
  handle('project', (_e, action: 'new' | 'open' | 'reveal' | 'switch' | 'close', dir?: string) => {
    if (action === 'reveal') return shell.openPath(ws.store.dir)
    if (action === 'new') return newUntitled()
    if (action === 'open') return chooseProject(false)
    if (action === 'switch' && dir && config.projects.includes(dir)) return openProject(dir)
    if (action === 'close' && dir) return closeProject(dir)
  })
  handle('image:add', (_e, { name, bytes, x, y }: { name: string; bytes: Uint8Array; x: number; y: number }) => {
    const img = nativeImage.createFromBuffer(Buffer.from(bytes))
    if (img.isEmpty()) throw new Error('Not an image Chalk can read.')
    const id = randomUUID().slice(0, 8) as FrameId
    const asset = `${id}.png`
    writeFileSync(ws.store.assetPath(asset), img.toPNG())
    const { width, height } = img.getSize()
    ws.store.dispatch({ type: 'add', frame: { id, kind: 'image', asset, name: name.replace(/\.[a-z]+$/i, ''), x: Math.round(x), y: Math.round(y), width, height, updatedAt: Date.now() } })
    return id
  })
}

async function capturePage(): Promise<PageCapture | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = browser.state()
    const version = browser.captureVersion()
    if (!/^https?:/.test(before.url)) {
      if (attempt) throw new Error('The visible browser left its HTTP(S) page during reference capture.')
      return null
    }
    try {
      const snapshot = await browser.snapshot()
      const styles = await browser.extractStyles()
      const shot = await browser.screenshot({ fullPage: true })
      const after = browser.state()
      if (version !== browser.captureVersion() || before.url !== after.url || snapshot.url !== before.url) {
        if (!attempt) continue
        throw new Error('The visible browser navigated during reference capture. Send again when the page is ready.')
      }
      return Object.freeze({ url: before.url, title: snapshot.title, tree: snapshot.tree, styles: structuredClone(styles), png: Buffer.from(shot.png), width: shot.width, height: shot.height })
    } catch (error) {
      if (!attempt && (version !== browser.captureVersion() || browser.state().url !== before.url)) continue
      throw new Error(`Could not capture the visible browser reference: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  throw new Error('The visible browser kept navigating during reference capture.')
}


function createWindow(): void {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 960,
    minHeight: 600,
    title: `${basename(ws.store.dir)} · Chalk`,
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

app.setName('Chalk')

app.whenReady().then(async () => {
  config = process.env.CHALK_PROJECT_DIR ? { projects: [], recentUrls: [] } : readConfig()
  const saved = config.projectDir
  const fallback = join(homedir(), 'Chalk', 'Untitled')
  const first = process.env.CHALK_PROJECT_DIR || (saved && existsSync(saved) ? saved : fallback)
  updateConfig({ projectDir: first, projects: [...new Set([...config.projects.filter((p) => existsSync(p)), first])] })

  browser = new Browser(config.browserViewport)
  openProject(first)

  browser.on('state', (s) => {
    if (config.browserViewport !== s.device) updateConfig({ browserViewport: s.device })
    send('browser:state', s)
  })
  browser.view.webContents.on('did-navigate', (_e, url) => rememberUrl(url))
  browser.on('pick', (pick) => {
    ws.store.browserPick = pick
    send('browser:pick', pick)
  })
  await listen()
  registerIpc()
  buildMenu()
  createWindow()
})

app.on('before-quit', () => {
  for (const w of workspaces.values()) {
    w.flush()
    w.stop()
  }
  server?.close()
})
app.on('window-all-closed', () => app.quit())
