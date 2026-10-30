import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { EXPORT_FORMATS, type Doc, type Frame, type FrameId, type HtmlFrame } from '../../shared/model'
import { frameSize, translated } from '../../shared/frameGeometry'
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
  | { kind: 'move'; frames: Frame[]; id: FrameId; sx: number; sy: number; dx: number; dy: number; moved: boolean; collapse: boolean }
  | { kind: 'nudge'; frames: Frame[]; dx: number; dy: number; keys: Set<string> }
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
  projectEpoch: number
  selection: FrameId[]
  onSelect: (ids: FrameId[]) => void
  onZoom: (zoom: number) => void
  tool: CanvasTool
  exportBusy: boolean
}

const MIN_ZOOM = 0.05
const MAX_ZOOM = 4
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas({ doc, port, projectEpoch, selection, onSelect, onZoom, tool, exportBusy }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const [cam, setCam] = useState<Camera>({ x: 80, y: 80, zoom: 0.5 })
  const gesture = useRef<Gesture>({ kind: 'idle' })
  const [pointerMode, setPointerMode] = useState<'idle' | 'pan' | 'move' | 'resize'>('idle')
  const [draft, setDraft] = useState<Draft>({})
  const draftRef = useRef<Draft>({})
  const preview = (next: Draft) => { draftRef.current = next; setDraft(next) }
  const cancelGesture = useCallback(() => {
    gesture.current = { kind: 'idle' }
    setPointerMode('idle')
    draftRef.current = {}
    setDraft({})
  }, [])
  const [space, setSpace] = useState(false)
  const [live, setLive] = useState<FrameId | null>(null)

  useEffect(() => {
    const g = gesture.current
    const ids = g.kind === 'move' || g.kind === 'nudge' ? g.frames.map((f) => f.id) : g.kind === 'resize' ? [g.id] : []
    if (ids.some((id) => !doc.frames.some((f) => f.id === id) || !selection.includes(id))) cancelGesture()
    if (live && !doc.frames.some((f) => f.id === live)) setLive(null)
  }, [doc, selection, live, cancelGesture])

  useEffect(() => {
    const blur = () => { cancelGesture(); setSpace(false) }
    const focus = () => { if (nativeEditing()) cancelGesture() }
    window.addEventListener('blur', blur)
    window.addEventListener('focusin', focus)
    const off = api.on.history(cancelGesture)
    return () => { window.removeEventListener('blur', blur); window.removeEventListener('focusin', focus); off() }
  }, [cancelGesture])

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
      if (e.key.startsWith('Arrow') && !e.metaKey && !e.ctrlKey && !e.altKey && selection.length) {
        if (gesture.current.kind !== 'idle' && gesture.current.kind !== 'nudge') return
        if (gesture.current.kind === 'idle' && e.repeat) return
        e.preventDefault()
        if (gesture.current.kind === 'idle') gesture.current = { kind: 'nudge', frames: doc.frames.filter((f) => selection.includes(f.id)), dx: 0, dy: 0, keys: new Set() }
        const g = gesture.current
        if (g.kind !== 'nudge') return
        g.keys.add(e.key)
        const amount = e.shiftKey ? 10 : 1
        g.dx += e.key === 'ArrowLeft' ? -amount : e.key === 'ArrowRight' ? amount : 0
        g.dy += e.key === 'ArrowUp' ? -amount : e.key === 'ArrowDown' ? amount : 0
        preview(Object.fromEntries(translated(g.frames, g.dx, g.dy).map(({ id, x, y }) => [id, { x, y }])))
      } else if (e.code === 'Space') setSpace(true)
      else if (e.key === 'Backspace' || e.key === 'Delete') {
        cancelGesture()
        e.preventDefault()
        void api.frameCommand({ type: 'delete' })
      } else if (e.key === 'Escape') {
        cancelGesture()
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
    const up = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpace(false)
      const g = gesture.current
      if (g.kind !== 'nudge' || !g.keys.delete(e.key) || g.keys.size) return
      if (!nativeEditing() && !selectedText()) void api.frameCommand({ type: 'arrange', ids: g.frames.map((f) => f.id), projectEpoch, operation: { kind: 'translate', dx: g.dx, dy: g.dy } })
      cancelGesture()
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
    }
  }, [selection, onSelect, fit, fitRect, doc.frames, zoomBy, projectEpoch, cancelGesture])

  useEffect(() => api.on.edit((command) => {
    cancelGesture()
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
  }), [cam, doc.frames, selection, onSelect, cancelGesture])

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    const frameEl = target.closest<HTMLElement>('[data-frame-id]')
    const handle = target.closest<HTMLElement>('[data-handle]')
    if (target.closest('[data-toolbar]') || e.button > 1) return
    cancelGesture()
    host.current?.focus()
    window.getSelection()?.removeAllRanges()
    ;(frameEl ?? host.current)?.setPointerCapture(e.pointerId)
    const panTool = space || tool === 'hand'
    if (panTool || e.button === 1 || !frameEl) {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cam }
      setPointerMode('pan')
      if (!panTool && e.button === 0 && !frameEl) {
        onSelect([])
        setLive(null)
      }
      return
    }
    const f = doc.frames.find((fr) => fr.id === frameEl.dataset.frameId)
    if (!f) return
    const id = f.id
    if (handle) {
      gesture.current = { kind: 'resize', id, sx: e.clientX, sy: e.clientY, w: f.width, h: f.height }
      setPointerMode('resize')
      return
    }
    if (live === id && !target.closest('[data-label]')) return
    if (e.shiftKey && selection.includes(id)) {
      onSelect(selection.filter((selected) => selected !== id))
      return
    }
    const ids = e.shiftKey ? [...selection, id] : selection.includes(id) ? selection : [id]
    onSelect(ids)
    gesture.current = { kind: 'move', id, frames: doc.frames.filter((f) => ids.includes(f.id)), sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false, collapse: !e.shiftKey }
    setPointerMode('move')
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (g.kind === 'pan') setCam({ ...g.cam, x: g.cam.x + e.clientX - g.sx, y: g.cam.y + e.clientY - g.sy })
    else if (g.kind === 'move') {
      const dx = (e.clientX - g.sx) / cam.zoom
      const dy = (e.clientY - g.sy) / cam.zoom
      if (!g.moved && Math.hypot(dx, dy) * cam.zoom < 3) return
      g.moved = true
      g.dx = Math.round(dx)
      g.dy = Math.round(dy)
      preview(Object.fromEntries(translated(g.frames, g.dx, g.dy).map(({ id, x, y }) => [id, { x, y }])))
    } else if (g.kind === 'resize') {
      preview({ [g.id]: { width: frameSize('width', g.w + (e.clientX - g.sx) / cam.zoom), height: frameSize('height', g.h + (e.clientY - g.sy) / cam.zoom) } })
    }
  }

  const onPointerUp = () => {
    const g = gesture.current
    if (g.kind === 'move') {
      if (g.moved) void api.frameCommand({ type: 'arrange', ids: g.frames.map((f) => f.id), projectEpoch, operation: { kind: 'translate', dx: g.dx, dy: g.dy } })
      else if (g.collapse) onSelect([g.id])
    } else if (g.kind === 'resize') {
      const patch = draftRef.current[g.id]
      if (patch && doc.frames.some((f) => f.id === g.id)) void api.op({ type: 'patch', id: g.id, patch })
    }
    cancelGesture()
  }

  const selected = doc.frames.filter((f) => selection.includes(f.id))
  const panning = pointerMode === 'pan'
  const pointerGesture = pointerMode !== 'idle'

  return (
    <div
      ref={host}
      tabIndex={-1}
      className={`canvas ${space || tool === 'hand' ? 'is-space' : ''} ${panning ? 'is-panning' : ''} ${pointerGesture ? 'is-gesturing' : ''}`}
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
      onPointerCancel={cancelGesture}
      onLostPointerCapture={() => { if (gesture.current.kind !== 'nudge') cancelGesture() }}
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
                <FrameView frame={f} port={port} />
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
function FrameView({ frame, port }: { frame: HtmlFrame; port: number }) {
  const revision = useRef({ frame, port, src: `http://127.0.0.1:${port}/frame/${frame.id}?v=${frame.updatedAt}` })
  const previous = revision.current
  if (previous.port !== port || previous.frame.id !== frame.id || previous.frame.html !== frame.html || previous.frame.name !== frame.name) {
    revision.current = { frame, port, src: `http://127.0.0.1:${port}/frame/${frame.id}?v=${frame.updatedAt}` }
  }
  const src = revision.current.src
  const title = frame.name
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
