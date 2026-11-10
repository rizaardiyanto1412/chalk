import { z } from 'zod'

export const EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export type Effort = (typeof EFFORTS)[number]
export const effortSchema = z.enum(EFFORTS)
export const EFFORT_LABELS: Record<Effort, string> = { low: 'Low', medium: 'Medium', high: 'High', xhigh: 'Extra high', max: 'Max' }

/** One model the user's Claude Code offers. `id` is what Chalk sends; '' means Claude Code's default. */
export interface ModelOption {
  id: string
  /** Family name, such as "Opus". */
  label: string
  /** Family and version, such as "Opus 5.5". */
  version: string
  summary: string
  price: string
  efforts: Effort[]
}

/** Used until Claude Code answers, and when it cannot be asked. */
export const FALLBACK_MODELS: ModelOption[] = [
  { id: '', label: 'Default', version: 'Claude Code default', summary: 'Whatever Claude Code recommends', price: '', efforts: [...EFFORTS] },
  { id: 'opus', label: 'Opus', version: 'Opus', summary: 'Best for everyday, complex tasks', price: '', efforts: [...EFFORTS] },
  { id: 'sonnet', label: 'Sonnet', version: 'Sonnet', summary: 'Efficient for routine tasks', price: '', efforts: [...EFFORTS] },
  { id: 'haiku', label: 'Haiku', version: 'Haiku', summary: 'Fastest for quick answers', price: '', efforts: [...EFFORTS] },
  { id: 'fable', label: 'Fable', version: 'Fable', summary: 'Most capable for the hardest tasks', price: '', efforts: [...EFFORTS] }
]

/** The picker's short label: version for listed models, the raw id for a custom one. */
export function modelName(models: readonly ModelOption[], id: string): string {
  const found = models.find((m) => m.id === id)
  if (!found) return id
  return found.id === '' ? 'Default' : found.version
}
