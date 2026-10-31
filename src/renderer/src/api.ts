import type { StyleChoice, StyleSummary } from '../../shared/styles'
import type { ChalkApi } from '../../preload'
import type { AgentEvent, AgentStatus, BrowserPick, BrowserState, CopyImageResult, Doc, ExportActivity, ExportFormat, ExportResult, EditCommand, FrameCommand, NativeEditCommand, FrameId, Op } from '../../shared/model'

declare global {
  interface Window {
    chalk: ChalkApi
  }
}

export type { BrowserState } from '../../shared/model'

export interface InitState {
  doc: Doc
  project: { dir: string; name: string; epoch: number }
  port: number
  mcpUrl: string
  claudePath: string | null
  styles: StyleSummary[]
  models: readonly { id: string; label: string }[]
  browser: BrowserState
  recentUrls: string[]
  tabs: ProjectTab[]
  agentStatus: AgentStatus
}

export interface ProjectTab {
  dir: string
  name: string
}

export type FocusTarget = { mode: 'canvas'; frameId?: FrameId } | { mode: 'browser' }

const e = () => window.chalk

export const api = {
  init: (): Promise<InitState> => e().invoke('init') as Promise<InitState>,
  op: (op: Op | Op[]) => e().invoke('op', op),
  frameCommand: (command: FrameCommand) => e().invoke('frames:command', command),
  nativeEdit: (command: NativeEditCommand) => e().invoke('edit:native', command),
  history: (direction: 'undo' | 'redo') => e().invoke('history', direction),
  select: (ids: FrameId[]) => e().invoke('select', ids),
  browser: (action: string, arg?: unknown) => e().invoke('browser', action, arg),
  sendAgent: (text: string, model: string, style: StyleChoice | null) => e().invoke('agent:send', { text, model, style }),
  stopAgent: () => e().invoke('agent:stop'),
  resetAgent: () => e().invoke('agent:reset'),
  frame: (action: 'copy' | 'open', id: string) => e().invoke('frame', action, id),
  exportFrame: (id: FrameId, format: ExportFormat) => e().invoke('frame:export', id, format) as Promise<ExportResult>,
  copyFrameImage: (id: FrameId) => e().invoke('frame:copy-image', id) as Promise<CopyImageResult>,
  copy: (text: string) => e().invoke('clipboard', text),
  project: (action: 'new' | 'open' | 'reveal' | 'switch' | 'close', dir?: string) => e().invoke('project', action, dir),
  addImage: (img: { name: string; bytes: Uint8Array; x: number; y: number }) => e().invoke('image:add', img),
  on: {
    edit: (fn: (command: EditCommand) => void) => e().on('edit', fn),
    selection: (fn: (ids: FrameId[]) => void) => e().on('selection', fn),
    frameError: (fn: (message: string) => void) => e().on('frames:error', fn),
    exportActivity: (fn: (activity: ExportActivity) => void) => e().on('export:activity', fn),
    doc: (fn: (d: Doc) => void) => e().on('doc', fn),
    project: (fn: (p: InitState['project']) => void) => e().on('project', fn),
    browserState: (fn: (s: BrowserState) => void) => e().on('browser:state', fn),
    browserPick: (fn: (p: BrowserPick | null) => void) => e().on('browser:pick', fn),
    agentEvent: (fn: (ev: AgentEvent) => void) => e().on('agent:event', fn),
    agentStatus: (fn: (s: AgentStatus) => void) => e().on('agent:status', fn),
    focus: (fn: (t: FocusTarget) => void) => e().on('focus', fn),
    history: (fn: (direction: 'undo' | 'redo') => void) => e().on('history', fn),
    tabs: (fn: (t: ProjectTab[]) => void) => e().on('tabs', fn),
    recentUrls: (fn: (u: string[]) => void) => e().on('browser:recent', fn)
  }
}
