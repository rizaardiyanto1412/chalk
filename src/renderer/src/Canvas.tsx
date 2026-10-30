import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { Doc, Frame, FrameId } from '../../shared/model'
import { api } from './api'
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

type Draft = Partial<Record<FrameId, Pick<Frame, 'x' | 'y' | 'width' | 'height'>>>

export interface CanvasHandle {
  focusFrame: (id: FrameId) => void
  fit: () => void
}

interface Props {
  doc: Doc
  port: number
  selection: FrameId[]
  onSelect: (ids: FrameId[]) => void
  onZoom: (zoom: number) => void
}

const MIN_ZOOM = 0.05
const MAX_ZOOM = 4
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas({ doc, port, selection, onSelect, onZoom }, ref) {
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
  useImperativeHandle(ref, () => ({
    fit,
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
    const typing = () => {
      const t = document.activeElement
      return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || (t as HTMLElement | null)?.isContentEditable
    }
    const zoomBy = (k: number) => {
      const el = host.current!
      const px = el.clientWidth / 2
      const py = el.clientHeight / 2
      setCam((c) => {
        const zoom = clampZoom(c.zoom * k)
        const r = zoom / c.zoom
        return { zoom, x: px - (px - c.x) * r, y: py - (py - c.y) * r }
      })
    }
    const down = (e: KeyboardEvent) => {
      if (typing()) return
      if (e.code === 'Space') setSpace(true)
      else if ((e.key === 'Backspace' || e.key === 'Delete') && selection.length) {
        selection.forEach((id) => api.op({ type: 'delete', id }))
        onSelect([])
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
  }, [selection, onSelect, fit, fitRect, doc.frames])

  const onPointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement
    const frameEl = target.closest<HTMLElement>('[data-frame-id]')
    const handle = target.closest<HTMLElement>('[data-handle]')
    if (target.closest('[data-toolbar]')) return
    host.current!.setPointerCapture(e.pointerId)
    if (space || e.button === 1 || !frameEl) {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cam }
      if (!space && e.button === 0 && !frameEl) {
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
      const f = doc.frames.find((fr) => fr.id === g.id)!
      setDraft({ [g.id]: { x: Math.round(g.fx + dx), y: Math.round(g.fy + dy), width: f.width, height: f.height } })
    } else if (g.kind === 'resize') {
      const f = doc.frames.find((fr) => fr.id === g.id)!
      setDraft({
        [g.id]: { x: f.x, y: f.y, width: Math.max(200, Math.round(g.w + (e.clientX - g.sx) / cam.zoom)), height: Math.max(100, Math.round(g.h + (e.clientY - g.sy) / cam.zoom)) }
      })
    }
  }

  const onPointerUp = () => {
    const g = gesture.current
    gesture.current = { kind: 'idle' }
    if (g.kind === 'move' || g.kind === 'resize') {
      const d = draft[g.id]
      if (d) void api.op({ type: 'patch', id: g.id, patch: d })
      setDraft({})
    }
  }

  const selected = doc.frames.filter((f) => selection.includes(f.id))
  const panning = gesture.current.kind === 'pan'

  return (
    <div
      ref={host}
      className={`canvas ${space ? 'is-space' : ''} ${panning ? 'is-panning' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={(e) => {
        const id = (e.target as HTMLElement).closest<HTMLElement>('[data-frame-id]')?.dataset.frameId as FrameId | undefined
        if (id && doc.frames.find((f) => f.id === id)?.kind === 'html') setLive(id)
      }}
      style={{ '--zoom': cam.zoom, backgroundPosition: `${cam.x}px ${cam.y}px`, backgroundSize: `${24 * cam.zoom}px ${24 * cam.zoom}px` } as React.CSSProperties}
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
        <FrameToolbar frame={selected[0]} cam={cam} live={live === selected[0].id} onLive={(on) => setLive(on ? selected[0].id : null)} onDelete={() => onSelect([])} />
      )}

      {doc.frames.length === 0 && (
        <div className="empty">
          <div className="empty-mark"><Icon name="sparkle" size={20} /></div>
          <h2>Start with a prompt</h2>
          <p>Describe a screen in the agent panel, or open a site in the Browser tab and ask for a redesign.</p>
          <div className="empty-hints">
            <span>“A billing settings page for a SaaS app”</span>
            <span>“Redesign the pricing section of stripe.com”</span>
          </div>
        </div>
      )}
    </div>
  )
})

function FrameToolbar({ frame, cam, live, onLive, onDelete }: { frame: Frame; cam: Camera; live: boolean; onLive: (on: boolean) => void; onDelete: () => void }) {
  const [copied, setCopied] = useState(false)
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
          <button title="Export HTML file" onClick={() => api.frame('export', frame.id)}>
            <Icon name="download" size={14} />
          </button>
          <button title="Open in your browser" onClick={() => api.frame('open', frame.id)}>
            <Icon name="external" size={14} />
          </button>
          <span className="sep" />
        </>
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
      <iframe key={shown} title={title} src={shown} scrolling="no" />
      {pending && (
        <iframe
          key={pending}
          title={title}
          src={pending}
          scrolling="no"
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
