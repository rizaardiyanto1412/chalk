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
  events: AgentEvent[]
  status: AgentStatus
  models: readonly { id: string; label: string }[]
  claudePath: string | null
  selectedFrames: Frame[]
  pick: BrowserPick | null
  onClearSelection: () => void
  onNewChat: () => void
}

export function Chat({ events, status, models, claudePath, selectedFrames, pick, onClearSelection, onNewChat }: Props) {
  const [text, setText] = useState('')
  const [model, setModel] = useState(() => localStorage.getItem('easel.model') ?? '')
  const list = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLTextAreaElement>(null)
  const running = status === 'running'

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [events.length, running])

  useEffect(() => {
    const el = box.current!
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [text])

  const submit = () => {
    const t = text.trim()
    if (!t || running) return
    void api.sendAgent(t, model)
    setText('')
  }

  return (
    <aside className="chat">
      <header className="panel-head">
        <span className="panel-title"><Icon name="sparkle" size={14} /> Agent</span>
        <div className="panel-actions">
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value)
              localStorage.setItem('easel.model', e.target.value)
            }}
            title="Claude model"
          >
            {models.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <button className="icon-btn" title="New chat" onClick={onNewChat} disabled={running}><Icon name="plus" /></button>
        </div>
      </header>

      <div className="messages" ref={list}>
        {events.length === 0 && (
          <div className="chat-intro">
            <p>Describe what to design. The agent works on the canvas and can drive the browser.</p>
            <p className="muted">Runs on your local Claude Code{claudePath ? '' : ' (not found)'}.</p>
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
        <div className="input-row">
          <textarea
            ref={box}
            rows={1}
            value={text}
            placeholder={selectedFrames.length ? 'Ask for a change to the selection…' : pick ? 'What should change in the picked element?' : 'Design a…'}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                submit()
              }
            }}
          />
          {running ? (
            <button className="send is-stop" onClick={() => api.stopAgent()} title="Stop"><Icon name="stop" size={14} /></button>
          ) : (
            <button className="send" onClick={submit} disabled={!text.trim()} title="Send (Enter)"><Icon name="send" size={15} /></button>
          )}
        </div>
      </div>
    </aside>
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
