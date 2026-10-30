import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { EXPORT_FORMATS, type Doc, type Frame, type FrameId } from '../../shared/model'
import { api } from './api'
import { nativeEditing, selectedText } from './editFocus'
import { Icon } from './icons'

interface Camera {
  x: number
  y: number
  zoom: number
}

type Gesture =
  | { kind: 'idle' }
  | { kind: 'pan'; sx: number; sy: number; cam: Camera }
  | { kind: 'move'; id: FrameId; sx: number; sy: number; fx: number; fy: number; moved: boolean }
  | { kind: 'resize'; id: FrameId; sx: number; sy: number; w: number; h: number }

type Draft = Partial<Record<FrameId, Partial<Pick<Frame, 'x' | 'y' | 'width' | 'height'>>>>

export interface CanvasHandle {
  focusFrame: (id: FrameId) => void
  fit: () => void
  zoomBy: (k: number) => void
}

export type CanvasTool = 'select' | 'hand'

interface Props {
  doc: Doc
  port: number
  selection: FrameId[]
  onSelect: (ids: FrameId[]) => void
  onZoom: (zoom: number) => void
  tool: CanvasTool
  exportBusy: boolean
}

const MIN_ZOOM = 0.05
const MAX_ZOOM = 4
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas({ doc, port, selection, onSelect, onZoom, tool, exportBusy }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const [cam, setCam] = useState<Camera>({ x: 80, y: 80, zoom: 0.5 })
  const gesture = useRef<Gesture>({ kind: 'idle' })
  const [draft, setDraft] = useState<Draft>({})
  const [space, setSpace] = useState(false)
  const [live, setLive] = useState<FrameId | null>(null)

  useEffect(() => onZoom(cam.zoom), [cam.zoom, onZoom])

  const fitRect = useCallback((r: { x: number; y: number; width: number; height: number }, maxZoom = 1) => {
    const el = host.current
    if (!el) return
    const pad = 64
    const zoom = clampZoom(Math.min(maxZoom, (el.clientWidth - pad * 2) / r.width, (el.clientHeight - pad * 2) / r.height))
    setCam({ zoom, x: (el.clientWidth - r.width * zoom) / 2 - r.x * zoom, y: Math.max(pad, (el.clientHeight - r.height * zoom) / 2) - r.y * zoom })
  }, [])

  const fit = useCallback(() => {
    if (doc.frames.length === 0) return setCam({ x: 80, y: 80, zoom: 0.5 })
    const x = Math.min(...doc.frames.map((f) => f.x))
    const y = Math.min(...doc.frames.map((f) => f.y))
    const r = Math.max(...doc.frames.map((f) => f.x + f.width))
    const b = Math.max(...doc.frames.map((f) => f.y + f.height))
    fitRect({ x, y, width: r - x, height: b - y })
  }, [doc.frames, fitRect])

  const docRef = useRef(doc)
  docRef.current = doc
  const zoomBy = useCallback((k: number) => {
    const el = host.current
    if (!el) return
    const px = el.clientWidth / 2
    const py = el.clientHeight / 2
    setCam((c) => {
      const zoom = clampZoom(c.zoom * k)
      const r = zoom / c.zoom
      return { zoom, x: px - (px - c.x) * r, y: py - (py - c.y) * r }
    })
  }, [])

  useImperativeHandle(ref, () => ({
    fit,
    zoomBy,
    focusFrame: (id) => {
      const f = docRef.current.frames.find((fr) => fr.id === id)
      if (f) fitRect({ x: f.x, y: f.y, width: f.width, height: Math.min(f.height, f.width * 1.2) }, 0.9)
    }
  }))

  const fitted = useRef(false)
  useEffect(() => {
    if (!fitted.current && host.current && doc.frames.length) {
      fitted.current = true
      fit()
    }
  }, [doc.frames.length, fit])

  useEffect(() => {
    const el = host.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const px = e.clientX - rect.left
      const py = e.clientY - rect.top
      setCam((c) => {
        if (e.ctrlKey || e.metaKey) {
          const zoom = clampZoom(c.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002)))
          const k = zoom / c.zoom
          return { zoom, x: px - (px - c.x) * k, y: py - (py - c.y) * k }
        }
        return { ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }
      })
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (nativeEditing() || selectedText()) return
      if (e.code === 'Space') setSpace(true)
      else if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        void api.frameCommand({ type: 'delete' })
      } else if (e.key === 'Escape') {
        setLive(null)
        onSelect([])
      } else if ((e.metaKey && e.key === '0') || (e.shiftKey && e.key === '!')) {
        e.preventDefault()
        fit()
      } else if (e.metaKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        zoomBy(1.25)
      } else if (e.metaKey && e.key === '-') {
        e.preventDefault()
        zoomBy(0.8)
      } else if (e.shiftKey && e.key === '@' && selection[0]) {
        const f = doc.frames.find((fr) => fr.id === selection[0])
        if (f) fitRect(f, 1)
      }
    }
    const up = (e: KeyboardEvent) => e.code === 'Space' && setSpace(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [selection, onSelect, fit, fitRect, doc.frames, zoomBy])

  useEffect(() => api.on.edit((command) => {
    if (nativeEditing() || selectedText()) {
      if (command !== 'duplicate') void api.nativeEdit(command)
      return
    }
    if (command === 'selectAll') {
      void api.frameCommand({ type: 'selectAll' })
      return
    }
    if (command === 'paste') {
      const el = host.current
      if (el) void api.frameCommand({ type: 'paste', anchor: { x: (el.clientWidth / 2 - cam.x) / cam.zoom, y: (el.clientHeight / 2 - cam.y) / cam.zoom } })
      return
    }
    void api.frameCommand({ type: command })
  }), [cam, doc.frames, selection, onSelect])

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    const frameEl = target.closest<HTMLElement>('[data-frame-id]')
    const handle = target.closest<HTMLElement>('[data-handle]')
    if (target.closest('[data-toolbar]')) return
    host.current?.focus()
    window.getSelection()?.removeAllRanges()
    host.current!.setPointerCapture(e.pointerId)
    const panTool = space || tool === 'hand'
    if (panTool || e.button === 1 || !frameEl) {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cam }
      if (!panTool && e.button === 0 && !frameEl) {
        onSelect([])
        setLive(null)
      }
      return
    }
    const id = frameEl.dataset.frameId as FrameId
    const f = doc.frames.find((fr) => fr.id === id)!
    if (handle) {
      gesture.current = { kind: 'resize', id, sx: e.clientX, sy: e.clientY, w: f.width, h: f.height }
      return
    }
    if (live === id && !target.closest('[data-label]')) return
    onSelect(e.shiftKey ? [...new Set([...selection, id])] : [id])
    gesture.current = { kind: 'move', id, sx: e.clientX, sy: e.clientY, fx: f.x, fy: f.y, moved: false }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (g.kind === 'pan') setCam({ ...g.cam, x: g.cam.x + e.clientX - g.sx, y: g.cam.y + e.clientY - g.sy })
    else if (g.kind === 'move') {
      const dx = (e.clientX - g.sx) / cam.zoom
      const dy = (e.clientY - g.sy) / cam.zoom
      if (!g.moved && Math.hypot(dx, dy) * cam.zoom < 3) return
      g.moved = true
      setDraft({ [g.id]: { x: Math.round(g.fx + dx), y: Math.round(g.fy + dy) } })
    } else if (g.kind === 'resize') {
      setDraft({ [g.id]: { width: Math.max(200, Math.round(g.w + (e.clientX - g.sx) / cam.zoom)), height: Math.max(100, Math.round(g.h + (e.clientY - g.sy) / cam.zoom)) } })
    }
  }

  const onPointerUp = () => {
    const g = gesture.current
    gesture.current = { kind: 'idle' }
    if (g.kind === 'move' || g.kind === 'resize') {
      const d = draft[g.id]
      if (d && doc.frames.some((f) => f.id === g.id)) void api.op({ type: 'patch', id: g.id, patch: d })
      setDraft({})
    }
  }

  const selected = doc.frames.filter((f) => selection.includes(f.id))
  const panning = gesture.current.kind === 'pan'

  return (
    <div
      ref={host}
      tabIndex={-1}
      className={`canvas ${space || tool === 'hand' ? 'is-space' : ''} ${panning ? 'is-panning' : ''}`}
      onDragOver={(e) => {
        if ([...e.dataTransfer.items].some((i) => i.type.startsWith('image/'))) e.preventDefault()
      }}
      onDrop={async (e) => {
        e.preventDefault()
        const rect = host.current!.getBoundingClientRect()
        let x = (e.clientX - rect.left - cam.x) / cam.zoom
        const y = (e.clientY - rect.top - cam.y) / cam.zoom
        for (const file of [...e.dataTransfer.files].filter((f) => f.type.startsWith('image/'))) {
          const id = (await api.addImage({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), x, y })) as FrameId
          onSelect([id])
          x += 80
        }
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={(e) => {
        const id = (e.target as HTMLElement).closest<HTMLElement>('[data-frame-id]')?.dataset.frameId as FrameId | undefined
        if (id && doc.frames.find((f) => f.id === id)?.kind === 'html') setLive(id)
      }}
      style={{ '--zoom': cam.zoom } as React.CSSProperties}
    >
      <div className="world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})` }}>
        {doc.frames.map((f) => {
          const box = { ...f, ...draft[f.id] }
          const isSel = selection.includes(f.id)
          return (
            <div key={f.id} data-frame-id={f.id} className={`frame ${isSel ? 'is-selected' : ''} ${live === f.id ? 'is-live' : ''}`} style={{ left: box.x, top: box.y, width: box.width, height: box.height }}>
              <div className="frame-label" data-label>
                <Icon name={f.kind === 'image' ? 'image' : 'frame'} size={12} />
                <span>{f.name}</span>
                <span className="frame-size">{box.width} × {box.height}</span>
              </div>
              {f.kind === 'html' ? (
                <FrameView title={f.name} src={`http://127.0.0.1:${port}/frame/${f.id}?v=${f.updatedAt}`} />
              ) : (
                <img src={`http://127.0.0.1:${port}/assets/${f.asset}`} alt={f.name} draggable={false} />
              )}
              {live !== f.id && <div className="frame-shield" />}
              {isSel && <div className="frame-handle" data-handle />}
            </div>
          )
        })}
      </div>

      {selected.length === 1 && !draft[selected[0].id] && (
        <FrameToolbar key={selected[0].id} frame={selected[0]} cam={cam} live={live === selected[0].id} busy={exportBusy} onLive={(on) => setLive(on ? selected[0].id : null)} onDelete={() => onSelect([])} />
      )}

    </div>
  )
})

function FrameToolbar({ frame, cam, live, busy, onLive, onDelete }: { frame: Frame; cam: Camera; live: boolean; busy: boolean; onLive: (on: boolean) => void; onDelete: () => void }) {
  const [copied, setCopied] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)
  const exportButton = useRef<HTMLButtonElement>(null)
  const exportPanel = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!exportOpen) return
    exportPanel.current?.querySelector('button')?.focus()
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !exportPanel.current?.contains(event.target) && !exportButton.current?.contains(event.target)) setExportOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [exportOpen])
  const left = cam.x + (frame.x + frame.width) * cam.zoom
  const top = cam.y + frame.y * cam.zoom - 40
  return (
    <div className="frame-toolbar" data-toolbar style={{ left, top: Math.max(8, top) }}>
      {frame.kind === 'html' && (
        <>
          <button className={live ? 'is-on' : ''} title="Interact with the design (double-click a frame)" onClick={() => onLive(!live)}>
            <Icon name="pointer" size={14} />
          </button>
          <button
            title="Copy HTML"
            onClick={() => {
              void api.frame('copy', frame.id)
              setCopied(true)
              setTimeout(() => setCopied(false), 1200)
            }}
          >
            <Icon name={copied ? 'check' : 'copy'} size={14} />
          </button>
          <button title="Open in your browser" onClick={() => api.frame('open', frame.id)}>
            <Icon name="external" size={14} />
          </button>
          <span className="sep" />
        </>
      )}
      <button title="Copy as PNG" aria-label="Copy as PNG" disabled={busy} onClick={() => void api.copyFrameImage(frame.id)}><Icon name="image" size={14} /></button>
      <button ref={exportButton} title="Export frame" aria-label="Export frame" aria-haspopup="dialog" aria-expanded={exportOpen} disabled={busy} onClick={() => setExportOpen(!exportOpen)}><Icon name="download" size={14} /></button>
      {exportOpen && (
        <div ref={exportPanel} className="export-popover" role="dialog" aria-label="Export frame formats" onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setExportOpen(false)
        }} onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation()
            setExportOpen(false)
            exportButton.current?.focus()
          }
        }}>
          {EXPORT_FORMATS.map((format) => <button key={format} aria-label={`Export ${format.toUpperCase()}`} disabled={busy} onClick={() => {
            setExportOpen(false)
            exportButton.current?.focus()
            void api.exportFrame(frame.id, format)
          }}>{format.toUpperCase()}</button>)}
        </div>
      )}
      <button
        title="Delete"
        onClick={() => {
          void api.op({ type: 'delete', id: frame.id })
          onDelete()
        }}
      >
        <Icon name="trash" size={14} />
      </button>
    </div>
  )
}

/** Keep the last loaded render on screen until the new one has loaded and styled, so edits never flash white. */
function FrameView({ title, src }: { title: string; src: string }) {
  const [shown, setShown] = useState(src)
  const [pending, setPending] = useState<string | null>(null)
  useEffect(() => {
    if (src !== shown) setPending(src)
  }, [src, shown])
  return (
    <>
      <iframe key={shown} title={title} src={shown} scrolling="no" sandbox="allow-scripts" />
      {pending && (
        <iframe
          key={pending}
          title={title}
          src={pending}
          scrolling="no"
          sandbox="allow-scripts"
          className="is-pending"
          onLoad={() => setTimeout(() => {
            setShown(pending)
            setPending(null)
          }, 250)}
        />
      )}
    </>
  )
}
