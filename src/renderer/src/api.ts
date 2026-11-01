import type { RunSettings, RunProgress, LiveRun } from '../../shared/run'
import type { AgentConnection, ConnectAgentId } from '../../shared/connectAgents'
import type { StyleChoice, StyleSummary } from '../../shared/styles'
import type { PresenceState } from '../../shared/presence'
import type { ElementHit, ElementSelectionMode } from '../../shared/elementSelection'
import type { ChatHistoryState } from '../../shared/chats'
import type { ChalkApi } from '../../preload'
import type { AgentStatus, BrowserPick, BrowserState, CopyImageResult, Doc, ExportActivity, ExportFormat, ExportResult, EditCommand, FrameCommand, NativeEditCommand, FrameId, Op, SelectedElement } from '../../shared/model'

declare global {
  interface Window {
    chalk: ChalkApi
  }
}

export type { BrowserState } from '../../shared/model'

export interface InitState {
  doc: Doc
  selectedElements: SelectedElement[]
  project: { dir: string; name: string; epoch: number }
  port: number
  mcpUrl: string
  claudePath: string | null
  styles: StyleSummary[]
  models: readonly { id: string; label: string }[]
  browser: BrowserState
  recentUrls: string[]
  tabs: ProjectTab[]
  chatHistory: ChatHistoryState
  agentStatus: AgentStatus
  presence: PresenceState
}

export interface ProjectTab {
  dir: string
  name: string
  /** An agent or design run is working in this tab, possibly in the background. */
  busy?: boolean
}

export type FocusTarget = { mode: 'canvas'; frameId?: FrameId; source?: 'agent' } | { mode: 'browser'; source?: 'agent' }

const e = () => window.chalk

export const api = {
  connectState: (id: ConnectAgentId): Promise<AgentConnection> => e().invoke('connect:state', id) as Promise<AgentConnection>,
  connectAgent: (id: ConnectAgentId): Promise<AgentConnection> => e().invoke('connect:add', id) as Promise<AgentConnection>,
  connectLearnMore: () => e().invoke('connect:learn'),
  init: (): Promise<InitState> => e().invoke('init') as Promise<InitState>,
  op: (op: Op | Op[]) => e().invoke('op', op),
  frameCommand: (command: FrameCommand) => e().invoke('frames:command', command),
  nativeEdit: (command: NativeEditCommand) => e().invoke('edit:native', command),
  history: (direction: 'undo' | 'redo') => e().invoke('history', direction),
  selectElements: (frame: { id: FrameId; html: string }, projectEpoch: number, hits: ElementHit[], mode: ElementSelectionMode = 'replace') => e().invoke('element:select', { frameId: frame.id, html: frame.html, projectEpoch, hits, mode }),
  deleteElements: (projectEpoch: number) => e().invoke('element:delete', projectEpoch),
  select: (ids: FrameId[]) => e().invoke('select', ids),
  browser: (action: string, arg?: unknown) => e().invoke('browser', action, arg),
  sendAgent: (text: string, model: string, style: StyleChoice | null, parallel?: RunSettings) => e().invoke('agent:send', { text, model, style, ...(parallel ? { parallel } : {}) }),
  showRunFrame: (id: FrameId) => e().invoke('run:show', id),
  stopAgent: () => e().invoke('agent:stop'),
  newChat: () => e().invoke('chats:new'),
  openChat: (id: string) => e().invoke('chats:open', id),
  deleteChat: (id: string) => e().invoke('chats:delete', id),
  clearChats: () => e().invoke('chats:clear'),
  frame: (action: 'copy' | 'open', id: string) => e().invoke('frame', action, id),
  exportFrame: (id: FrameId, format: ExportFormat) => e().invoke('frame:export', id, format) as Promise<ExportResult>,
  copyFrameImage: (id: FrameId) => e().invoke('frame:copy-image', id) as Promise<CopyImageResult>,
  copy: (text: string) => e().invoke('clipboard', text),
  photoKeys: (next?: { unsplash: string; pexels: string }) =>
    e().invoke('settings:photoKeys', next) as Promise<{ unsplash: string; pexels: string; active: 'unsplash' | 'pexels' | 'wikimedia' }>,
  project: (action: 'new' | 'open' | 'reveal' | 'switch' | 'close', dir?: string) => e().invoke('project', action, dir),
  addImage: (img: { name: string; bytes: Uint8Array; x: number; y: number }) => e().invoke('image:add', img),
  on: {
    runProgress: (fn: (p: RunProgress) => void) => e().on('run:progress', fn),
    runLive: (fn: (s: LiveRun) => void) => e().on('run:live', fn),
    edit: (fn: (command: EditCommand) => void) => e().on('edit', fn),
    elementSelection: (fn: (element: SelectedElement[]) => void) => e().on('element:selection', fn),
    selection: (fn: (ids: FrameId[]) => void) => e().on('selection', fn),
    frameError: (fn: (message: string) => void) => e().on('frames:error', fn),
    exportActivity: (fn: (activity: ExportActivity) => void) => e().on('export:activity', fn),
    doc: (fn: (d: Doc) => void) => e().on('doc', fn),
    project: (fn: (p: InitState['project']) => void) => e().on('project', fn),
    browserState: (fn: (s: BrowserState) => void) => e().on('browser:state', fn),
    browserPick: (fn: (p: BrowserPick | null) => void) => e().on('browser:pick', fn),
    chatHistory: (fn: (state: ChatHistoryState) => void) => e().on('chats:state', fn),
    agentStatus: (fn: (s: AgentStatus) => void) => e().on('agent:status', fn),
    presence: (fn: (state: PresenceState) => void) => e().on('presence', fn),
    focus: (fn: (t: FocusTarget) => void) => e().on('focus', fn),
    history: (fn: (direction: 'undo' | 'redo') => void) => e().on('history', fn),
    settingsOpen: (fn: () => void) => e().on('settings:open', fn),
    tabs: (fn: (t: ProjectTab[]) => void) => e().on('tabs', fn),
    recentUrls: (fn: (u: string[]) => void) => e().on('browser:recent', fn)
  }
}
