import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { EXPORT_FORMATS, type Doc, type Frame, type FrameId, type HtmlFrame, type SelectedElement } from '../../shared/model'
import { contains, intersects, samePath, unionRect, type ElementHit, type ElementRect, type ElementSelectionMode } from '../../shared/elementSelection'
import { frameSize, translated } from '../../shared/frameGeometry'
import { api } from './api'
import { nativeEditing, selectedText } from './editFocus'
import { Icon } from './icons'
import { useCanvasElements } from './useCanvasElements'
import type { PresenceVisual } from '../../shared/presence'
import { CanvasPresence } from './CanvasPresence'

interface Camera {
  x: number
  y: number
  zoom: number
}

type Gesture =
  | { kind: 'idle' }
  | { kind: 'marquee'; sx: number; sy: number; moved: boolean }
  | { kind: 'pan'; sx: number; sy: number; cam: Camera }
  | { kind: 'move'; frames: Frame[]; id: FrameId; sx: number; sy: number; dx: number; dy: number; moved: boolean; collapse: boolean; pick: { x: number; y: number; mode: ElementSelectionMode } | null }
  | { kind: 'nudge'; frames: Frame[]; dx: number; dy: number; keys: Set<string> }
  | { kind: 'resize'; id: FrameId; sx: number; sy: number; w: number; h: number }

type Draft = Partial<Record<FrameId, Partial<Pick<Frame, 'x' | 'y' | 'width' | 'height'>>>>

export interface CanvasHandle {
  focusFrame: (id: FrameId) => void
  /** Bring the agent's frame into view, unless the user has moved around the canvas since following was armed. Returns false when it held still for the user. */
  followFrame: (id: FrameId) => boolean
  armFollow: () => void
  fit: () => void
  zoomBy: (k: number) => void
}

export type CanvasTool = 'select' | 'hand'

interface Props {
  doc: Doc
  port: number
  projectEpoch: number
  selection: FrameId[]
  selectedElements: SelectedElement[]
  onSelect: (ids: FrameId[]) => void
  onZoom: (zoom: number) => void
  tool: CanvasTool
  exportBusy: boolean
  presence: PresenceVisual
}

type MarqueePreview =
  | { kind: 'frames'; ids: FrameId[] }
  | { kind: 'elements'; hits: (ElementHit & { frameId: FrameId })[] }

function marqueeTarget(frames: Frame[], rect: ElementRect) {
  const enclosed = frames.filter((frame) => contains(rect, frame))
  if (enclosed.length) return { kind: 'frames' as const, ids: enclosed.map((frame) => frame.id) }
  const overlapping = frames.filter((frame) => intersects(rect, frame))
  const frame = overlapping[0]
  if (overlapping.length !== 1 || frame.kind !== 'html') return { kind: 'frames' as const, ids: overlapping.map((frame) => frame.id) }
  const x = Math.max(rect.x, frame.x)
  const y = Math.max(rect.y, frame.y)
  return { kind: 'elements' as const, frame, rect: { x: x - frame.x, y: y - frame.y, width: Math.min(rect.x + rect.width, frame.x + frame.width) - x, height: Math.min(rect.y + rect.height, frame.y + frame.height) - y } }
}

const MIN_ZOOM = 0.05
const MAX_ZOOM = 4
const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export const Canvas = forwardRef<CanvasHandle, Props>(function Canvas({ doc, port, projectEpoch, selection, selectedElements, onSelect, onZoom, tool, exportBusy, presence }, ref) {
  const host = useRef<HTMLDivElement>(null)
  const [cam, setCam] = useState<Camera>({ x: 80, y: 80, zoom: 0.5 })
  const camRef = useRef(cam)
  camRef.current = cam
  /** Set once the user scrolls, zooms, or clicks the canvas; the agent then stops moving the camera. */
  const userMoved = useRef(false)
  const elements = useCanvasElements(doc, selectedElements, projectEpoch)
  const marqueeVersion = useRef(0)
  const [marqueeRect, setMarqueeRect] = useState<ElementRect | null>(null)
  const [marqueePreview, setMarqueePreview] = useState<MarqueePreview | null>(null)
  const gesture = useRef<Gesture>({ kind: 'idle' })
  const [pointerMode, setPointerMode] = useState<'idle' | 'pan' | 'move' | 'resize' | 'marquee'>('idle')
  const [draft, setDraft] = useState<Draft>({})
  const draftRef = useRef<Draft>({})
  const preview = (next: Draft) => { draftRef.current = next; setDraft(next) }
  const cancelGesture = useCallback(() => {
    marqueeVersion.current++
    elements.cancelMarquee()
    setMarqueeRect(null)
    setMarqueePreview(null)
    gesture.current = { kind: 'idle' }
    setPointerMode('idle')
    draftRef.current = {}
    setDraft({})
  }, [elements.cancelMarquee])
  const [space, setSpace] = useState(false)
  const [live, setLive] = useState<FrameId | null>(null)
  const [cmd, setCmd] = useState(false)
  const elementRef = useRef(selectedElements)
  elementRef.current = selectedElements
  const pointer = useRef<{ frameId: FrameId; x: number; y: number } | null>(null)
  const hoverAtPointer = (enabled: boolean) => {
    const point = pointer.current
    const frame = point && doc.frames.find((f) => f.id === point.frameId)
    if (enabled && point && frame?.kind === 'html' && live !== frame.id && !space && tool === 'select') elements.request(frame, 'hover', point)
    else elements.clearHover()
  }

  useEffect(() => {
    const g = gesture.current
    const ids = g.kind === 'move' || g.kind === 'nudge' ? g.frames.map((f) => f.id) : g.kind === 'resize' ? [g.id] : []
    if (ids.some((id) => !doc.frames.some((f) => f.id === id) || !selection.includes(id))) cancelGesture()
    if (live && !doc.frames.some((f) => f.id === live)) setLive(null)
  }, [doc, selection, live, cancelGesture])

  useEffect(() => {
    const blur = () => { cancelGesture(); setSpace(false); setCmd(false); elements.clearHover() }
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

  const focusFrame = useCallback((id: FrameId) => {
    const f = docRef.current.frames.find((fr) => fr.id === id)
    if (f) fitRect({ x: f.x, y: f.y, width: f.width, height: Math.min(f.height, f.width * 1.2) }, 0.9)
  }, [fitRect])

  useImperativeHandle(ref, () => ({
    fit: () => { userMoved.current = true; fit() },
    zoomBy: (k) => { userMoved.current = true; zoomBy(k) },
    focusFrame,
    followFrame: (id) => {
      if (userMoved.current) return false
      const f = docRef.current.frames.find((fr) => fr.id === id)
      const el = host.current
      if (!f || !el) return true
      const c = camRef.current
      const left = f.x * c.zoom + c.x
      const top = f.y * c.zoom + c.y
      const shown = (Math.min(el.clientWidth, left + f.width * c.zoom) - Math.max(0, left)) / (f.width * c.zoom)
      const startsInView = top >= 0 && top < el.clientHeight * 0.6
      if (shown < 0.9 || !startsInView) focusFrame(id)
      return true
    },
    armFollow: () => { userMoved.current = false }
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
      userMoved.current = true
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
      if (e.key === 'Meta') { setCmd(true); hoverAtPointer(true) }
      if (nativeEditing() || selectedText()) return
      const picked = elementRef.current
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
        if (picked.length) void api.deleteElements(projectEpoch)
        else void api.frameCommand({ type: 'delete' })
      } else if (e.key === 'Escape') {
        cancelGesture()
        setLive(null)
        elements.clearHover()
        if (picked.length) {
          const frame = doc.frames.find((f) => f.id === picked[0].frameId)
          if (frame?.kind === 'html' && picked.length === 1 && picked[0].path.length > 1) void elements.request(frame, 'select', { path: picked[0].path.slice(0, -1) })
          else if (frame?.kind === 'html') void api.selectElements(frame, projectEpoch, [])
        } else onSelect([])
      } else if ((e.metaKey && e.key === '0') || (e.shiftKey && e.key === '!')) {
        e.preventDefault()
        userMoved.current = true
        fit()
      } else if (e.metaKey && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        userMoved.current = true
        zoomBy(1.25)
      } else if (e.metaKey && e.key === '-') {
        e.preventDefault()
        userMoved.current = true
        zoomBy(0.8)
      } else if (e.shiftKey && e.key === '@' && selection[0]) {
        const f = doc.frames.find((fr) => fr.id === selection[0])
        userMoved.current = true
        if (f) fitRect(f, 1)
      }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Meta') { setCmd(false); hoverAtPointer(!!pointer.current && selection.includes(pointer.current.frameId)) }
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
  }, [selection, onSelect, fit, fitRect, doc.frames, zoomBy, projectEpoch, cancelGesture, selectedElements, elements.request, elements.clearHover, space, tool, live])

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
    userMoved.current = true
    cancelGesture()
    host.current?.focus()
    window.getSelection()?.removeAllRanges()
    ;(frameEl ?? host.current)?.setPointerCapture(e.pointerId)
    const panTool = space || tool === 'hand'
    if (panTool || e.button === 1) {
      gesture.current = { kind: 'pan', sx: e.clientX, sy: e.clientY, cam }
      setPointerMode('pan')
      return
    }
    if (!frameEl) {
      gesture.current = { kind: 'marquee', sx: e.clientX, sy: e.clientY, moved: false }
      setPointerMode('marquee')
      setLive(null)
      elements.clearHover()
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
    const toggleElement = e.shiftKey && selectedElements[0]?.frameId === id && !target.closest('[data-label]')
    if (e.shiftKey && !toggleElement && selection.includes(id)) {
      onSelect(selection.filter((selected) => selected !== id))
      return
    }
    const ids = e.metaKey && !target.closest('[data-label]') ? [id] : e.shiftKey && !toggleElement ? [...selection, id] : selection.includes(id) ? selection : [id]
    if (ids.length !== selection.length || ids.some((id, i) => id !== selection[i])) onSelect(ids)
    const box = frameEl.getBoundingClientRect()
    const pick: Extract<Gesture, { kind: 'move' }>['pick'] = f.kind === 'html' && !target.closest('[data-label]') && (toggleElement || !e.shiftKey && (e.metaKey || selection.length === 1 && selection[0] === id))
      ? { x: (e.clientX - box.left) / cam.zoom, y: (e.clientY - box.top) / cam.zoom, mode: toggleElement ? 'toggle' : 'replace' } : null
    elements.clearHover()
    gesture.current = { kind: 'move', id, frames: doc.frames.filter((f) => ids.includes(f.id)), sx: e.clientX, sy: e.clientY, dx: 0, dy: 0, moved: false, collapse: !e.shiftKey, pick }
    setPointerMode('move')
  }

  const dragRect = (g: Extract<Gesture, { kind: 'marquee' }>, e: React.PointerEvent): ElementRect => {
    const box = host.current!.getBoundingClientRect()
    return { x: (Math.min(g.sx, e.clientX) - box.left - cam.x) / cam.zoom, y: (Math.min(g.sy, e.clientY) - box.top - cam.y) / cam.zoom, width: Math.abs(e.clientX - g.sx) / cam.zoom, height: Math.abs(e.clientY - g.sy) / cam.zoom }
  }

  const previewMarquee = async (rect: ElementRect, add: boolean) => {
    const version = ++marqueeVersion.current
    const target = marqueeTarget(doc.frames, rect)
    setMarqueeRect(rect)
    if (target.kind === 'frames') {
      elements.cancelMarquee()
      setMarqueePreview({ kind: 'frames', ids: [...new Set([...(add && !selectedElements.length ? selection : []), ...target.ids])] })
    } else {
      const hits = await elements.marquee(target.frame, target.rect)
      if (!hits || version !== marqueeVersion.current) return
      const base = add && selectedElements[0]?.frameId === target.frame.id ? selectedElements : []
      setMarqueePreview({ kind: 'elements', hits: [...base, ...hits.filter((hit) => !base.some((picked) => samePath(picked.path, hit.path))).map((hit) => ({ ...hit, frameId: target.frame.id }))] })
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (g.kind === 'idle') {
      const frameEl = (e.target as HTMLElement).closest<HTMLElement>('[data-frame-id]')
      const frame = doc.frames.find((f) => f.id === frameEl?.dataset.frameId)
      if (frameEl && frame && !(e.target as HTMLElement).closest('[data-label], [data-handle]')) {
        const box = frameEl.getBoundingClientRect()
        pointer.current = { frameId: frame.id, x: (e.clientX - box.left) / cam.zoom, y: (e.clientY - box.top) / cam.zoom }
        hoverAtPointer(selection.includes(frame.id) || e.metaKey || cmd)
      } else { pointer.current = null; elements.clearHover() }
    }
    if (g.kind === 'marquee') {
      if (!g.moved && Math.hypot(e.clientX - g.sx, e.clientY - g.sy) < 3) return
      g.moved = true
      void previewMarquee(dragRect(g, e), e.shiftKey)
    } else if (g.kind === 'pan') setCam({ ...g.cam, x: g.cam.x + e.clientX - g.sx, y: g.cam.y + e.clientY - g.sy })
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

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current
    if (g.kind === 'marquee') {
      const target = marqueeTarget(doc.frames, dragRect(g, e))
      cancelGesture()
      if (!g.moved) { onSelect([]); return }
      if (target.kind === 'frames') onSelect([...new Set([...(e.shiftKey && !selectedElements.length ? selection : []), ...target.ids])])
      else {
        const version = marqueeVersion.current
        const mode = e.shiftKey ? 'add' : 'replace'
        void elements.marquee(target.frame, target.rect).then((hits) => {
          if (hits && version === marqueeVersion.current) void api.selectElements(target.frame, projectEpoch, hits, mode)
        })
      }
      return
    }
    if (g.kind === 'move') {
      if (g.moved) void api.frameCommand({ type: 'arrange', ids: g.frames.map((f) => f.id), projectEpoch, operation: { kind: 'translate', dx: g.dx, dy: g.dy } })
      else if (g.pick) {
        const frame = doc.frames.find((f) => f.id === g.id)
        if (frame?.kind === 'html') void elements.request(frame, 'select', g.pick, g.pick.mode)
      } else if (g.collapse) onSelect([g.id])
    } else if (g.kind === 'resize') {
      const patch = draftRef.current[g.id]
      if (patch && doc.frames.some((f) => f.id === g.id)) void api.op({ type: 'patch', id: g.id, patch })
    }
    cancelGesture()
  }

  const displayedHits = marqueePreview ? marqueePreview.kind === 'elements' ? marqueePreview.hits : [] : selectedElements
  const union = unionRect(displayedHits.map((hit) => hit.rect))
  const outlineHits = [
    ...(elements.hovered ? [{ kind: 'hover', hit: elements.hovered }] : []),
    ...displayedHits.map((hit) => ({ kind: 'selected', hit })),
    ...(displayedHits.length > 1 && union ? [{ kind: 'union', hit: { ...displayedHits[0], path: [], rect: union } }] : [])
  ]
  const selected = doc.frames.filter((f) => selection.includes(f.id))
  const panning = pointerMode === 'pan'
  const pointerGesture = pointerMode !== 'idle'

  return (
    <div
      ref={host}
      tabIndex={-1}
      className={`canvas ${space || tool === 'hand' ? 'is-space' : ''} ${panning ? 'is-panning' : ''} ${pointerGesture ? 'is-gesturing' : ''}`}
      onLoadCapture={(e) => {
        const frameId = (e.target as HTMLElement).closest<HTMLElement>('[data-frame-id]')?.dataset.frameId
        if (presence.phase === 'idle' || presence.target.kind !== 'frame' || presence.target.frameId !== frameId) return
        for (const animation of e.currentTarget.querySelector('.canvas-presence .presence-band')?.getAnimations() ?? []) {
          animation.currentTime = 0
          animation.play()
        }
      }}
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
      onPointerLeave={() => { pointer.current = null; elements.clearHover() }}
      onPointerUp={onPointerUp}
      onPointerCancel={cancelGesture}
      onLostPointerCapture={() => { if (gesture.current.kind !== 'idle' && gesture.current.kind !== 'nudge') cancelGesture() }}
      onDoubleClick={(e) => {
        const id = (e.target as HTMLElement).closest<HTMLElement>('[data-frame-id]')?.dataset.frameId as FrameId | undefined
        if (id && doc.frames.find((f) => f.id === id)?.kind === 'html') { setLive(id); onSelect([id]); elements.clearHover() }
      }}
      style={{ '--zoom': cam.zoom } as React.CSSProperties}
    >
      <div className="world" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.zoom})` }}>
        {doc.frames.map((f) => {
          const box = { ...f, ...draft[f.id] }
          const isSel = selection.includes(f.id)
          return (
            <div key={f.id} data-frame-id={f.id} className={`frame ${isSel ? 'is-selected' : ''} ${live === f.id ? 'is-live' : ''} ${marqueePreview?.kind === 'frames' && marqueePreview.ids.includes(f.id) ? 'is-marquee-preview' : ''}`} style={{ left: box.x, top: box.y, width: box.width, height: box.height }}>
              <div className="frame-label" data-label>
                <Icon name={f.kind === 'image' ? 'image' : 'frame'} size={12} />
                <span>{f.name}</span>
                <span className="frame-size">{box.width} × {box.height}</span>
              </div>
              {f.kind === 'html' ? (
                <FrameView frame={f} port={port} register={elements.register} onReady={elements.resolve} />
              ) : (
                <img src={`http://127.0.0.1:${port}/assets/${f.asset}`} alt={f.name} draggable={false} />
              )}
              {live !== f.id && <div className="frame-shield" />}
              {isSel && <div className="frame-handle" data-handle />}
            </div>
          )
        })}
      </div>

      <CanvasPresence visual={presence} frames={doc.frames.map((frame) => ({ ...frame, ...draft[frame.id] }))} cam={cam} />

      {outlineHits.map(({ kind, hit }) => {
        const frame = hit && doc.frames.find((f) => f.id === hit.frameId)
        if (!hit || !frame || live === frame.id || kind === 'hover' && (space || tool === 'hand' || pointerGesture)) return null
        const box = { ...frame, ...draft[frame.id] }
        const { rect } = hit
        return <div key={`${kind}:${hit.path.join('/')}`} className={`element-outline is-${kind}`} data-element-path={hit.path.join('/')} style={{ left: cam.x + (box.x + rect.x) * cam.zoom, top: cam.y + (box.y + rect.y) * cam.zoom, width: rect.width * cam.zoom, height: rect.height * cam.zoom }}>
          {(kind === 'union' || kind === 'selected' && displayedHits.length === 1) && <>
            {['tl', 'tr', 'bl', 'br'].map((corner) => <span key={corner} className={`element-handle ${corner}`} />)}
            <span className="element-size">{Math.round(rect.width)} × {Math.round(rect.height)}</span>
          </>}
        </div>
      })}

      {marqueeRect && <div className="canvas-marquee" style={{ left: cam.x + marqueeRect.x * cam.zoom, top: cam.y + marqueeRect.y * cam.zoom, width: marqueeRect.width * cam.zoom, height: marqueeRect.height * cam.zoom }} />}

      {selected.length === 1 && pointerMode !== 'marquee' && !draft[selected[0].id] && (
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
function FrameView({ frame, port, register, onReady }: { frame: HtmlFrame; port: number; register: (id: FrameId, node: HTMLIFrameElement | null) => void; onReady: () => void }) {
  const revision = useRef({ frame, port, src: `http://127.0.0.1:${port}/frame/${frame.id}?canvas=1&v=${frame.updatedAt}` })
  const previous = revision.current
  if (previous.port !== port || previous.frame.id !== frame.id || previous.frame.html !== frame.html || previous.frame.name !== frame.name) {
    revision.current = { frame, port, src: `http://127.0.0.1:${port}/frame/${frame.id}?canvas=1&v=${frame.updatedAt}` }
  }
  const src = revision.current.src
  const title = frame.name
  const [shown, setShown] = useState(src)
  const [pending, setPending] = useState<string | null>(null)
  const bind = useCallback((node: HTMLIFrameElement | null) => register(frame.id, node), [register, frame.id])
  useEffect(() => { if (shown === src) onReady() }, [shown, src, onReady])
  useEffect(() => {
    if (src !== shown) setPending(src)
  }, [src, shown])
  return (
    <>
      <iframe ref={shown === src ? bind : undefined} onLoad={onReady} key={shown} title={title} src={shown} scrolling="no" sandbox="allow-scripts" />
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
