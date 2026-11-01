import { useCallback, useEffect, useRef, useState } from 'react'
import type { AgentEvent, AgentStatus, BrowserPick, Doc, ExportActivity, FrameId, SelectedElement } from '../../shared/model'
import { api, type BrowserState, type InitState, type ProjectTab } from './api'
import { Canvas, type CanvasHandle, type CanvasTool } from './Canvas'
import { BrowserPane } from './BrowserPane'
import { Chat } from './Chat'
import { Inspector } from './Inspector'
import { nativeEditing } from './editFocus'
import { Icon, type IconName } from './icons'

type LeftTab = 'agent' | 'frames'

const stored = (key: string, fallback: number) => Number(localStorage.getItem(key)) || fallback

export function App() {
  const [init, setInit] = useState<InitState | null>(null)
  const [doc, setDoc] = useState<Doc>({ version: 1, frames: [] })
  const [project, setProject] = useState({ dir: '', name: '', epoch: 0 })
  const [tabs, setTabs] = useState<ProjectTab[]>([])
  const [leftTab, setLeftTab] = useState<LeftTab>('agent')
  const [leftOpen, setLeftOpen] = useState(true)
  const [browserOpen, setBrowserOpen] = useState(() => localStorage.getItem('chalk.browserOpen') !== '0')
  const [browserWidth, setBrowserWidth] = useState(() => stored('chalk.browserWidth', 560))
  const [tool, setTool] = useState<CanvasTool>('select')
  const [elements, setElements] = useState<SelectedElement[]>([])
  const [selection, setSelection] = useState<FrameId[]>([])
  const [browser, setBrowser] = useState<BrowserState>({ url: '', title: '', loading: false, canGoBack: false, canGoForward: false, picking: false, device: 'responsive' })
  const [recent, setRecent] = useState<string[]>([])
  const [pick, setPick] = useState<BrowserPick | null>(null)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [status, setStatus] = useState<AgentStatus>('idle')
  const [zoom, setZoom] = useState(1)
  const [exportActivity, setExportActivity] = useState<ExportActivity | null>(null)
  const [frameError, setFrameError] = useState<string | null>(null)
  const canvas = useRef<CanvasHandle>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  useEffect(() => api.on.settingsOpen(() => setSettingsOpen(true)), [])

  const select = useCallback((ids: FrameId[]) => {
    setSelection(ids)
    setElements([])
    void api.select(ids)
  }, [])

  const openBrowser = useCallback((open: boolean) => {
    setBrowserOpen(open)
    localStorage.setItem('chalk.browserOpen', open ? '1' : '0')
  }, [])

  useEffect(() => {
    void api.init().then((s) => {
      setInit(s)
      setDoc(s.doc)
      setElements(s.selectedElements)
      setProject(s.project)
      setTabs(s.tabs)
      setBrowser(s.browser)
      setRecent(s.recentUrls)
      setStatus(s.agentStatus)
    })
    const offs = [
      api.on.exportActivity(setExportActivity),
      api.on.selection(setSelection),
      api.on.elementSelection(setElements),
      api.on.frameError(setFrameError),
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
        if (nativeEditing()) void api.nativeEdit(direction)
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
      if (nativeEditing() || e.metaKey || e.ctrlKey) return
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
        localStorage.setItem('chalk.browserWidth', String(w))
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
          <span className="brand"><span className="brand-mark" /> Chalk</span>
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
                    selectedElements={elements}
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
                    <Inspector selectedElements={elements} frames={selectedFrames} projectEpoch={project.epoch} />
                    {doc.frames.length === 0 && <p className="layers-empty">Frames you and the agent make show up here.</p>}
                    {doc.frames.map((f) => (
                      <LayerRow
                        key={f.id}
                        name={f.name}
                        kind={f.kind}
                        selected={selection.includes(f.id)}
                        onSelect={(shift) => {
                          select(shift ? selection.includes(f.id) ? selection.filter((id) => id !== f.id) : [...selection, f.id] : [f.id])
                          if (!shift) setTimeout(() => canvas.current?.focusFrame(f.id), 0)
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
            <ToolButton icon="frame" label="Add Desktop frame (1440 × 900)" onClick={() => void api.frameCommand({ type: 'create', preset: 'desktop' })} />
            <ToolButton icon="file" label="Add Mobile frame (390 × 844)" onClick={() => void api.frameCommand({ type: 'create', preset: 'mobile' })} />
            <ToolButton icon="hand" label="Hand (H)" on={tool === 'hand'} onClick={() => setTool('hand')} />
            <span className="strip-sep" />
            <ToolButton icon="globe" label={browserOpen ? 'Hide browser' : 'Show browser'} on={browserOpen} onClick={() => openBrowser(!browserOpen)} />
            <ToolButton icon="fit" label="Zoom to fit (⌘0)" onClick={() => canvas.current?.fit()} />
          </div>

          <main className="stage">
            <Canvas key={project.epoch} ref={canvas} doc={doc} port={init.port} projectEpoch={project.epoch} selection={selection} selectedElements={elements} onSelect={select} onZoom={setZoom} tool={tool} exportBusy={exportActivity?.status === 'busy'} />
            {exportActivity && (
              <div className={`export-notice ${exportActivity.status === 'error' ? 'is-error' : ''}`} role={exportActivity.status === 'error' ? 'alert' : 'status'}>
                <span>{exportActivity.status === 'busy' || exportActivity.status === 'error'
                  ? exportActivity.message
                  : exportActivity.status === 'saved'
                    ? `Saved ${exportActivity.path}`
                    : exportActivity.status === 'copied' ? 'PNG copied to clipboard.' : 'Export canceled.'}</span>
                {exportActivity.status !== 'busy' && <button aria-label="Dismiss export notice" onClick={() => setExportActivity(null)}><Icon name="x" size={12} /></button>}
              </div>
            )}
            {frameError && (
              <div className="export-notice is-error frame-notice" role="alert">
                <span>{frameError}</span>
                <button aria-label="Dismiss frame notice" onClick={() => setFrameError(null)}><Icon name="x" size={12} /></button>
              </div>
            )}
            <div className="zoom-controls">
              <button aria-label="Zoom out" onClick={() => canvas.current?.zoomBy(0.8)}><Icon name="minus" size={14} /></button>
              <button className="zoom-value" title="Zoom to fit" onClick={() => canvas.current?.fit()}>{Math.round(zoom * 100)}%</button>
              <button aria-label="Zoom in" onClick={() => canvas.current?.zoomBy(1.25)}><Icon name="plus" size={14} /></button>
            </div>
          </main>
        </div>
      </div>

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
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

function LayerRow({ name, kind, selected, onSelect, onRename }: { name: string; kind: 'html' | 'image'; selected: boolean; onSelect: (shift: boolean) => void; onRename: (n: string) => void }) {
  const [editing, setEditing] = useState(false)
  return (
    <div className={`layer ${selected ? 'is-selected' : ''}`} onClick={(event) => onSelect(event.shiftKey)} onDoubleClick={() => setEditing(true)}>
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

const SOURCE_LABEL = { unsplash: 'Unsplash', pexels: 'Pexels', wikimedia: 'Wikimedia Commons (no key)' }

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [keys, setKeys] = useState({ unsplash: '', pexels: '' })
  const [active, setActive] = useState<keyof typeof SOURCE_LABEL>('wikimedia')
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    void api.photoKeys().then((k) => {
      setKeys({ unsplash: k.unsplash, pexels: k.pexels })
      setActive(k.active)
    })
  }, [])
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal"
        onSubmit={async (e) => {
          e.preventDefault()
          const k = await api.photoKeys(keys)
          setActive(k.active)
          setSaved(true)
        }}
      >
        <h3>Settings</h3>
        <h4>Photo search</h4>
        <p>The agent searches for real photos when a design needs them. Unsplash and Pexels have the best photos and need a free API key. Without a key, Chalk uses Wikimedia Commons.</p>
        <label>Unsplash access key<input value={keys.unsplash} spellCheck={false} placeholder="Create one at unsplash.com/developers" onChange={(e) => { setKeys({ ...keys, unsplash: e.target.value }); setSaved(false) }} /></label>
        <label>Pexels API key<input value={keys.pexels} spellCheck={false} placeholder="Create one at pexels.com/api" onChange={(e) => { setKeys({ ...keys, pexels: e.target.value }); setSaved(false) }} /></label>
        <p className="muted">Using: {SOURCE_LABEL[active]}{saved ? ' · Saved' : ''}</p>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>Close</button>
          <button type="submit" className="primary">Save</button>
        </div>
      </form>
    </div>
  )
}

function ConnectButton({ mcpUrl }: { mcpUrl: string }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const cmd = `claude mcp add --scope user --transport http chalk ${mcpUrl}`
  return (
    <div className="connect">
      <button className="connect-btn" onClick={() => setOpen(!open)}><Icon name="code" size={14} /> Claude Code</button>
      {open && (
        <div className="popover" onMouseLeave={() => setOpen(false)}>
          <h4>Build your designs with Claude Code</h4>
          <p>Run this once in Terminal. Chalk must be open while Claude uses it.</p>
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
          <p className="muted">Then ask Claude: “Build the selected Chalk frame in this project.”</p>
        </div>
      )}
    </div>
  )
}
