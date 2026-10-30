import { randomUUID } from 'node:crypto'

export const previews = new Map<string, { kind: 'fragment' | 'document'; html: string }>()

export function createPreview(html: string, origin: string, kind: 'fragment' | 'document' = 'fragment') {
  const token = randomUUID()
  previews.set(token, { kind, html })
  return { url: `${origin}/preview/${token}`, dispose: () => { previews.delete(token) } }
}
