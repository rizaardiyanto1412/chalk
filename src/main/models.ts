import { EFFORTS, FALLBACK_MODELS, type Effort, type ModelOption } from '../shared/models'
import { findCli } from './agentCli'

let cached: Promise<ModelOption[]> | undefined

/** Turn Claude Code's "Opus 5.5 · Best for everyday, complex tasks · $4/$20 per Mtok" into its parts. */
function parse(entry: { value: string; displayName: string; description: string; supportedEffortLevels?: Effort[] }): ModelOption {
  const parts = entry.description.split(' · ').map((p) => p.trim())
  const price = parts.find((p) => p.startsWith('$')) ?? ''
  if (entry.value === 'default') {
    const current = /currently ([^)]+)\)/.exec(entry.description)?.[1]
    return { id: '', label: 'Default', version: current ? `Default · ${current}` : 'Claude Code default', summary: 'What Claude Code recommends', price, efforts: entry.supportedEffortLevels ?? [...EFFORTS] }
  }
  const rest = parts.filter((p) => p !== price)
  const version = rest[0] && rest[0].toLowerCase().startsWith(entry.displayName.toLowerCase()) ? rest.shift()! : entry.displayName
  return { id: entry.value, label: entry.displayName, version, summary: rest.join(' · '), price, efforts: entry.supportedEffortLevels ?? [] }
}

/** The models this user's Claude Code offers, asked once per app run. Falls back to a fixed list when it cannot answer. */
export function listModels(): Promise<ModelOption[]> {
  return (cached ??= (async () => {
    const claude = findCli('claude')
    if (!claude) return FALLBACK_MODELS
    const { query } = await import('@anthropic-ai/claude-agent-sdk')
    const idle = (async function* () { await new Promise(() => {}) })()
    const q = query({ prompt: idle, options: { pathToClaudeCodeExecutable: claude, settingSources: [], tools: [], persistSession: false } })
    try {
      const listed = await Promise.race([q.supportedModels(), new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000))])
      const models = listed.map(parse)
      return models.length ? models : FALLBACK_MODELS
    } catch {
      cached = undefined
      return FALLBACK_MODELS
    } finally {
      q.close()
    }
  })())
}
