import { randomBytes } from 'node:crypto'
import { homedir } from 'node:os'
import { query } from '@anthropic-ai/claude-agent-sdk'
import type { BrowserPick, Frame, FrameId, SelectedElement } from '../shared/model'
import { sectionIssues, sectionStyleCount, type JobSpec } from '../shared/run'
import type { PhotoKeys } from './photos'
import { Browser } from './browser'
import { AGENT_SYSTEM } from './prompt'
import { WORKER_RULES } from './runPrompt'
import type { ResolvedStyle } from './styles'
import type { Codebase } from './codebase'

export interface Draft { id: FrameId; name: string; html: string; width: number; height: number; revision: number; styleBlocks?: number }
export class DraftBook {
  private readonly drafts = new Map<string, Readonly<Draft>>()
  private sealed = false
  constructor(readonly max: number, readonly fixedWidth: number | null, readonly role: JobSpec['role'], seed?: Draft, private readonly onChange?: (draft: Readonly<Draft> | null, id: string) => void) {
    if (seed) this.drafts.set(seed.id, Object.freeze({ ...seed, styleBlocks: sectionStyleCount(seed.html) }))
  }
  assertOpen(): void { if (this.sealed) throw new Error('This run was stopped or the job has finished.') }
  get(id: string): Readonly<Draft> | undefined { return this.drafts.get(id) }
  list(): readonly Readonly<Draft>[] { return [...this.drafts.values()] }
  put(d: Omit<Draft, 'revision'>, baseRevision?: number): number {
    this.assertOpen()
    const previous = this.drafts.get(d.id)
    if (previous && baseRevision !== previous.revision) throw new Error('Stale baseRevision. Read the latest draft before updating.')
    if (!previous && (this.role === 'integrate' || this.drafts.size >= this.max)) throw new Error('This job cannot create another draft.')
    if (this.fixedWidth !== null && d.width !== this.fixedWidth) throw new Error(`This job requires width ${this.fixedWidth}.`)
    if (this.role === 'section' || this.role === 'integrate') {
      const issues = sectionIssues(d.html)
      if (issues.length) throw new Error(`Section fragments cannot include ${issues.join(', ')}. Use body content only, without scripts.`)
    }
    const revision = (previous?.revision ?? 0) + 1
    const next = Object.freeze({ ...d, revision, styleBlocks: sectionStyleCount(d.html) })
    this.drafts.set(d.id, next)
    this.onChange?.(next, d.id)
    return revision
  }
  remove(id: string): void {
    this.assertOpen()
    if (this.role === 'integrate') throw new Error('The integrator cannot delete its seed.')
    if (!this.drafts.delete(id)) throw new Error('No owned draft with that id.')
    this.onChange?.(null, id)
  }
  seal(): readonly Readonly<Draft>[] { this.sealed = true; return this.list() }
}
export interface PageCapture {
  readonly url: string
  readonly title: string
  readonly tree: string
  readonly styles: Readonly<Record<string, unknown>>
  readonly png: Buffer
  readonly width: number
  readonly height: number
}
export interface ReferenceSet {
  readonly frames: readonly Readonly<Frame>[]
  readonly assets: ReadonlyMap<string, Buffer>
  readonly selectedElements: readonly SelectedElement[]
  readonly browserPick: BrowserPick | null
  readonly page: PageCapture | null
  readonly designNotes: string
  readonly style: ResolvedStyle | null
  /** Project assets this run's workers generated. Published frames link to them instead of inlining them. */
  readonly generated?: Set<string>
  /** The project's linked codebase at Send, read-only. */
  readonly codebase?: Codebase | null
}
export interface WorkerContext {
  readonly job: JobSpec
  readonly refs: ReferenceSet
  readonly drafts: DraftBook
  readonly controller: AbortController
  readonly signal: AbortSignal
  readonly origin: () => string
  readonly photoKeys: () => PhotoKeys
  readonly measure: (html: string, width: number) => Promise<number>
  readonly saveAsset: (name: string, bytes: Buffer) => void
  readonly activity: (tool: string, args?: unknown) => void
  readonly resources: WorkerResources
}
export class WorkerResources {
  private browser: Browser | null = null
  private browserOperations: Promise<unknown> = Promise.resolve()
  private readonly pending = new Set<Promise<unknown>>()
  check(ctx: WorkerContext): void {
    if (ctx.signal.aborted) throw new Error('This run was stopped.')
    ctx.drafts.assertOpen()
  }
  async tool<T>(ctx: WorkerContext, operation: () => Promise<T>): Promise<T> {
    this.check(ctx)
    const work = operation()
    this.pending.add(work)
    try { const result = await work; this.check(ctx); return result }
    finally { this.pending.delete(work) }
  }
  useBrowser<T>(ctx: WorkerContext, operation: (browser: Browser) => Promise<T>): Promise<T> {
    const result = this.browserOperations.then(async () => {
      this.check(ctx)
      this.browser ??= new Browser('desktop', { partition: `chalk-run-${randomBytes(24).toString('hex')}`, isolated: true, origin: ctx.origin() })
      const result = await operation(this.browser)
      this.check(ctx)
      return result
    })
    this.browserOperations = result.catch(() => {})
    return result
  }
  async dispose(): Promise<void> {
    try { if (this.browser) await this.browser.dispose() }
    finally {
      await Promise.allSettled([...this.pending])
      await this.browserOperations
    }
  }
}
export class WorkerRegistry {
  private readonly contexts = new Map<string, WorkerContext>()
  issue(ctx: WorkerContext): string { const token = randomBytes(32).toString('base64url'); this.contexts.set(token, ctx); return token }
  get(token: string): WorkerContext | undefined { return this.contexts.get(token) }
  revoke(token: string): void { this.contexts.delete(token) }
}
export interface WorkerResult { ok: boolean; canceled: boolean; error?: string; costUsd?: number }
export interface WorkerConfig { claude: string; cwd: string; model: string; mcpUrl: string; token: string; prompt: string; tools: string[] }
export async function runWorker(ctx: WorkerContext, cfg: WorkerConfig): Promise<WorkerResult> {
  let stream: ReturnType<typeof query> | undefined
  let costUsd: number | undefined
  let failure = 'The worker exited without a result.'
  let ok = false
  let stderr = ''
  try {
    stream = query({ prompt: cfg.prompt, options: {
      pathToClaudeCodeExecutable: cfg.claude, cwd: cfg.cwd, model: cfg.model || undefined,
      systemPrompt: AGENT_SYSTEM + '\n\n' + WORKER_RULES,
      strictMcpConfig: true, settingSources: [], persistSession: false,
      mcpServers: { chalk: { type: 'http', url: cfg.mcpUrl, headers: { authorization: `Bearer ${cfg.token}` }, alwaysLoad: true } },
      tools: ['WebFetch', 'WebSearch'], allowedTools: [...cfg.tools.map(n => `mcp__chalk__${n}`), 'WebFetch', 'WebSearch'],
      disallowedTools: ['Bash', 'Write', 'Edit', 'NotebookEdit', 'Task', 'Agent', 'Skill'],
      permissionMode: 'dontAsk', abortController: ctx.controller, maxTurns: 60,
      stderr: data => { stderr = (stderr + data).slice(-4000) },
      env: { ...process.env, PATH: `${process.env.PATH ?? ''}:/opt/homebrew/bin:/usr/local/bin:${homedir()}/.local/bin` }
    } })
    for await (const m of stream) {
      if (m.type === 'assistant') for (const block of m.message.content) if (block.type === 'tool_use') ctx.activity(block.name.replace(/^mcp__chalk__/, ''))
      if (m.type === 'result') {
        costUsd = Number.isFinite(m.total_cost_usd) && m.total_cost_usd >= 0 ? m.total_cost_usd : undefined
        ok = m.subtype === 'success'
        if (m.subtype !== 'success') failure = m.errors.join('\n') || m.subtype
      }
    }
  } catch (e) { ok = false; failure = `${e instanceof Error ? e.message : String(e)}${stderr ? `\n${stderr}` : ''}` }
  finally { stream?.close() }
  return { ok, canceled: ctx.signal.aborted, error: ok ? undefined : failure.replaceAll(cfg.token, '[redacted]'), costUsd }
}
