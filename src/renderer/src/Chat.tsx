import { useEffect, useRef, useState } from 'react'
import type { ChatHistoryState } from '../../shared/chats'
import type { AgentEvent, AgentStatus, BrowserPick, Frame, SelectedElement } from '../../shared/model'
import { api } from './api'
import { Icon } from './icons'
import { Markdown } from './Markdown'
import { elapsedPresence, type PresenceState } from '../../shared/presence'

const TOOL_LABELS: Record<string, string> = {
  get_canvas: 'Read canvas',
  get_frame: 'Read frame',
  create_frame: 'Created frame',
  update_frame: 'Updated frame',
  edit_frame: 'Edited frame',
  delete_frame: 'Deleted frame',
  screenshot_frame: 'Reviewed frame',
  review_frame: 'Checked frame layout',
  get_style: 'Explored visual style',
  get_design_guidelines: 'Read design guide',
  browser_state: 'Checked browser',
  browser_navigate: 'Opened',
  browser_snapshot: 'Read page structure',
  browser_click: 'Clicked',
  browser_type: 'Typed',
  browser_scroll: 'Scrolled',
  browser_back: 'Went back',
  browser_screenshot: 'Took screenshot',
  browser_capture_to_canvas: 'Captured page to canvas',
  browser_extract_styles: 'Measured page styles',
  WebFetch: 'Fetched',
  WebSearch: 'Searched'
}

interface Props {
  history: ChatHistoryState
  status: AgentStatus
  presence: PresenceState
  models: readonly { id: string; label: string }[]
  claudePath: string | null
  selectedFrames: Frame[]
  selectedElements: SelectedElement[]
  pick: BrowserPick | null
  onClearSelection: () => void
  onNewChat: () => void
}

const SUGGESTIONS = [
  'Pricing page for a developer tools startup',
  'Analytics dashboard for a solar energy company',
  'Mobile onboarding for a language learning app',
  'Settings page for a team chat app',
  'Landing page for a specialty coffee subscription',
  'Recipe detail page for a cooking magazine'
]

export function Chat({ history, status, presence, models, claudePath, selectedFrames, selectedElements, pick, onClearSelection, onNewChat }: Props) {
  const events = history.current.events
  const [menuOpen, setMenuOpen] = useState(false)
  const head = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [text, setText] = useState('')
  const [model, setModel] = useState(() => localStorage.getItem('chalk.model') ?? '')
  const list = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const running = status === 'running'

  useEffect(() => {
    setMenuOpen(false)
  }, [history.current.id, running])

  useEffect(() => {
    if (!menuOpen) return
    const close = () => setMenuOpen(false)
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !head.current?.contains(event.target)) close()
    }
    window.addEventListener('blur', close)
    document.addEventListener('pointerdown', outside)
    return () => {
      window.removeEventListener('blur', close)
      document.removeEventListener('pointerdown', outside)
    }
  }, [menuOpen])

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [events.length, running])

  useEffect(() => {
    const el = box.current!
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [text])

  const send = (t: string) => {
    if (!t.trim() || running) return
    void api.sendAgent(t.trim(), model, null)
    setText('')
  }

  return (
    <div className="chat">
      <div
        className="chat-head"
        ref={head}
        onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setMenuOpen(false) }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setMenuOpen(false)
            trigger.current?.focus()
          } else if (menuOpen && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const buttons = [...(head.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)') ?? [])]
            const current = buttons.findIndex((button) => button === document.activeElement)
            const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowUp' ? -1 : 1) + buttons.length) % buttons.length
            buttons[next]?.focus()
          }
        }}
      >
        <button className="chat-session" ref={trigger} title={running ? 'Stop the current turn to switch chats' : history.current.title} aria-label="Chat history" aria-haspopup="menu" aria-expanded={menuOpen} disabled={running} onClick={() => setMenuOpen(!menuOpen)}>
          <span>{history.current.title}</span><Icon name="chevronDown" size={13} />
        </button>
        <button className="chat-new" onClick={onNewChat} disabled={running}><Icon name="plus" size={13} /> New</button>
        {menuOpen && (
          <div className="chat-history" role="menu" aria-label="Chat history">
            <div className="chat-history-list">
              {history.chats.length === 0 && <p className="chat-history-empty">No saved chats yet</p>}
              {chatGroups(history.chats).map(({ label, chats }) => chats.length > 0 && (
                <div className="chat-history-group" role="group" aria-label={label} key={label}>
                  <div className="chat-history-heading">{label}</div>
                  {chats.map((chat) => (
                    <div className={`chat-history-row ${chat.id === history.current.id ? 'is-current' : ''}`} key={chat.id}>
                      <button className="chat-history-open" role="menuitemradio" aria-checked={chat.id === history.current.id} title={chat.title} onClick={() => { setMenuOpen(false); void api.openChat(chat.id) }}>
                        <span>{chat.title}</span>
                      </button>
                      <button className="chat-history-delete" role="menuitem" aria-label={`Delete chat: ${chat.title}`} title="Delete chat" onClick={() => { setMenuOpen(false); void api.deleteChat(chat.id) }}><Icon name="trash" size={13} /></button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <button className="chat-history-clear" role="menuitem" disabled={history.chats.length === 0} onClick={() => { setMenuOpen(false); void api.clearChats() }}>Clear Agent History</button>
          </div>
        )}
      </div>

      <div className="messages" ref={list}>
        {events.length === 0 && (
          <div className="agent-empty">
            <h4>Ask me to design anything</h4>
            <div className="suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} onClick={() => send(s)} disabled={running || !claudePath}>{s}</button>
              ))}
            </div>
            <h5>Redesign a live page</h5>
            <p>Open the browser on the right, go to any page, and ask for a redesign. Use the pointer to pick one part.</p>
            <h5>Build it in code</h5>
            <p>Connect Claude Code, select a frame, and ask Claude to build it in React, Svelte, Next.js, or your own stack.</p>
            <h5>Bring references</h5>
            <p>Drop a PNG or JPG onto the canvas, select it, and ask the agent to design in that style.</p>
          </div>
        )}
        {events.map((e, i) => <Message key={i} ev={e} />)}
        <AgentPresence presence={presence} models={models} />
      </div>

      {!claudePath && (
        <div className="warn"><Icon name="alert" size={14} /> Claude Code is not installed. Install it and run <code>claude</code> once to sign in.</div>
      )}

      <div className="composer">
        {(selectedFrames.length > 0 || pick) && (
          <div className="context-chips">
            {selectedFrames.map((f) => (
              <span key={f.id} className="chip"><Icon name={f.kind === 'image' ? 'image' : 'frame'} size={12} /> {f.name}</span>
            ))}
            {selectedElements.length > 0 && <span className="chip is-pick element-chip" title={selectedElements.map((element) => `body/${element.path.join('/')}`).join(', ')}>
              <Icon name="pointer" size={12} /> {selectedElements.length > 1 ? `${selectedElements.length} elements` : `<${selectedElements[0].tag}> ${selectedElements[0].text.slice(0, 28)}`}
            </span>}
            {pick && (
              <span className="chip is-pick" title={pick.selector}>
                <Icon name="pointer" size={12} /> &lt;{pick.tag}&gt; {pick.text.slice(0, 28) || pick.selector}
                <button onClick={() => api.browser('clearPick')}><Icon name="x" size={11} /></button>
              </span>
            )}
            {selectedFrames.length > 0 && <button className="chip-clear" onClick={onClearSelection}>Clear</button>}
          </div>
        )}
        <div className="input-box">
          <textarea
            ref={box}
            rows={2}
            value={text}
            placeholder={selectedFrames.length ? 'Ask for a change to the selection…' : pick ? 'What should change in the picked element?' : 'Design anything…'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send(text)
              }
            }}
          />
          <div className="input-foot">
            <span className="input-hint">{running ? 'Working…' : 'Enter to send'}</span>
            <select
              value={model}
              onChange={(e) => {
                setModel(e.target.value)
                localStorage.setItem('chalk.model', e.target.value)
              }}
              title="Claude model"
            >
              {models.map((m) => <option key={m.id} value={m.id}>{m.label === 'Default' ? 'Default model' : m.label}</option>)}
            </select>
            {running ? (
              <button className="send is-stop" onClick={() => api.stopAgent()} title="Stop"><Icon name="stop" size={12} /></button>
            ) : (
              <button className="send" onClick={() => send(text)} disabled={!text.trim()} title="Send (Enter)"><Icon name="send" size={14} /></button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function AgentPresence({ presence, models }: Pick<Props, 'presence' | 'models'>) {
  const active = presence.turn ?? (presence.visual.phase === 'active' && presence.visual.operation === 'running' ? { ...presence.visual, model: null } : null)
  const since = active?.since
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (since === undefined) return
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [since])
  if (!active) return null
  const model = models.find((entry) => entry.id === active.model)?.label ?? active.model
  return <div className="agent-presence" role="status">
    <span className="presence-dot" />
    <strong>Chalk</strong>
    {model && <span className="presence-model" title={model}>{model}</span>}
    <span className="presence-activity">{active.activity}</span>
    <span className="presence-elapsed" aria-label="Elapsed time">{elapsedPresence(active.since, now)}</span>
  </div>
}

function Message({ ev }: { ev: AgentEvent }) {
  switch (ev.type) {
    case 'start':
    case 'model':
      return null
    case 'user':
      return <div className="msg-user">{ev.text}</div>
    case 'text':
      return <div className="msg-text"><Markdown text={ev.text} /></div>
    case 'tool':
      return (
        <div className="msg-tool">
          <Icon name={ev.name.startsWith('browser') ? 'globe' : 'tool'} size={12} />
          <span>{TOOL_LABELS[ev.name] ?? ev.name}</span>
          {ev.summary && <em>{ev.summary}</em>}
        </div>
      )
    case 'error':
      return <div className="msg-error"><Icon name="alert" size={13} /> {ev.text}</div>
    case 'notice':
      return <div className="msg-notice" role="status">{ev.text}</div>
    case 'done':
      return ev.durationMs ? <div className="msg-done">Done in {Math.round(ev.durationMs / 1000)}s</div> : null
  }
}

function chatGroups(chats: ChatHistoryState['chats']) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  const week = new Date(today)
  week.setDate(today.getDate() - 7)
  const groups: { label: string; since: number; chats: typeof chats }[] = [
    { label: 'Today', since: today.getTime(), chats: [] },
    { label: 'Yesterday', since: yesterday.getTime(), chats: [] },
    { label: 'Previous 7 days', since: week.getTime(), chats: [] },
    { label: 'Older', since: -Infinity, chats: [] }
  ]
  for (const chat of chats) groups.find((group) => chat.updatedAt >= group.since)?.chats.push(chat)
  return groups
}
