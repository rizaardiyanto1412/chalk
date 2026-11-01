import { useCallback, useEffect, useRef, useState } from 'react'
import type { Doc, FrameId, HtmlFrame, SelectedElement } from '../../shared/model'
import { elementReplySchema, type ElementHit, type ElementRequest } from '../../shared/elementSelection'
import { api } from './api'

type Intent = 'hover' | 'select' | 'resolve'
interface Request {
  requestId: string
  frame: HtmlFrame
  node: HTMLIFrameElement
}

export function useCanvasElements(doc: Doc, selected: SelectedElement | null, projectEpoch: number) {
  const nodes = useRef(new Map<FrameId, HTMLIFrameElement>())
  const requests = useRef(new Map<Intent, Request>())
  const current = useRef({ doc, selected })
  current.current = { doc, selected }
  const [hovered, setHovered] = useState<(ElementHit & { frameId: FrameId }) | null>(null)
  const request = useCallback((frame: HtmlFrame, intent: Intent, query: { x: number; y: number } | { path: number[] }) => {
    const node = nodes.current.get(frame.id)
    if (!node?.contentWindow) return
    const requestId = crypto.randomUUID()
    requests.current.set(intent, { requestId, frame, node })
    const message: ElementRequest = 'path' in query ? { type: 'chalk:resolve', requestId, ...query } : { type: 'chalk:hit', requestId, ...query }
    node.contentWindow.postMessage(message, '*')
  }, [])
  const resolve = useCallback(() => {
    const { doc, selected } = current.current
    if (!selected) return
    const frame = doc.frames.find((f) => f.id === selected.frameId)
    if (frame?.kind === 'html') request(frame, 'resolve', { path: selected.path })
  }, [request])
  const register = useCallback((id: FrameId, node: HTMLIFrameElement | null) => {
    if (node) nodes.current.set(id, node)
    else {
      nodes.current.delete(id)
      for (const [intent, pending] of requests.current) if (pending.frame.id === id) requests.current.delete(intent)
    }
  }, [])
  const clearHover = useCallback(() => {
    requests.current.delete('hover')
    setHovered(null)
  }, [])
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      const pending = [...requests.current].find(([, value]) => value.node.contentWindow === event.source && nodes.current.get(value.frame.id) === value.node)
      if (!pending) return
      const parsed = elementReplySchema.safeParse(event.data)
      if (!parsed.success) return
      const match = [...requests.current].find(([, value]) => value.requestId === parsed.data.requestId && value.node.contentWindow === event.source && nodes.current.get(value.frame.id) === value.node)
      if (!match) return
      const [intent, { frame }] = match
      requests.current.delete(intent)
      const latest = current.current.doc.frames.find((f) => f.id === frame.id)
      if (latest?.kind !== 'html' || latest.html !== frame.html) return
      const { hit } = parsed.data
      if (intent === 'hover') setHovered(hit ? { ...hit, frameId: frame.id } : null)
      else {
        if (intent === 'resolve') {
          const picked = current.current.selected
          if (!picked || picked.frameId !== frame.id) return
          if (hit && (JSON.stringify(hit.path) !== JSON.stringify(picked.path) || JSON.stringify(hit.rect) === JSON.stringify(picked.rect))) return
        }
        void api.selectElement(frame, projectEpoch, hit)
      }
    }
    window.addEventListener('message', receive)
    return () => window.removeEventListener('message', receive)
  }, [projectEpoch])
  const path = selected && JSON.stringify(selected.path)
  useEffect(() => {
    requests.current.delete('resolve')
    if (!selected) return
    resolve()
    const timer = window.setInterval(resolve, 200)
    return () => window.clearInterval(timer)
  }, [selected?.frameId, path, resolve])
  return { hovered, request, register, resolve, clearHover }
}
