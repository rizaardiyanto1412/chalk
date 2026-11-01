import { useCallback, useEffect, useRef, useState } from 'react'
import type { Doc, FrameId, HtmlFrame, SelectedElement } from '../../shared/model'
import { elementReplySchema, samePath, type ElementHit, type ElementRequest, type ElementQuery, type ElementSelectionMode, type ElementRect } from '../../shared/elementSelection'
import { api } from './api'

type Intent = 'hover' | 'select' | 'resolve' | 'marquee'
interface Request {
  requestId: string
  frame: HtmlFrame
  node: HTMLIFrameElement
  complete: (hits: ElementHit[] | null) => void
}

export function useCanvasElements(doc: Doc, selected: SelectedElement[], projectEpoch: number) {
  const nodes = useRef(new Map<FrameId, HTMLIFrameElement>())
  const requests = useRef(new Map<Intent, Request>())
  const current = useRef({ doc, selected })
  current.current = { doc, selected }
  const [hovered, setHovered] = useState<(ElementHit & { frameId: FrameId }) | null>(null)
  const cancel = useCallback((intent: Intent) => {
    requests.current.get(intent)?.complete(null)
    requests.current.delete(intent)
  }, [])
  const query = useCallback((frame: HtmlFrame, intent: Intent, message: ElementQuery): Promise<ElementHit[] | null> => {
    cancel(intent)
    const node = nodes.current.get(frame.id)
    const target = node?.contentWindow
    if (!node || !target) return Promise.resolve(null)
    const requestId = crypto.randomUUID()
    return new Promise((complete) => {
      requests.current.set(intent, { requestId, frame, node, complete })
      target.postMessage({ ...message, requestId } satisfies ElementRequest, '*')
    })
  }, [cancel])
  const request = useCallback(async (frame: HtmlFrame, intent: 'hover' | 'select', point: { x: number; y: number } | { path: number[] }, mode: ElementSelectionMode = 'replace') => {
    const hits = await query(frame, intent, 'path' in point ? { type: 'chalk:resolve', paths: [point.path] } : { type: 'chalk:hit', ...point })
    if (!hits) return
    if (intent === 'hover') setHovered(hits[0] ? { ...hits[0], frameId: frame.id } : null)
    else await api.selectElements(frame, projectEpoch, hits, mode)
  }, [query, projectEpoch])
  const resolve = useCallback(async () => {
    const { doc, selected } = current.current
    const frame = doc.frames.find((f) => f.id === selected[0]?.frameId)
    if (frame?.kind !== 'html') return
    const paths = JSON.stringify(selected.map((hit) => hit.path))
    const hits = await query(frame, 'resolve', { type: 'chalk:resolve', paths: selected.map((hit) => hit.path) })
    const latest = current.current.selected
    if (!hits || hits.some((hit) => !selected.some((picked) => samePath(picked.path, hit.path))) || latest[0]?.frameId !== frame.id || JSON.stringify(latest.map((hit) => hit.path)) !== paths || JSON.stringify(hits) === JSON.stringify(latest.map(({ path, rect }) => ({ path, rect })))) return
    await api.selectElements(frame, projectEpoch, hits)
  }, [query, projectEpoch])
  const marquee = useCallback((frame: HtmlFrame, rect: ElementRect) => query(frame, 'marquee', { type: 'chalk:marquee', rect }), [query])
  const cancelMarquee = useCallback(() => cancel('marquee'), [cancel])
  const register = useCallback((id: FrameId, node: HTMLIFrameElement | null) => {
    if (node) nodes.current.set(id, node)
    else {
      nodes.current.delete(id)
      for (const [intent, pending] of requests.current) if (pending.frame.id === id) cancel(intent)
    }
  }, [cancel])
  const clearHover = useCallback(() => {
    cancel('hover')
    setHovered(null)
  }, [cancel])
  useEffect(() => {
    const receive = (event: MessageEvent<unknown>) => {
      if (![...requests.current.values()].some((value) => value.node.contentWindow === event.source && nodes.current.get(value.frame.id) === value.node)) return
      const parsed = elementReplySchema.safeParse(event.data)
      if (!parsed.success) return
      const match = [...requests.current].find(([, value]) => value.requestId === parsed.data.requestId && value.node.contentWindow === event.source && nodes.current.get(value.frame.id) === value.node)
      if (!match) return
      const [intent, pending] = match
      requests.current.delete(intent)
      const latest = current.current.doc.frames.find((f) => f.id === pending.frame.id)
      pending.complete(latest?.kind === 'html' && latest.html === pending.frame.html ? parsed.data.hits : null)
    }
    window.addEventListener('message', receive)
    return () => {
      window.removeEventListener('message', receive)
      for (const intent of requests.current.keys()) cancel(intent)
    }
  }, [cancel])
  const paths = JSON.stringify(selected.map((hit) => hit.path))
  useEffect(() => {
    cancel('resolve')
    if (!selected.length) return
    void resolve()
    const timer = window.setInterval(() => void resolve(), 200)
    return () => window.clearInterval(timer)
  }, [selected[0]?.frameId, paths, resolve, cancel])
  return { hovered, request, register, resolve, clearHover, marquee, cancelMarquee }
}
