import { randomUUID } from 'node:crypto'
import type { AgentEvent } from '../shared/model'
import { activityForTool, type PresenceState } from '../shared/presence'
import { Store } from './store'
import { ChatHistory } from './chats'
import { FrameCommands } from './frameCommands'
import { Agent } from './agent'
import { Presence } from './presence'
import { LiveRunView } from './liveRun'
import { savedCodebase, type Codebase } from './codebase'
import { notePhotoUse, type PhotoKeys } from './photos'
import type { Browser } from './browser'
import type { Run } from './run'
import type { ToolContext } from './tools'

export interface WorkspaceDeps {
  browser: () => Browser
  origin: () => string
  photoKeys: () => PhotoKeys
  measure: ToolContext['measure']
  /** Send to the window only while this workspace is the visible tab. */
  send: (ws: Workspace, channel: string, payload?: unknown) => void
  /** Tell the tab bar that a workspace started or stopped working. */
  busyChanged: () => void
  isActive: (ws: Workspace) => boolean
}

/**
 * One open project tab: its canvas, chats, in-app agent, parallel run, and agent presence. Workspaces keep running
 * while another tab is visible; they only talk to the window when they are the visible tab.
 */
export class Workspace {
  readonly token = randomUUID()
  readonly store = new Store()
  readonly presence = new Presence()
  readonly chats: ChatHistory
  readonly live: LiveRunView
  readonly agent: Agent
  readonly frameCommands: FrameCommands
  readonly ctx: ToolContext
  run: Run | null = null
  codebase: Codebase | null

  constructor(readonly dir: string, private readonly deps: WorkspaceDeps) {
    const send = (channel: string, payload?: unknown) => deps.send(this, channel, payload)
    this.store.open(dir)
    this.codebase = savedCodebase(dir)
    this.chats = new ChatHistory((state) => send('chats:state', state))
    this.chats.openProject(dir)
    this.live = new LiveRunView(() => this.store.doc, (state) => send('run:live', state))
    this.frameCommands = new FrameCommands(this.store, (ids, focus) => {
      this.store.selection = ids
      this.store.selectedElements = []
      send('element:selection', [])
      send('selection', ids)
      if (focus && ids[0]) send('focus', { mode: 'canvas', frameId: ids[0] })
    })
    this.ctx = {
      store: this.store,
      browser: deps.browser(),
      presence: this.presence,
      origin: deps.origin,
      photoKeys: deps.photoKeys,
      frameUrl: (f) => `${deps.origin()}/frame/${f.id}?v=${f.updatedAt}`,
      measure: deps.measure,
      codebase: () => this.codebase,
      focus: (target) => send('focus', { ...target, source: 'agent' })
    }
    this.agent = new Agent(() => `${deps.origin()}/mcp/project/${this.token}`, () => this.store.dir)
    this.agent.useSession(this.chats.current.sessionId)
    this.agent.on('session', (id: string | undefined) => this.chats.setSession(id))
    this.agent.on('event', (e: AgentEvent) => {
      this.chats.append(e)
      if (e.type === 'start') this.presence.dispatch({ type: 'turn-start', since: Date.now(), model: e.model })
      if (e.type === 'model') this.presence.dispatch({ type: 'model', model: e.model })
      if (e.type === 'tool') this.presence.dispatch({ type: 'activity', activity: activityForTool(e.name) })
      send('agent:event', e)
    })
    this.agent.on('status', (s) => {
      if (s === 'idle') {
        this.chats.flush()
        this.presence.dispatch({ type: 'turn-end' })
      }
      send('agent:status', s)
      deps.busyChanged()
    })
    this.store.on('change', (doc) => {
      for (const f of doc.frames) if (f.kind === 'html') notePhotoUse(deps.photoKeys(), f.html)
      send('doc', doc)
      send('element:selection', this.store.selectedElements)
      send('selection', this.store.selection)
    })
    this.presence.on('change', (state: PresenceState) => {
      send('presence', state)
      if (deps.isActive(this)) void deps.browser().present(state.visual).catch((error) => console.error('Browser presence failed', error))
    })
  }

  get busy(): boolean {
    return this.agent.status === 'running' || !!this.run?.active
  }

  flush(): void {
    this.store.flush()
    this.chats.flush()
  }

  /** Retire an idle tab: save, then refuse any late writes from commands that were still in flight. */
  close(): void {
    this.flush()
    this.store.close()
  }

  stop(): void {
    this.run?.stop()
    this.agent.stop()
  }
}
