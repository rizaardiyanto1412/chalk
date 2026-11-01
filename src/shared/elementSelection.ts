import { z } from 'zod'

export const elementPathSchema = z.array(z.number().int().nonnegative().max(100000)).min(1).max(128)
export const elementRectSchema = z.object({
  x: z.number().finite().min(-1000000).max(1000000),
  y: z.number().finite().min(-1000000).max(1000000),
  width: z.number().finite().nonnegative().max(1000000),
  height: z.number().finite().nonnegative().max(1000000)
}).strict()
export const elementHitSchema = z.object({ path: elementPathSchema, rect: elementRectSchema }).strict()
export const elementReplySchema = z.object({
  type: z.literal('chalk:element'),
  requestId: z.string().uuid(),
  hits: z.array(elementHitSchema).max(10000)
}).strict()
export type ElementHit = z.infer<typeof elementHitSchema>
export type ElementRect = z.infer<typeof elementRectSchema>
export type ElementSelectionMode = 'replace' | 'add' | 'toggle'
export type ElementQuery =
  | { type: 'chalk:hit'; x: number; y: number }
  | { type: 'chalk:resolve'; paths: number[][] }
  | { type: 'chalk:marquee'; rect: ElementRect }

export type ElementRequest = ElementQuery & { requestId: string }

export const samePath = (a: number[], b: number[]) => a.length === b.length && a.every((index, i) => index === b[i])
export const intersects = (a: ElementRect, b: ElementRect) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
export const contains = (a: ElementRect, b: ElementRect) => a.x <= b.x && a.y <= b.y && a.x + a.width >= b.x + b.width && a.y + a.height >= b.y + b.height

export function unionRect(rects: ElementRect[]): ElementRect | null {
  if (!rects.length) return null
  const x = Math.min(...rects.map((r) => r.x))
  const y = Math.min(...rects.map((r) => r.y))
  return { x, y, width: Math.max(...rects.map((r) => r.x + r.width)) - x, height: Math.max(...rects.map((r) => r.y + r.height)) - y }
}
