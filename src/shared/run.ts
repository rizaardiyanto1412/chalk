import { z } from 'zod'
import { parse, parseFragment, type DefaultTreeAdapterMap } from 'parse5'
import type { AgentEvent, Frame, FrameId } from './model'

export const runIdSchema = z.uuid().brand<'RunId'>()
export const jobIdSchema = z.string().regex(/^\d{1,2}$/).brand<'JobId'>()
export type RunId = z.infer<typeof runIdSchema>
export type JobId = z.infer<typeof jobIdSchema>
export const runSettingsSchema = z.strictObject({
  variations: z.discriminatedUnion('axis', [
    z.strictObject({ axis: z.literal('off') }),
    z.strictObject({ axis: z.enum(['layout', 'style']), count: z.number().int().min(2).max(6) })
  ]),
  agents: z.number().int().min(1).max(6),
  mode: z.enum(['split', 'side'])
})
export type RunSettings = z.infer<typeof runSettingsSchema>
export const DEFAULT_RUN_SETTINGS: RunSettings = { variations: { axis: 'off' }, agents: 1, mode: 'split' }
export const isOrdinary = (s: RunSettings): boolean => s.variations.axis === 'off' && s.agents === 1
export const isSplit = (s: RunSettings): boolean => s.agents > 1 && s.mode === 'split'
export const directionCount = (s: RunSettings): number => s.variations.axis !== 'off' ? s.variations.count : s.mode === 'side' ? s.agents : 1
export const unitCap = (s: RunSettings): number => isSplit(s) ? 6 : 1
export const taskBound = (s: RunSettings): number => directionCount(s) * (isSplit(s) ? 7 : 1)
const choiceSchema = z.strictObject({ id: z.string().min(1), variant: z.string().min(1) })
const planShape = z.strictObject({
  kind: z.enum(['page', 'screens']),
  contract: z.strictObject({ identity: z.enum(['request', 'references', 'catalog']), width: z.number().int().min(320).max(1920), visual: z.string().min(1).max(2000), content: z.string().min(1).max(3000) }),
  screens: z.array(z.string().trim().min(1).max(120)).max(12),
  directions: z.array(z.strictObject({ title: z.string().trim().min(1).max(120), brief: z.string().min(1).max(3000), style: choiceSchema.optional() })).min(1).max(6),
  units: z.array(z.strictObject({ title: z.string().min(1).max(120), brief: z.string().min(1).max(3000), screens: z.array(z.string().min(1)).min(1).max(2).optional() })).min(1).max(6)
})
export type Plan = z.infer<typeof planShape>
export function planSchema(settings: RunSettings) {
  return planShape.superRefine((p, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: 'custom', message })
    if (p.directions.length !== directionCount(settings)) fail('Incorrect number of directions.')
    if (p.units.length > unitCap(settings)) fail('Too many units.')
    if (new Set(p.directions.map(d => d.title.toLowerCase())).size !== p.directions.length) fail('Direction titles must be distinct.')
    if (settings.variations.axis === 'style') {
      const pairs = p.directions.flatMap(d => d.style ? [`${d.style.id}/${d.style.variant}`] : [])
      if (new Set(pairs).size !== pairs.length) fail('Style directions must use distinct catalog ID and variant pairs.')
    }
    if (p.kind === 'page') {
      if (p.screens.length || p.units.some(u => u.screens)) fail('Page plans cannot assign screens.')
    } else {
      if (!p.screens.length || new Set(p.screens).size !== p.screens.length) fail('Screens must name 1–12 distinct screens.')
      if (isSplit(settings)) {
        const assigned = p.units.flatMap(u => u.screens ?? [])
        if (assigned.length !== p.screens.length || new Set(assigned).size !== assigned.length || p.screens.some(s => !assigned.includes(s))) fail('Units must cover each screen exactly once, in groups of 1–2.')
      }
    }
    if (settings.variations.axis === 'layout') {
      const choices = p.directions.map(d => d.style && `${d.style.id}/${d.style.variant}`)
      if (new Set(choices).size > 1) fail('Layout directions must share one visual style.')
    }
  })
}
export function planJsonSchema(settings: RunSettings): Record<string, unknown> {
  const count = directionCount(settings)
  return z.toJSONSchema(planShape.extend({
    directions: planShape.shape.directions.length(count),
    units: planShape.shape.units.max(unitCap(settings))
  }), { target: 'draft-07' })
}

export type JobRole = 'alternative' | 'screen' | 'section' | 'integrate'
export interface JobSpec {
  id: JobId
  group: number
  role: JobRole
  label: string
  direction: Plan['directions'][number]
  unit: Plan['units'][number] | null
  siblings: string[]
  maxDrafts: number
  fixedWidth: number | null
}
export type JobState = 'queued' | 'running' | 'done' | 'failed' | 'canceled'
export function expandJobs(s: RunSettings, p: Plan): JobSpec[] {
  const jobs: JobSpec[] = []
  const split = isSplit(s)
  const units = split ? p.units : [null]
  for (const unit of units) for (const [group, direction] of p.directions.entries()) {
    const role = !split ? 'alternative' : p.kind === 'page' ? 'section' : 'screen'
    jobs.push({ id: jobIdSchema.parse(String(jobs.length + 1)), group, role, direction, unit,
      label: `${p.directions.length > 1 ? `Variation ${group + 1} · ` : ''}${unit?.title ?? direction.title}`,
      siblings: p.units.filter(u => u !== unit).map(u => u.title),
      maxDrafts: p.kind === 'page' ? 1 : unit?.screens?.length ?? p.screens.length,
      fixedWidth: role === 'section' ? p.contract.width : null })
  }
  return jobs
}
export function integratorFor(group: number, p: Plan, id: JobId): JobSpec {
  const direction = p.directions[group]
  if (!direction) throw new Error('Unknown direction.')
  return { id, group, role: 'integrate', label: `${p.directions.length > 1 ? `Variation ${group + 1} · ` : ''}Integrate`, direction, unit: null, siblings: [], maxDrafts: 1, fixedWidth: p.contract.width }
}
export function mergeSections(parts: readonly { html: string }[]): string {
  return parts.map((p, i) => `<section data-chalk-part="${i + 1}">\n${p.html}\n</section>`).join('\n')
}
function walk(node: DefaultTreeAdapterMap['node'], visit: (node: DefaultTreeAdapterMap['node']) => void): void {
  visit(node)
  if ('childNodes' in node) node.childNodes.forEach(n => walk(n, visit))
  if ('content' in node) walk(node.content, visit)
}
export function sectionIssues(html: string): string[] {
  const issues = new Set<string>()
  walk(parse(html, { sourceCodeLocationInfo: true }), n => {
    if (n.nodeName === '#documentType' || ('tagName' in n && (n.tagName === 'script' || (['html', 'head', 'body'].includes(n.tagName) && n.sourceCodeLocation)))) issues.add(n.nodeName)
  })
  return [...issues]
}
export function sectionStyleCount(html: string): number {
  let count = 0
  walk(parseFragment(html), node => { if ('tagName' in node && node.tagName === 'style') count++ })
  return count
}
export function partCoverage(html: string, count: number): boolean {
  if (sectionIssues(html).length) return false
  const parts: string[] = []
  walk(parseFragment(html), n => { if ('attrs' in n) for (const a of n.attrs) if (a.name === 'data-chalk-part') parts.push(a.value) })
  return parts.length === count && parts.every((v, i) => v === String(i + 1))
}

const frameIds = z.array(z.string().regex(/^[\w-]+$/).transform((s): FrameId => s as FrameId))
export const runNoticeMetaSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('planned'), runId: runIdSchema, settings: runSettingsSchema, model: z.string().nullable(), jobs: z.array(z.object({ id: jobIdSchema, label: z.string() })) }),
  z.object({ kind: z.literal('job'), runId: runIdSchema, jobId: jobIdSchema, state: z.enum(['running', 'done', 'failed', 'canceled']), frameIds: frameIds.optional(), error: z.string().optional(), costUsd: z.number().finite().nonnegative().optional(), partial: z.boolean().optional() }),
  z.object({ kind: z.literal('finished'), runId: runIdSchema, outcome: z.enum(['complete', 'partial', 'failed', 'stopped']), frameIds, costUsd: z.number().finite().nonnegative().optional(), costComplete: z.boolean(), durationMs: z.number().finite().nonnegative() })
])
export type RunNoticeMeta = z.infer<typeof runNoticeMetaSchema>
export interface RunProgress { runId: RunId; jobId?: JobId; activity: string }
export interface RunView {
  active: boolean
  id: RunId
  settings: RunSettings
  model: string | null
  jobs: { id: JobId; label: string; state: JobState | 'interrupted'; frameIds: FrameId[]; error?: string; costUsd?: number; partial?: boolean }[]
  finished?: Extract<RunNoticeMeta, { kind: 'finished' }>
}
export function foldRuns(events: readonly AgentEvent[], live = false): RunView[] {
  const runs = new Map<RunId, RunView>()
  for (const e of events) {
    if (e.type !== 'notice' || !e.run) continue
    const m = e.run
    if (m.kind === 'planned') runs.set(m.runId, { active: false, id: m.runId, settings: m.settings, model: m.model, jobs: m.jobs.map(j => ({ ...j, state: 'queued', frameIds: [] })) })
    const run = runs.get(m.runId)
    if (!run) continue
    if (m.kind === 'job') {
      const job = run.jobs.find(j => j.id === m.jobId)
      if (job) Object.assign(job, m)
    } else if (m.kind === 'finished') run.finished = m
  }
  const result = [...runs.values()]
  const lastStart = events.findLastIndex(e => e.type === 'start')
  const lastPlan = events.findLastIndex(e => e.type === 'notice' && e.run?.kind === 'planned')
  for (const [i, run] of result.entries()) {
    run.active = !run.finished && live && lastPlan > lastStart && i === result.length - 1
    if (!run.finished && !run.active) for (const job of run.jobs) if (job.state === 'running' || job.state === 'queued') job.state = 'interrupted'
  }
  return result
}
export function priorRunNote(events: readonly AgentEvent[], frames: readonly Frame[] = []): string | null {
  const since = events.findLastIndex(e => e.type === 'start')
  const names = new Map(frames.map(f => [f.id, f.name]))
  const lines = foldRuns(events.slice(since + 1)).flatMap(r => r.jobs.flatMap(j => j.frameIds.map(id => `${j.label} → frame ${id} (${names.get(id) ?? j.label})`)))
  return lines.length ? `Prior design runs produced these editable frames:\n${lines.join('\n')}`.slice(0, 2000) : null
}
