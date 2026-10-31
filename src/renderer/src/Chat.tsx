import type { StyleSummary } from '../../shared/styles'
import { useEffect, useRef, useState } from 'react'
import type { AgentEvent, AgentStatus, BrowserPick, Frame } from '../../shared/model'
import { api } from './api'
import { Icon } from './icons'
import { Markdown } from './Markdown'

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
  projectEpoch: number
  styles: StyleSummary[]
  events: AgentEvent[]
  status: AgentStatus
  models: readonly { id: string; label: string }[]
  claudePath: string | null
  selectedFrames: Frame[]
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

export function Chat({ projectEpoch, styles, events, status, models, claudePath, selectedFrames, pick, onClearSelection, onNewChat }: Props) {
  const [styleId, setStyleId] = useState('')
  const [variant, setVariant] = useState('')
  const chosen = styles.find(s => s.id === styleId)
  const clearStyle = () => { setStyleId(''); setVariant('') }
  const [text, setText] = useState('')
  const [model, setModel] = useState(() => localStorage.getItem('chalk.model') ?? '')
  const list = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const running = status === 'running'

  useEffect(() => {
    setStyleId('')
    setVariant('')
  }, [projectEpoch])

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
    void api.sendAgent(t.trim(), model, chosen ? { id: chosen.id, variant } : null)
    setText('')
    clearStyle()
  }

  return (
    <div className="chat">
      <div className="chat-head">
        <span className="chat-session">{events.find((e) => e.type === 'user')?.type === 'user' ? (events.find((e) => e.type === 'user') as { text: string }).text.slice(0, 48) : 'New chat'}</span>
        <button className="chat-new" onClick={() => { clearStyle(); onNewChat() }} disabled={running}><Icon name="plus" size={13} /> New</button>
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
        {running && <div className="thinking"><span /><span /><span /></div>}
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
            {pick && (
              <span className="chip is-pick" title={pick.selector}>
                <Icon name="pointer" size={12} /> &lt;{pick.tag}&gt; {pick.text.slice(0, 28) || pick.selector}
                <button onClick={() => api.browser('clearPick')}><Icon name="x" size={11} /></button>
              </span>
            )}
            {selectedFrames.length > 0 && <button className="chip-clear" onClick={onClearSelection}>Clear</button>}
          </div>
        )}
        <div className="style-controls">
          <label>Style<select aria-label="Style" value={styleId} disabled={running} onChange={e => {
            const next = styles.find(s => s.id === e.target.value)
            setStyleId(next?.id ?? '')
            setVariant(next?.variants[0].id ?? '')
          }}><option value="">Automatic</option>{styles.map(s => <option key={s.id} value={s.id}>{s.name}{s.direction ? ` · ${s.direction}` : ''}</option>)}</select></label>
          {chosen && chosen.variants.length > 1 && <label>Variant<select aria-label="Variant" value={variant} disabled={running} onChange={e => setVariant(e.target.value)}>{chosen.variants.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>}
          <span>References and brand take priority</span>
        </div>
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

function Message({ ev }: { ev: AgentEvent }) {
  switch (ev.type) {
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
    case 'done':
      return ev.durationMs ? <div className="msg-done">Done in {Math.round(ev.durationMs / 1000)}s</div> : null
  }
}
