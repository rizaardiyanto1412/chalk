import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentEvent, AgentStatus, BrowserPick, Doc, FrameId } from '../../shared/model'
import { api, type BrowserState, type InitState } from './api'
import { Canvas, type CanvasHandle } from './Canvas'
import { BrowserPane } from './BrowserPane'
import { Chat } from './Chat'
import { Icon } from './icons'

type Mode = 'canvas' | 'browser'

export function App() {
  const [init, setInit] = useState<InitState | null>(null)
  const [doc, setDoc] = useState<Doc>({ version: 1, frames: [] })
  const [project, setProject] = useState({ dir: '', name: '' })
  const [mode, setMode] = useState<Mode>('canvas')
  const [selection, setSelection] = useState<FrameId[]>([])
  const [browser, setBrowser] = useState<BrowserState>({ url: '', title: '', loading: false, canGoBack: false, canGoForward: false, picking: false })
  const [pick, setPick] = useState<BrowserPick | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [zoom, setZoom] = useState(1)
  const canvas = useRef<CanvasHandle>(null)

  const select = useCallback((ids: FrameId[]) => {
    setSelection(ids)
    void api.select(ids)
  }, [])

  useEffect(() => {
    void api.init().then((s) => {
      setInit(s)
      setDoc(s.doc)
      setProject(s.project)
      setBrowser(s.browser)
      setStatus(s.agentStatus)
    })
    const offs = [
      api.on.doc(setDoc),
      api.on.project((p) => {
        setProject(p)
        setEvents([])
        select([])
        setTimeout(() => canvas.current?.fit(), 50)
      }),
      api.on.browserState(setBrowser),
      api.on.browserPick((p) => {
        setPick(p)
        if (p) setMode('browser')
      }),
      api.on.agentEvent((e) => setEvents((prev) => [...prev, e])),
      api.on.agentStatus(setStatus),
      api.on.history((direction) => {
        const t = document.activeElement
        if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) document.execCommand(direction)
        else void api.history(direction)
      }),
      api.on.focus((t) => {
        setMode(t.mode)
        if (t.mode === 'canvas' && t.frameId) {
          const id = t.frameId
          setTimeout(() => canvas.current?.focusFrame(id), 30)
        }
      })
    ]
    return () => offs.forEach((off) => off())
  }, [select])

  useEffect(() => {
    const live = new Set(doc.frames.map((f) => f.id))
    if (selection.some((id) => !live.has(id))) select(selection.filter((id) => live.has(id)))
  }, [doc, selection, select])

  if (!init) return <div className="boot" />

  const selectedFrames = doc.frames.filter((f) => selection.includes(f.id))

  return (
    <div className="app">
      <header className="topbar">
        <div className="project" title={project.dir}>
          <button className="project-btn" onClick={() => api.project('open')}>
            <Icon name="folder" size={14} /> {project.name}
          </button>
        </div>
        <div className="segmented">
          <button className={mode === 'canvas' ? 'is-on' : ''} onClick={() => setMode('canvas')}><Icon name="canvas" size={14} /> Canvas</button>
          <button className={mode === 'browser' ? 'is-on' : ''} onClick={() => setMode('browser')}><Icon name="globe" size={14} /> Browser</button>
        </div>
        <div className="topbar-right">
          {mode === 'canvas' && <button className="zoom" onClick={() => canvas.current?.fit()} title="Zoom to fit (⌘0)">{Math.round(zoom * 100)}%</button>}
          <ConnectButton mcpUrl={init.mcpUrl} />
        </div>
      </header>

      <div className="body">
        <aside className="layers">
          <div className="panel-head"><span className="panel-title">Frames</span><span className="count">{doc.frames.length}</span></div>
          <div className="layer-list">
            {doc.frames.length === 0 && <p className="layers-empty">Frames you and the agent make show up here.</p>}
            {doc.frames.map((f) => (
              <LayerRow
                key={f.id}
                name={f.name}
                kind={f.kind}
                selected={selection.includes(f.id)}
                onSelect={() => {
                  select([f.id])
                  setMode('canvas')
                  setTimeout(() => canvas.current?.focusFrame(f.id), 0)
                }}
                onRename={(name) => api.op({ type: 'patch', id: f.id, patch: { name } })}
              />
            ))}
          </div>
        </aside>

        <main className="stage">
          <div style={{ display: mode === 'canvas' ? 'contents' : 'none' }}>
            <Canvas ref={canvas} doc={doc} port={init.port} selection={selection} onSelect={select} onZoom={setZoom} />
          </div>
          <BrowserPane state={browser} visible={mode === 'browser'} />
        </main>

        <Chat
          events={events}
          status={status}
          models={init.models}
          claudePath={init.claudePath}
          selectedFrames={selectedFrames}
          pick={pick}
          onClearSelection={() => select([])}
          onNewChat={() => {
            void api.resetAgent()
            setEvents([])
          }}
        />
      </div>
    </div>
  )
}

function LayerRow({ name, kind, selected, onSelect, onRename }: { name: string; kind: 'html' | 'image'; selected: boolean; onSelect: () => void; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false)
  return (
    <div className={`layer ${selected ? 'is-selected' : ''}`} onClick={onSelect} onDoubleClick={() => setEditing(true)}>
      <Icon name={kind === 'image' ? 'image' : 'frame'} size={13} />
      {editing ? (
        <input
          autoFocus
          defaultValue={name}
          onBlur={(e) => {
            setEditing(false)
            if (e.target.value.trim() && e.target.value !== name) onRename(e.target.value.trim())
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
            if (e.key === 'Escape') setEditing(false)
          }}
        />
      ) : (
        <span>{name}</span>
      )}
    </div>
  )
}

function ConnectButton({ mcpUrl }: { mcpUrl: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const cmd = `claude mcp add --scope user --transport http easel ${mcpUrl}`
  return (
    <div className="connect">
      <button className="connect-btn" onClick={() => setOpen(!open)}><Icon name="plug" size={14} /> Connect Claude Code</button>
      {open && (
        <div className="popover" onMouseLeave={() => setOpen(false)}>
          <h4>Use your designs from Claude Code</h4>
          <p>Run this once in Terminal. Easel must be open while Claude uses it.</p>
          <div className="code">
            <code>{cmd}</code>
            <button
              onClick={() => {
                void api.copy(cmd)
                setCopied(true)
                setTimeout(() => setCopied(false), 1400)
              }}
            >
              <Icon name={copied ? 'check' : 'copy'} size={13} />
            </button>
          </div>
          <p className="muted">Then ask Claude: “Build the selected Easel frame in this project.”</p>
        </div>
      )}
    </div>
  )
}
