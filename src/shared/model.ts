export type FrameId = string & { readonly __brand: 'FrameId' }

interface FrameBase {
  id: FrameId
  name: string
  x: number
  y: number
  width: number
  height: number
  updatedAt: number
}

export interface HtmlFrame extends FrameBase {
  kind: 'html'
  html: string
}

export interface ImageFrame extends FrameBase {
  kind: 'image'
  /** File name inside the project's assets folder. */
  asset: string
  sourceUrl?: string
}

export type Frame = HtmlFrame | ImageFrame

export const EXPORT_FORMATS = ['png', 'jpeg', 'html', 'pdf'] as const
export type ExportFormat = (typeof EXPORT_FORMATS)[number]

export type ExportResult =
  | { status: 'saved'; path: string; format: ExportFormat; bytes: number; width: number; height: number }
  | { status: 'canceled' }
  | { status: 'error'; message: string }

export type CopyImageResult =
  | { status: 'copied'; width: number; height: number }
  | { status: 'error'; message: string }

export type ExportActivity = { status: 'busy'; message: string } | ExportResult | CopyImageResult

export interface Doc {
  version: 1
  frames: Frame[]
}

export const emptyDoc = (): Doc => ({ version: 1, frames: [] })

export type FramePatch = Partial<Pick<HtmlFrame, 'name' | 'x' | 'y' | 'width' | 'height' | 'html'>>

export type Op =
  | { type: 'add'; frame: Frame }
  | { type: 'patch'; id: FrameId; patch: FramePatch }
  | { type: 'delete'; id: FrameId }
  | { type: 'reorder'; ids: FrameId[] }

export const FRAME_GAP = 80

export function applyOp(doc: Doc, op: Op, now = Date.now()): Doc {
  switch (op.type) {
    case 'add':
      return { ...doc, frames: [...doc.frames, op.frame] }
    case 'patch':
      return {
        ...doc,
        frames: doc.frames.map((f) => {
          if (f.id !== op.id) return f
          const { html, ...rest } = op.patch
          const next = { ...f, ...rest, updatedAt: now }
          return f.kind === 'html' && html !== undefined ? { ...next, html } : next
        })
      }
    case 'delete':
      return { ...doc, frames: doc.frames.filter((f) => f.id !== op.id) }
    case 'reorder': {
      const byId = new Map(doc.frames.map((f) => [f.id, f]))
      const ordered = op.ids.flatMap((id) => byId.get(id) ?? [])
      const rest = doc.frames.filter((f) => !op.ids.includes(f.id))
      return { ...doc, frames: [...ordered, ...rest] }
    }
  }
}

/** Next free slot to the right of everything on the canvas, top-aligned with the first frame. */
export function nextSlot(doc: Doc): { x: number; y: number } {
  if (doc.frames.length === 0) return { x: 0, y: 0 }
  const right = Math.max(...doc.frames.map((f) => f.x + f.width))
  const top = Math.min(...doc.frames.map((f) => f.y))
  return { x: right + FRAME_GAP, y: top }
}

export function findFrame(doc: Doc, id: string): Frame | undefined {
  return doc.frames.find((f) => f.id === id)
}

/** Parse untrusted JSON from disk into a Doc. Unknown frames are dropped. */
export function parseDoc(raw: unknown): Doc {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as Doc).frames)) return emptyDoc()
  const frames = (raw as Doc).frames.filter(
    (f): f is Frame =>
      !!f &&
      typeof f.id === 'string' &&
      typeof f.x === 'number' &&
      typeof f.y === 'number' &&
      typeof f.width === 'number' &&
      typeof f.height === 'number' &&
      ((f.kind === 'html' && typeof f.html === 'string') || (f.kind === 'image' && typeof f.asset === 'string'))
  )
  return { version: 1, frames }
}

export interface BrowserPick {
  url: string
  selector: string
  tag: string
  text: string
  rect: { x: number; y: number; width: number; height: number }
  outerHTML: string
}

export interface Selection {
  frameIds: FrameId[]
  browserPick: BrowserPick | null
}

export type AgentEvent =
  | { type: 'user'; text: string }
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; summary: string }
  | { type: 'error'; text: string }
  | { type: 'done'; costUsd?: number; durationMs?: number }

export type AgentStatus = 'idle' | 'running'
