import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentEvent, AgentStatus, BrowserPick, Doc, FrameId } from '../../shared/model'
import { api, type BrowserState, type InitState, type ProjectTab } from './api'
import { Canvas, type CanvasHandle, type CanvasTool } from './Canvas'
import { BrowserPane } from './BrowserPane'
import { Chat } from './Chat'
import { Icon, type IconName } from './icons'

type LeftTab = 'agent' | 'frames'

const stored = (key: string, fallback: number) => Number(localStorage.getItem(key)) || fallback

export function App() {
  const [init, setInit] = useState<InitState | null>(null)
  const [doc, setDoc] = useState<Doc>({ version: 1, frames: [] })
  const [project, setProject] = useState({ dir: '', name: '' })
  const [tabs, setTabs] = useState<ProjectTab[]>([])
  const [leftTab, setLeftTab] = useState<LeftTab>('agent')
  const [leftOpen, setLeftOpen] = useState(true)
  const [browserOpen, setBrowserOpen] = useState(() => localStorage.getItem('easel.browserOpen') !== '0')
  const [browserWidth, setBrowserWidth] = useState(() => stored('easel.browserWidth', 560))
  const [tool, setTool] = useState<CanvasTool>('select')
  const [selection, setSelection] = useState<FrameId[]>([])
  const [browser, setBrowser] = useState<BrowserState>({ url: '', title: '', loading: false, canGoBack: false, canGoForward: false, picking: false })
  const [recent, setRecent] = useState<string[]>([])
  const [pick, setPick] = useState<BrowserPick | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [zoom, setZoom] = useState(1)
  const canvas = useRef<CanvasHandle>(null)

  const select = useCallback((ids: FrameId[]) => {
    setSelection(ids)
    void api.select(ids)
  }, [])

  const openBrowser = useCallback((open: boolean) => {
    setBrowserOpen(open)
    localStorage.setItem('easel.browserOpen', open ? '1' : '0')
  }, [])

  useEffect(() => {
    void api.init().then((s) => {
      setInit(s)
      setDoc(s.doc)
      setProject(s.project)
      setTabs(s.tabs)
      setBrowser(s.browser)
      setRecent(s.recentUrls)
      setStatus(s.agentStatus)
    })
    const offs = [
      api.on.doc(setDoc),
      api.on.tabs(setTabs),
      api.on.recentUrls(setRecent),
      api.on.project((p) => {
        setProject(p)
        setEvents([])
        select([])
        setTimeout(() => canvas.current?.fit(), 50)
      }),
      api.on.browserState(setBrowser),
      api.on.browserPick((p) => {
        setPick(p)
        if (p) setLeftTab('agent')
      }),
      api.on.agentEvent((e) => setEvents((prev) => [...prev, e])),
      api.on.agentStatus(setStatus),
      api.on.history((direction) => {
        const t = document.activeElement
        if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) document.execCommand(direction)
        else void api.history(direction)
      }),
      api.on.focus((t) => {
        if (t.mode === 'browser') return openBrowser(true)
        if (t.frameId) {
          const id = t.frameId
          setTimeout(() => canvas.current?.focusFrame(id), 30)
        }
      })
    ]
    return () => offs.forEach((off) => off())
  }, [select, openBrowser])

  useEffect(() => {
    const live = new Set(doc.frames.map((f) => f.id))
    if (selection.some((id) => !live.has(id))) select(selection.filter((id) => live.has(id)))
  }, [doc, selection, select])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const t = document.activeElement
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || e.metaKey || e.ctrlKey) return
      if (e.key === 'v') setTool('select')
      if (e.key === 'h') setTool('hand')
    }
    window.addEventListener('keydown', down)
    return () => window.removeEventListener('keydown', down)
  }, [])

  if (!init) return <div className="boot" />

  const selectedFrames = doc.frames.filter((f) => selection.includes(f.id))

  const startResize = (e: React.PointerEvent) => {
    const startX = e.clientX
    const startW = browserWidth
    const move = (ev: PointerEvent) => setBrowserWidth(Math.min(Math.max(360, startW + startX - ev.clientX), window.innerWidth - 640))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('is-resizing')
      setBrowserWidth((w) => {
        localStorage.setItem('easel.browserWidth', String(w))
        return w
      })
    }
    document.body.classList.add('is-resizing')
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="app">
      <div className="workspace">
        <header className="titlebar">
          <span className="brand"><span className="brand-mark" /> Easel</span>
          <nav className="tabs">
            {tabs.map((t) => (
              <div key={t.dir} className={`tab ${t.dir === project.dir ? 'is-on' : ''}`} title={t.dir} onClick={() => api.project('switch', t.dir)}>
                <Icon name="file" size={13} />
                <span>{t.name}</span>
                {tabs.length > 1 && (
                  <button
                    className="tab-close"
                    aria-label={`Close ${t.name}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      void api.project('close', t.dir)
                    }}
                  >
                    <Icon name="x" size={11} />
                  </button>
                )}
              </div>
            ))}
            <button className="tab-add" title="New project (⌘N)" aria-label="New project" onClick={() => api.project('new')}><Icon name="plus" size={14} /></button>
          </nav>
          <div className="titlebar-right">
            <ConnectButton mcpUrl={init.mcpUrl} />
            {!browserOpen && (
              <button className="title-icon" title="Open browser" aria-label="Open browser" onClick={() => openBrowser(true)}><Icon name="globe" size={15} /></button>
            )}
          </div>
        </header>

        <div className="work">
          {leftOpen && (
            <aside className="left">
              <div className="left-tabs">
                <button className={leftTab === 'agent' ? 'is-on' : ''} onClick={() => setLeftTab('agent')}><Icon name="chat" size={14} /> Agent</button>
                <button className={leftTab === 'frames' ? 'is-on' : ''} onClick={() => setLeftTab('frames')} title="Frames">
                  <Icon name="layers" size={14} /> Frames <span className="count">{doc.frames.length}</span>
                </button>
              </div>
              <div className="left-body">
                <div style={{ display: leftTab === 'agent' ? 'contents' : 'none' }}>
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
                {leftTab === 'frames' && (
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
                          setTimeout(() => canvas.current?.focusFrame(f.id), 0)
                        }}
                        onRename={(name) => api.op({ type: 'patch', id: f.id, patch: { name } })}
                      />
                    ))}
                  </div>
                )}
              </div>
            </aside>
          )}

          <div className="toolstrip">
            <ToolButton icon="panel" label={leftOpen ? 'Hide panel' : 'Show panel'} onClick={() => setLeftOpen(!leftOpen)} />
            <span className="strip-sep" />
            <ToolButton icon="pointer" label="Select (V)" on={tool === 'select'} onClick={() => setTool('select')} />
            <ToolButton icon="hand" label="Hand (H)" on={tool === 'hand'} onClick={() => setTool('hand')} />
            <span className="strip-sep" />
            <ToolButton icon="globe" label={browserOpen ? 'Hide browser' : 'Show browser'} on={browserOpen} onClick={() => openBrowser(!browserOpen)} />
            <ToolButton icon="fit" label="Zoom to fit (⌘0)" onClick={() => canvas.current?.fit()} />
          </div>

          <main className="stage">
            <Canvas ref={canvas} doc={doc} port={init.port} selection={selection} onSelect={select} onZoom={setZoom} tool={tool} />
            <div className="zoom-controls">
              <button aria-label="Zoom out" onClick={() => canvas.current?.zoomBy(0.8)}><Icon name="minus" size={14} /></button>
              <button className="zoom-value" title="Zoom to fit" onClick={() => canvas.current?.fit()}>{Math.round(zoom * 100)}%</button>
              <button aria-label="Zoom in" onClick={() => canvas.current?.zoomBy(1.25)}><Icon name="plus" size={14} /></button>
            </div>
          </main>
        </div>
      </div>

      {browserOpen && (
        <>
          <div className="splitter" onPointerDown={startResize} />
          <div className="browser-col" style={{ width: browserWidth }}>
            <BrowserPane state={browser} recent={recent} onClose={() => openBrowser(false)} />
          </div>
        </>
      )}
    </div>
  )
}

function ToolButton({ icon, label, on, onClick }: { icon: IconName; label: string; on?: boolean; onClick: () => void }) {
  return (
    <button className={`tool ${on ? 'is-on' : ''}`} title={label} aria-label={label} onClick={onClick}>
      <Icon name={icon} size={16} />
    </button>
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
      <button className="connect-btn" onClick={() => setOpen(!open)}><Icon name="code" size={14} /> Claude Code</button>
      {open && (
        <div className="popover" onMouseLeave={() => setOpen(false)}>
          <h4>Build your designs with Claude Code</h4>
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
