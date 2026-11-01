import { randomUUID } from 'node:crypto'
import { FRAME_GAP, nextSlot, type Doc } from '../shared/model'
import { activityForTool } from '../shared/presence'
import type { JobSpec, LiveCursor, LiveDraft, LiveRun, RunId } from '../shared/run'
import { previews } from './previews'

const PLACEHOLDER = 'slot'
const REVIEW_TOOLS = new Set(['review_frame', 'screenshot_frame', 'check_numbers'])

interface Entry { draft: LiveDraft; html: string }

/**
 * Shows each worker's private drafts on the canvas while a run is active, with one cursor per worker.
 * Drafts render through unguessable preview tokens and stay read-only; they vanish when published or discarded.
 */
export class LiveRunView {
  private readonly entries = new Map<string, Entry>()
  private readonly cursors = new Map<string, LiveCursor>()
  private readonly nextX = new Map<RunId, { x: number; y: number }>()
  private scheduled = false

  constructor(private readonly doc: () => Doc, private readonly send: (state: LiveRun) => void) {}

  /** Reserve a slot for a worker as it starts, so its cursor has somewhere to stand before the first draft. */
  start(runId: RunId, job: JobSpec): void {
    if (this.jobEntries(runId, job.id).length) return this.point(runId, job, this.jobEntries(runId, job.id)[0]!.draft.id, 0.08, 'Thinking')
    const id = key(runId, job.id, PLACEHOLDER)
    this.entries.set(id, { html: '', draft: { id, runId, jobId: job.id, agent: agentOf(job), label: job.label, name: null, token: null, width: job.fixedWidth ?? 1440, height: 900, revision: 0, ...this.place(runId, job.fixedWidth ?? 1440) } })
    this.point(runId, job, id, 0.08, 'Thinking')
  }

  /** A draft was created or changed. The first draft takes over the reserved slot. */
  draft(runId: RunId, job: JobSpec, d: { id: string; name: string; html: string; width: number; height: number; revision: number }, at?: { x: number; y: number }): void {
    const id = key(runId, job.id, d.id)
    const existing = this.entries.get(id)
    const slot = this.entries.get(key(runId, job.id, PLACEHOLDER))
    let position = at ?? (existing ? { x: existing.draft.x, y: existing.draft.y } : undefined)
    if (!position && slot) {
      position = { x: slot.draft.x, y: slot.draft.y }
      this.entries.delete(slot.draft.id)
    }
    position ??= this.place(runId, d.width)
    const token = existing?.draft.token ?? randomUUID()
    previews.set(token, { kind: 'fragment', html: d.html })
    const before = existing?.html ?? ''
    this.entries.set(id, { html: d.html, draft: { id, runId, jobId: job.id, agent: agentOf(job), label: job.label, name: d.name, token, width: d.width, height: d.height, revision: d.revision, ...position } })
    this.point(runId, job, id, changedAt(before, d.html), activityForTool(existing ? 'edit_frame' : 'create_frame'))
  }

  /** A worker called a tool. Owned-draft tools move its cursor onto that draft; reviews replay the scan sweep. */
  activity(runId: RunId, job: JobSpec, tool: string, args: unknown): void {
    const cursor = this.cursors.get(key(runId, job.id))
    if (!cursor) return
    const target = args && typeof args === 'object' && 'id' in args && typeof args.id === 'string' ? this.entries.get(key(runId, job.id, args.id)) : undefined
    const review = REVIEW_TOOLS.has(tool) && !!target
    this.cursors.set(key(runId, job.id), { ...cursor, activity: activityForTool(tool), ...(target ? { draftId: target.draft.id, fy: review ? 0.04 : cursor.fy } : {}), scans: cursor.scans + (review ? 1 : 0) })
    this.flush()
  }

  position(runId: RunId, jobId: string, draftId: string): { x: number; y: number } | undefined {
    const entry = this.entries.get(key(runId, jobId, draftId))
    return entry && { x: entry.draft.x, y: entry.draft.y }
  }

  /** Drop one draft (published, merged or discarded). */
  remove(runId: RunId, jobId: string, draftId: string): void {
    const entry = this.entries.get(key(runId, jobId, draftId))
    if (!entry) return
    if (entry.draft.token) previews.delete(entry.draft.token)
    this.entries.delete(entry.draft.id)
    this.flush()
  }

  /** The worker finished: its cursor leaves, and an unused slot disappears. Drafts stay until published. */
  finish(runId: RunId, jobId: string): void {
    this.cursors.delete(key(runId, jobId))
    this.entries.delete(key(runId, jobId, PLACEHOLDER))
    this.flush()
  }

  removeJob(runId: RunId, jobId: string): void {
    for (const e of this.jobEntries(runId, jobId)) this.remove(runId, jobId, e.draft.id.slice(key(runId, jobId, '').length))
    this.finish(runId, jobId)
  }

  clear(runId: RunId): void {
    for (const [id, e] of this.entries) if (e.draft.runId === runId) {
      if (e.draft.token) previews.delete(e.draft.token)
      this.entries.delete(id)
    }
    for (const [id, c] of this.cursors) if (c.runId === runId) this.cursors.delete(id)
    this.nextX.delete(runId)
    this.flush()
  }

  state(): LiveRun {
    return { drafts: [...this.entries.values()].map(e => e.draft), cursors: [...this.cursors.values()] }
  }

  private jobEntries(runId: RunId, jobId: string): Entry[] {
    const prefix = key(runId, jobId, '')
    return [...this.entries.values()].filter(e => e.draft.id.startsWith(prefix))
  }

  /** New drafts line up to the right of the canvas and of this run's earlier drafts, so published frames land where their drafts stood. */
  private place(runId: RunId, width: number): { x: number; y: number } {
    const slot = nextSlot(this.doc())
    const anchor = this.nextX.get(runId) ?? slot
    const x = Math.max(anchor.x, slot.x)
    this.nextX.set(runId, { x: x + width + FRAME_GAP, y: anchor.y })
    return { x, y: anchor.y }
  }

  private point(runId: RunId, job: JobSpec, draftId: string, fy: number, activity: string): void {
    const previous = this.cursors.get(key(runId, job.id))
    const step = (previous?.scans ?? 0) + (this.entries.get(draftId)?.draft.revision ?? 0)
    this.cursors.set(key(runId, job.id), { runId, jobId: job.id, agent: agentOf(job), label: job.label, draftId, fx: 0.2 + ((step * 0.37) % 0.55), fy, activity, scans: previous?.scans ?? 0 })
    this.flush()
  }

  /** Coalesce bursts of edits into one renderer update per frame tick. */
  private flush(): void {
    if (this.scheduled) return
    this.scheduled = true
    setTimeout(() => {
      this.scheduled = false
      this.send(this.state())
    }, 16)
  }
}

const key = (runId: RunId, jobId: string, draftId?: string) => draftId === undefined ? `${runId}:${jobId}` : `${runId}:${jobId}:${draftId}`
const agentOf = (job: JobSpec) => Number(job.id) || 1

/** Where an edit landed, as a fraction of the new HTML: the end of the unchanged prefix. Appending a section puts the cursor near the bottom. */
function changedAt(before: string, after: string): number {
  if (!after.length) return 0.08
  let i = 0
  const n = Math.min(before.length, after.length)
  while (i < n && before.charCodeAt(i) === after.charCodeAt(i)) i++
  return Math.min(0.92, Math.max(0.04, i / after.length))
}
