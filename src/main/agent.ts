import { EventEmitter } from 'node:events'
import { homedir } from 'node:os'
import { findCli } from './agentCli'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { AgentEvent, AgentStatus, BrowserPick, Frame, SelectedElement } from '../shared/model'
import type { ResolvedStyle } from './styles'
import { AGENT_SYSTEM, STYLE_PRECEDENCE } from './prompt'
import { TOOL_NAMES } from './tools'

export interface TurnContext {
  selectedFrames: Frame[]
  selectedElements: SelectedElement[]
  browserPick: BrowserPick | null
  browserUrl: string
  style: ResolvedStyle | null
}

/** Pure: the context block the agent sees ahead of the user's words. */
export function contextBlock(c: TurnContext): string {
  const lines: string[] = []
  if (c.selectedFrames.length) lines.push(`Selected frames: ${c.selectedFrames.map((f) => `"${f.name}" (id ${f.id}, ${f.kind})`).join(', ')}`)
  if (c.selectedElements.length) lines.push(`Selected canvas elements (path uses element child indexes from body, CSS pixel rect, stored HTML trimmed):\n${JSON.stringify(c.selectedElements)}`)
  const references = c.selectedFrames.filter((f) => f.kind === 'image')
  if (references.length) lines.push(`Selected image references: ${references.map((f) => f.id).join(', ')}. View each with screenshot_frame before designing.`)
  if (c.browserUrl && !c.browserUrl.startsWith('about:')) lines.push(`Built-in browser is on: ${c.browserUrl}`)
  if (c.browserPick) {
    const p = c.browserPick
    lines.push(`The user picked this element in the browser (${p.url}): <${p.tag}> at ${p.selector}, ${Math.round(p.rect.width)}×${Math.round(p.rect.height)}px. Text: "${p.text.slice(0, 200)}". HTML (trimmed):\n${p.outerHTML.slice(0, 2000)}`)
  }
  if (c.style) lines.push(`${STYLE_PRECEDENCE}\n<chosen-style>\n${JSON.stringify(c.style)}\n</chosen-style>`)
  return lines.length ? `<context>\n${lines.join('\n')}\n</context>\n\n` : ''
}

export const MODELS = [
  { id: '', label: 'Default' },
  { id: 'opus', label: 'Opus' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'claude-fable-5-1', label: 'Fable' }
] as const

export class Agent extends EventEmitter {
  status: AgentStatus = 'idle'
  private sessionId: string | undefined
  private abort: AbortController | null = null

  constructor(private readonly mcpUrl: () => string, private readonly cwd: () => string) {
    super()
  }

  private emitEvent(e: AgentEvent): void {
    this.emit('event', e)
  }

  private setStatus(s: AgentStatus): void {
    this.status = s
    this.emit('status', s)
  }

  useSession(sessionId?: string): void {
    if (this.status === 'running') throw new Error('Stop the current turn before switching chats.')
    this.sessionId = sessionId
  }

  stop(): void {
    this.abort?.abort()
  }

  async send(text: string, ctx: TurnContext, model: string): Promise<void> {
    if (this.status === 'running') return
    const claude = findCli('claude')
    this.emitEvent({ type: 'user', text })
    if (!claude) {
      this.emitEvent({ type: 'error', text: 'Claude Code was not found. Install it from https://claude.com/claude-code and sign in with `claude`.' })
      return
    }
    this.setStatus('running')
    this.emitEvent({ type: 'start', model: model || null })
    const abort = new AbortController()
    this.abort = abort
    const resume = this.sessionId
    let receivedContent = false
    const run = async (sessionId?: string): Promise<void> => {
      let stderr = ''
      try {
        const stream = query({
          prompt: contextBlock(ctx) + text,
          options: {
            pathToClaudeCodeExecutable: claude,
            cwd: this.cwd(),
            resume: sessionId,
            model: model || undefined,
            systemPrompt: AGENT_SYSTEM,
            settingSources: [],
            mcpServers: { chalk: { type: 'http', url: this.mcpUrl(), alwaysLoad: true } },
            tools: ['WebFetch', 'WebSearch'],
            allowedTools: [...TOOL_NAMES.map((n) => `mcp__chalk__${n}`), 'WebFetch', 'WebSearch'],
            disallowedTools: ['Bash', 'Write', 'Edit', 'NotebookEdit', 'Task', 'Agent', 'Skill'],
            permissionMode: 'dontAsk',
            abortController: abort,
            stderr: (data) => { stderr = (stderr + data).slice(-4000) },
            env: { ...process.env, PATH: `${process.env.PATH ?? ''}:/opt/homebrew/bin:/usr/local/bin:${homedir()}/.local/bin` }
          }
        })
        for await (const m of stream) {
          if (m.type === 'system' && m.subtype === 'init') {
            this.sessionId = m.session_id
            this.emit('session', m.session_id)
            this.emitEvent({ type: 'model', model: m.model })
          } else if (m.type === 'assistant' && !m.parent_tool_use_id) {
            receivedContent = true
            for (const block of m.message.content) {
              if (block.type === 'text' && block.text.trim()) this.emitEvent({ type: 'text', text: block.text })
              else if (block.type === 'tool_use' && block.name !== 'ToolSearch') this.emitEvent({ type: 'tool', name: block.name.replace(/^mcp__chalk__/, ''), summary: summarize(block.input) })
            }
          } else if (m.type === 'result') {
            if (m.subtype !== 'success') {
              const detail = m.errors.join('\n')
              if (sessionId && missingSession(detail)) throw new Error(detail)
              this.emitEvent({ type: 'error', text: `Agent stopped: ${m.subtype}` })
            }
            this.emitEvent({ type: 'done', costUsd: m.total_cost_usd, durationMs: m.duration_ms })
          }
        }
      } catch (error) {
        throw new Error(`${error instanceof Error ? error.message : String(error)}${stderr ? `\n${stderr}` : ''}`)
      }
    }
    try {
      try {
        await run(resume)
      } catch (error) {
        if (!resume || receivedContent || abort.signal.aborted || !missingSession(error instanceof Error ? error.message : String(error))) throw error
        this.sessionId = undefined
        this.emit('session', undefined)
        this.emitEvent({ type: 'notice', text: 'The previous Claude Code session is unavailable. Continuing in a new session. Your saved messages are still here.' })
        await run()
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      this.emitEvent(abort.signal.aborted ? { type: 'done' } : { type: 'error', text: msg })
    } finally {
      this.abort = null
      this.setStatus('idle')
    }
  }
}

function summarize(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const o = input as Record<string, unknown>
  const pick = o.name ?? o.url ?? o.ref ?? o.id ?? o.query
  return typeof pick === 'string' ? pick.slice(0, 80) : ''
}

function missingSession(message: string): boolean {
  return /no (?:conversation|session) found|unknown (?:session|conversation) id|(?:session|conversation).{0,80}(?:not found|does not exist|no longer exists)|could not (?:find|load|resume).{0,30}(?:session|conversation)/i.test(message)
}
