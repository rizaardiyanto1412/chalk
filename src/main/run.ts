import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { query } from '@anthropic-ai/claude-agent-sdk'
import { nextSlot, FRAME_GAP, type AgentEvent, type FrameId, type Op, type RunNoticeMeta } from '../shared/model'
import { directionCount, expandJobs, integratorFor, isSplit, jobIdSchema, mergeSections, partCoverage, planJsonSchema, planSchema, runIdSchema, type JobSpec, type Plan, type RunProgress, type RunSettings } from '../shared/run'
import type { Store } from './store'
import { findCli } from './agentCli'
import type { TurnContext } from './agent'
import { loadStyle, styleSummaries, type ResolvedStyle } from './styles'
import { projectDesignNotes } from './design'
import { DraftBook, WorkerResources, type Draft, type PageCapture, type ReferenceSet, type WorkerContext, type WorkerRegistry, runWorker } from './worker'
import { frozenHtml, referenceAssetNames, workerTools } from './workerTools'
import { PLANNER_SYSTEM, plannerPrompt, workerPrompt } from './runPrompt'
import { newId } from './tools'

export interface RunDeps {
  store: Store
  registry: WorkerRegistry
  emit: (event: AgentEvent) => void
  progress: (progress: RunProgress) => void
  focus: (frameId: FrameId) => void
  capturePage: () => Promise<PageCapture | null>
  measure: WorkerContext['measure']
  origin: () => string
  photoKeys: WorkerContext['photoKeys']
}
interface LiveJob { ctx: WorkerContext; token: string }
export class Run {
  readonly id = runIdSchema.parse(randomUUID())
  private phase: 'running' | 'stopping' | 'finished' = 'running'
  private readonly controller = new AbortController()
  private readonly live = new Map<string, LiveJob>()
  private readonly states = new Map<string, 'queued' | 'running' | 'done' | 'failed' | 'canceled'>()
  private readonly jobs = new Map<string, JobSpec>()
  private readonly queue: JobSpec[] = []
  private readonly committed: FrameId[] = []
  private readonly results = new Map<string, readonly Readonly<Draft>[]>()
  private readonly groupHandled = new Set<number>()
  private readonly seeds = new Map<string, Draft>()
  private readonly fallbacks = new Map<string, Draft>()
  private readonly epoch: number
  private readonly dir: string
  private readonly refsAtSend: Omit<ReferenceSet, 'page'>
  private costUsd = 0
  private costComplete = true
  private hadFailure = false
  get active(): boolean { return this.phase !== 'finished' }
  get stopping(): boolean { return this.phase === 'stopping' }
  constructor(private readonly deps: RunDeps, private readonly settings: RunSettings, private readonly text: string, private readonly turn: TurnContext, private readonly model: string) {
    this.epoch = deps.store.projectEpoch
    this.dir = deps.store.dir
    const frames = structuredClone(turn.selectedFrames).map(f => Object.freeze(f))
    const assets = new Map<string, Buffer>()
    const names = new Set(frames.flatMap(f => f.kind === 'image' ? [f.asset] : referenceAssetNames(f.html, deps.origin())))
    let total = 0
    for (const name of names) {
      if (!/^[\w.-]+$/.test(name) || name === '..') throw new Error('Unsafe reference asset.')
      const bytes = readFileSync(deps.store.assetPath(name))
      total += bytes.length
      if (total > 40 * 1024 * 1024) throw new Error('Selected reference assets exceed 40 MB.')
      assets.set(name, Buffer.from(bytes))
    }
    this.refsAtSend = Object.freeze({ frames: Object.freeze(frames), assets, selectedElements: structuredClone(turn.selectedElements), browserPick: structuredClone(turn.browserPick), designNotes: projectDesignNotes(this.dir), style: turn.style ? structuredClone(turn.style) : null })
  }
  stop(): void {
    if (this.phase !== 'running') return
    this.phase = 'stopping'
    this.deps.progress({ runId: this.id, activity: 'Stopping…' })
    for (const { token, ctx } of this.live.values()) {
      this.deps.registry.revoke(token)
      ctx.drafts.seal()
      ctx.controller.abort()
    }
    for (const job of this.jobs.values()) if (this.states.get(job.id) === 'queued') this.jobNotice(job, 'canceled')
    this.queue.length = 0
    this.controller.abort()
  }
  private notice(text: string, run: RunNoticeMeta): void { this.deps.emit({ type: 'notice', text, run }) }
  private jobNotice(job: JobSpec, state: 'running' | 'done' | 'failed' | 'canceled', extra: Partial<Extract<RunNoticeMeta, { kind: 'job' }>> = {}): void {
    this.states.set(job.id, state)
    this.notice(`${job.label} ${state}${extra.partial ? ' (partial)' : ''}${extra.frameIds?.length ? ` · ${extra.frameIds.length} frame(s)` : ''}${extra.error ? ` · ${extra.error}` : ''}.`, { kind: 'job', runId: this.id, jobId: job.id, state, ...extra })
  }
  private addCost(cost: number | undefined): void { if (cost === undefined) this.costComplete = false; else this.costUsd += cost }
  async start(): Promise<void> {
    const start = Date.now()
    this.deps.emit({ type: 'user', text: this.text })
    try {
      const claude = findCli('claude')
      if (!claude) throw new Error('Claude Code was not found. Install it from https://claude.com/claude-code and sign in with `claude`.')
      this.deps.progress({ runId: this.id, activity: 'Capturing references' })
      const page = await this.deps.capturePage()
      if (this.phase !== 'running') return
      const refs: ReferenceSet = Object.freeze({ ...this.refsAtSend, page })
      this.deps.progress({ runId: this.id, activity: 'Planning' })
      const plan = await this.plan(claude, refs)
      if (this.phase !== 'running') return
      const jobs = expandJobs(this.settings, plan)
      this.queue.push(...jobs)
      for (const job of jobs) this.jobs.set(job.id, job)
      if (isSplit(this.settings) && plan.kind === 'page' && plan.units.length > 1) {
        for (let group = 0; group < directionCount(this.settings); group++) {
          const job = integratorFor(group, plan, jobIdSchema.parse(String(this.jobs.size + 1)))
          this.jobs.set(job.id, job)
        }
      }
      for (const job of this.jobs.values()) this.states.set(job.id, 'queued')
      this.notice(`${plan.directions.length} result(s) planned · ${this.jobs.size} tasks · ${this.settings.agents} at a time.`, { kind: 'planned', runId: this.id, settings: this.settings, model: this.model || null, jobs: [...this.jobs.values()].map(({ id, label }) => ({ id, label })) })
      const pending = new Set<Promise<void>>()
      while (this.queue.length || pending.size) {
        while (this.phase === 'running' && this.queue.length && pending.size < this.settings.agents) {
          const job = this.queue.shift()
          if (!job) break
          const work = this.launch(job, plan, refs, claude).catch(async error => {
            this.hadFailure = true
            this.costComplete = false
            this.results.delete(job.id)
            if (this.phase !== 'running') { this.jobNotice(job, 'canceled'); return }
            this.jobNotice(job, 'failed', { error: error instanceof Error ? error.message : String(error) })
            if (job.role === 'integrate') {
              const fallback = this.fallbacks.get(job.id)
              if (fallback) this.jobNotice(job, 'failed', { partial: true, frameIds: this.commit(job, [{ ...fallback, name: `${fallback.name} (not integrated)` }], refs) })
            }
            if (job.role === 'section') {
              try { await this.settleSections(job.group, plan, refs) }
              catch (settleError) { this.deps.emit({ type: 'error', text: String(settleError) }) }
            }
          }).finally(() => { pending.delete(work) })
          pending.add(work)
        }
        if (!pending.size) break
        await Promise.race(pending)
      }
    } catch (e) {
      this.hadFailure = true
      if (this.phase === 'running') this.deps.emit({ type: 'error', text: e instanceof Error ? e.message : String(e) })
    } finally {
      const outcome = this.phase === 'stopping' ? 'stopped' : this.hadFailure ? this.committed.length ? 'partial' : 'failed' : 'complete'
      const durationMs = Date.now() - start
      this.notice(`Design run ${outcome} · ${this.committed.length} frame(s).`, { kind: 'finished', runId: this.id, outcome, frameIds: this.committed, costUsd: this.costUsd, costComplete: this.costComplete, durationMs })
      this.deps.emit({ type: 'done', costUsd: this.costUsd, durationMs })
      this.phase = 'finished'
    }
  }
  private async plan(claude: string, refs: ReferenceSet): Promise<Plan> {
    let stream: ReturnType<typeof query> | undefined
    let output: unknown
    let success = false
    let cost: number | undefined
    let stderr = ''
    let error = 'Structured output is unavailable. The installed Claude CLI must support JSON-schema output.'
    try {
      stream = query({ prompt: plannerPrompt(this.settings, this.text, this.turn, refs, styleSummaries()), options: {
        pathToClaudeCodeExecutable: claude, cwd: this.dir, model: this.model || undefined,
        systemPrompt: PLANNER_SYSTEM, tools: [], mcpServers: {}, strictMcpConfig: true,
        settingSources: [], persistSession: false, permissionMode: 'dontAsk', maxTurns: 3,
        abortController: this.controller, stderr: data => { stderr = (stderr + data).slice(-4000) }, outputFormat: { type: 'json_schema', schema: planJsonSchema(this.settings) }
      } })
      for await (const m of stream) if (m.type === 'result') {
        success = m.subtype === 'success'
        cost = Number.isFinite(m.total_cost_usd) && m.total_cost_usd >= 0 ? m.total_cost_usd : undefined
        if (m.subtype === 'success') output = m.structured_output
        else error = `Planner failed: ${m.errors.join('\n') || m.subtype}. Structured-output support is required.`
      }
    } catch (failure) {
      throw new Error(`The planner could not return structured output. The installed Claude CLI must support JSON-schema output. ${failure instanceof Error ? failure.message : String(failure)}${stderr ? `\n${stderr}` : ''}`)
    } finally { stream?.close(); this.addCost(cost) }
    if (!success || output === undefined) throw new Error(error)
    const parsed = planSchema(this.settings).safeParse(output)
    if (!parsed.success) throw new Error(`The planner returned an invalid plan: ${parsed.error.issues.map(i => i.message).join(' ')}`)
    const p = parsed.data
    for (const d of p.directions) if (d.style) {
      const resolved = loadStyle({ name: d.style.id, variant: d.style.variant })
      if (resolved.id !== d.style.id) throw new Error('The planner must use canonical catalog style IDs.')
    }
    const branded = !!(p.contract.identity === 'request' || refs.style || refs.designNotes.startsWith('## Project DESIGN.md') || refs.frames.length || refs.page)
    if (this.settings.variations.axis === 'style' && !branded && p.directions.some(d => !d.style)) throw new Error('Style variations without a fixed identity require catalog style choices.')
    if (this.settings.variations.axis === 'layout' && !branded && !p.directions[0]?.style) throw new Error('Layout variations require one shared catalog style when no visual identity is supplied.')
    return p
  }
  private styleFor(job: JobSpec, refs: ReferenceSet): ResolvedStyle | null {
    if (refs.style) return refs.style
    if (refs.designNotes.startsWith('## Project DESIGN.md') || refs.frames.length || refs.page) return null
    return job.direction.style ? loadStyle({ name: job.direction.style.id, variant: job.direction.style.variant }) : null
  }
  private async launch(job: JobSpec, plan: Plan, refs: ReferenceSet, claude: string): Promise<void> {
    const drafts = new DraftBook(job.maxDrafts, job.fixedWidth, job.role, this.seeds.get(job.id))
    const controller = new AbortController()
    const ctx: WorkerContext = { job, refs, drafts, controller, signal: controller.signal, origin: this.deps.origin, photoKeys: this.deps.photoKeys, measure: this.deps.measure, resources: new WorkerResources(), activity: activity => {
      if (this.phase === 'running') this.deps.progress({ runId: this.id, jobId: job.id, activity })
    } }
    const token = this.deps.registry.issue(ctx)
    this.live.set(job.id, { token, ctx })
    this.jobNotice(job, 'running')
    let result: Awaited<ReturnType<typeof runWorker>>
    try { result = await runWorker(ctx, { claude, cwd: this.dir, model: this.model, mcpUrl: `${this.deps.origin()}/mcp/worker`, token, prompt: workerPrompt(job, plan, refs, this.text, this.styleFor(job, refs)), tools: workerTools(ctx).map(t => t.name) }) }
    finally {
      this.deps.registry.revoke(token)
      drafts.seal()
      try { await ctx.resources.dispose() }
      catch (error) {
        this.hadFailure = true
        this.deps.emit({ type: 'error', text: `Worker cleanup failed: ${String(error).replaceAll(token, '[redacted]')}` })
      } finally { this.live.delete(job.id) }
    }
    this.addCost(result.costUsd)
    if (this.phase !== 'running') { this.jobNotice(job, 'canceled', { costUsd: result.costUsd }); return }
    const final = drafts.list()
    const valid = result.ok && final.length === job.maxDrafts
    if (!valid) {
      this.hadFailure = true
      if (job.role !== 'integrate') this.jobNotice(job, 'failed', { error: result.error ?? `Expected ${job.maxDrafts} draft(s), received ${final.length}.`, costUsd: result.costUsd })
    } else {
      this.results.set(job.id, final)
      if (job.role !== 'section' && job.role !== 'integrate') this.jobNotice(job, 'done', { frameIds: this.commit(job, final, refs), costUsd: result.costUsd })
      else if (job.role === 'section') this.jobNotice(job, 'done', { costUsd: result.costUsd })
    }
    if (job.role === 'section') await this.settleSections(job.group, plan, refs)
    if (job.role === 'integrate') {
      const fallback = this.fallbacks.get(job.id)
      if (!fallback) return
      const integrated = valid && final[0] && partCoverage(final[0].html, plan.units.length)
      if (!integrated) this.hadFailure = true
      const chosen = integrated ? final : [{ ...fallback, name: `${fallback.name} (not integrated)` }]
      const ids = this.commit(job, chosen, refs)
      this.jobNotice(job, integrated ? 'done' : 'failed', { frameIds: ids, partial: !integrated, costUsd: result.costUsd, ...(!integrated ? { error: result.error ?? 'Integrated page did not preserve every section marker exactly once in order.' } : {}) })
    }
  }
  private async settleSections(group: number, plan: Plan, refs: ReferenceSet): Promise<void> {
    const sections = [...this.jobs.values()].filter(j => j.group === group && j.role === 'section')
    if (this.groupHandled.has(group) || sections.some(j => ['queued', 'running'].includes(this.states.get(j.id) ?? 'queued'))) return
    this.groupHandled.add(group)
    if (sections.some(j => !this.results.has(j.id))) {
      const integrator = [...this.jobs.values()].find(j => j.group === group && j.role === 'integrate')
      if (integrator) this.jobNotice(integrator, 'canceled')
      for (const [i, j] of sections.entries()) {
        const parts = this.results.get(j.id)
        if (parts) this.jobNotice(j, 'done', { frameIds: this.commit(j, parts.map(d => ({ ...d, name: `${d.name} · Section ${i + 1} (partial)` })), refs), partial: true })
      }
      return
    }
    const parts = sections.flatMap(j => this.results.get(j.id) ?? [])
    if (sections.length === 1) {
      const job = sections[0]
      if (job) this.jobNotice(job, 'done', { frameIds: this.commit(job, parts, refs) })
      return
    }
    const html = mergeSections(parts)
    const integrator = [...this.jobs.values()].find(j => j.group === group && j.role === 'integrate')
    if (!integrator) throw new Error('Missing integrator assignment.')
    let height: number
    try { height = Math.max(100, await this.deps.measure(frozenHtml(html, { refs, origin: this.deps.origin }), plan.contract.width)) }
    catch (error) {
      if (this.phase !== 'running') return
      this.hadFailure = true
      const fallback = { id: newId(), name: `${plan.directions[group]?.title} (not integrated)`, html, width: plan.contract.width, height: Math.min(12000, parts.reduce((sum, part) => sum + part.height, 0)), revision: 1 }
      this.jobNotice(integrator, 'failed', { error: `Could not measure the merged page: ${error instanceof Error ? error.message : String(error)}`, partial: true, frameIds: this.commit(integrator, [fallback], refs) })
      return
    }
    if (this.phase !== 'running') return
    const seed: Draft = { id: newId(), name: plan.directions[group]?.title ?? `Variation ${group + 1}`, html, width: plan.contract.width, height, revision: 1 }
    this.seeds.set(integrator.id, seed)
    this.fallbacks.set(integrator.id, seed)
    this.queue.unshift(integrator)
  }
  private commit(job: JobSpec, drafts: readonly Readonly<Draft>[], refs: ReferenceSet): FrameId[] {
    const store = this.deps.store
    if (this.phase !== 'running' || store.projectEpoch !== this.epoch || store.dir !== this.dir) return []
    const slot = nextSlot(store.doc)
    let x = slot.x
    const ids: FrameId[] = []
    const ops: Op[] = drafts.map(d => {
      const id = newId()
      ids.push(id)
      const frame = { id, kind: 'html' as const, name: `${d.name} · ${job.label}`, html: frozenHtml(d.html, { refs, origin: this.deps.origin }), width: d.width, height: d.height, x, y: slot.y, updatedAt: Date.now() }
      x += d.width + FRAME_GAP
      return { type: 'add', frame }
    })
    if (ops.length) {
      store.dispatch(ops)
      this.committed.push(...ids)
      if (ids[0]) this.deps.focus(ids[0])
    }
    return ids
  }
}
