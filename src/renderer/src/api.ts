import type { EaselApi } from '../../preload'
import type { AgentEvent, AgentStatus, BrowserPick, Doc, FrameId, Op } from '../../shared/model'

declare global {
  interface Window {
    easel: EaselApi
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
  agentStatus: AgentStatus
}

export type FocusTarget = { mode: 'canvas'; frameId?: FrameId } | { mode: 'browser' }

const e = () => window.easel

export const api = {
  init: (): Promise<InitState> => e().invoke('init') as Promise<InitState>,
  op: (op: Op) => e().invoke('op', op),
  history: (direction: 'undo' | 'redo') => e().invoke('history', direction),
  select: (ids: FrameId[]) => e().invoke('select', ids),
  browser: (action: string, arg?: unknown) => e().invoke('browser', action, arg),
  sendAgent: (text: string, model: string) => e().invoke('agent:send', { text, model }),
  stopAgent: () => e().invoke('agent:stop'),
  resetAgent: () => e().invoke('agent:reset'),
  frame: (action: 'copy' | 'export' | 'open', id: string) => e().invoke('frame', action, id),
  copy: (text: string) => e().invoke('clipboard', text),
  project: (action: 'new' | 'open' | 'reveal') => e().invoke('project', action),
  on: {
    doc: (fn: (d: Doc) => void) => e().on('doc', fn),
    project: (fn: (p: { dir: string; name: string }) => void) => e().on('project', fn),
    browserState: (fn: (s: BrowserState) => void) => e().on('browser:state', fn),
    browserPick: (fn: (p: BrowserPick | null) => void) => e().on('browser:pick', fn),
    agentEvent: (fn: (ev: AgentEvent) => void) => e().on('agent:event', fn),
    agentStatus: (fn: (s: AgentStatus) => void) => e().on('agent:status', fn),
    focus: (fn: (t: FocusTarget) => void) => e().on('focus', fn),
    history: (fn: (direction: 'undo' | 'redo') => void) => e().on('history', fn)
  }
}
