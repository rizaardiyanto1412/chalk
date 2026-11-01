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
  hit: elementHitSchema.nullable()
}).strict()
export type ElementHit = z.infer<typeof elementHitSchema>
export type ElementRequest =
  | { type: 'chalk:hit'; requestId: string; x: number; y: number }
  | { type: 'chalk:resolve'; requestId: string; path: number[] }
