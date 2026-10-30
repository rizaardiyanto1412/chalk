import type { ChalkApi } from '../../preload'
import type { AgentEvent, AgentStatus, BrowserPick, CopyImageResult, Doc, ExportActivity, ExportFormat, ExportResult, FrameId, Op } from '../../shared/model'

declare global {
  interface Window {
    chalk: ChalkApi
  }
}

export interface BrowserState {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  picking: boolean
}

export interface InitState {
  doc: Doc
  project: { dir: string; name: string }
  port: number
  mcpUrl: string
  claudePath: string | null
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
  op: (op: Op) => e().invoke('op', op),
  history: (direction: 'undo' | 'redo') => e().invoke('history', direction),
  select: (ids: FrameId[]) => e().invoke('select', ids),
  browser: (action: string, arg?: unknown) => e().invoke('browser', action, arg),
  sendAgent: (text: string, model: string) => e().invoke('agent:send', { text, model }),
  stopAgent: () => e().invoke('agent:stop'),
  resetAgent: () => e().invoke('agent:reset'),
  frame: (action: 'copy' | 'open', id: string) => e().invoke('frame', action, id),
  exportFrame: (id: FrameId, format: ExportFormat) => e().invoke('frame:export', id, format) as Promise<ExportResult>,
  copyFrameImage: (id: FrameId) => e().invoke('frame:copy-image', id) as Promise<CopyImageResult>,
  copy: (text: string) => e().invoke('clipboard', text),
  project: (action: 'new' | 'open' | 'reveal' | 'switch' | 'close', dir?: string) => e().invoke('project', action, dir),
  addImage: (img: { name: string; bytes: Uint8Array; x: number; y: number }) => e().invoke('image:add', img),
  on: {
    exportActivity: (fn: (activity: ExportActivity) => void) => e().on('export:activity', fn),
    doc: (fn: (d: Doc) => void) => e().on('doc', fn),
    project: (fn: (p: { dir: string; name: string }) => void) => e().on('project', fn),
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
