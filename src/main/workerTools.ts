import { z } from 'zod'
import { BROWSER_DEVICE_IDS, type Frame } from '../shared/model'
import { type WorkerContext, type Draft } from './worker'
import { text, image, applyEdits, newId, frameSummary, type Content } from './tools'
import { createPreview } from './previews'
import { renderUrl } from './render'
import { frameDocument } from './frameHtml'
import { checkClaim, numberLines } from './numbers'
import { resolveStyle, styleInputSchema } from './styles'
import { DESIGN_GUIDE } from './prompt'
import { screenTypeSchema, SCREEN_GUIDES } from './design'
import { contactSheet, searchPhotos } from './photos'

export interface WorkerTool {
  name: string
  description: string
  input: z.ZodRawShape
  readOnly?: boolean
  run: (args: never, ctx: WorkerContext) => Promise<Content[]>
}
function tool<S extends z.ZodRawShape>(name: string, description: string, input: S, run: (args: z.infer<z.ZodObject<S>>, ctx: WorkerContext) => Promise<Content[]>, readOnly = false): WorkerTool {
  const schema = z.strictObject(input)
  return { name, description, input, readOnly, run: (args, ctx) => ctx.resources.tool(ctx, async () => {
    const parsed = schema.parse(args)
    ctx.activity(name, parsed)
    return run(parsed, ctx)
  }) }
}
function owned(ctx: WorkerContext, id: string): Readonly<Draft> {
  const draft = ctx.drafts.get(id)
  if (!draft) throw new Error('No owned draft with that id. References and other jobs are read-only.')
  return draft
}
function readable(ctx: WorkerContext, id: string): Readonly<Frame> {
  const draft = ctx.drafts.get(id)
  if (draft) return { ...draft, kind: 'html', x: 0, y: 0, updatedAt: 0 }
  const reference = ctx.refs.frames.find(f => f.id === id)
  if (!reference) throw new Error('No reference or owned draft with that id.')
  return reference
}
function localCanvasUrls(html: string, origin: string, replace: (url: URL, source: string) => string): string {
  return html.replace(/(^|[\s"'(=])((?:https?:)?\/\/[^\s"'<>)]*|\/(?:assets|frame)\/[^\s"'<>)]*)/g, (_match, prefix: string, source: string) => {
    let url: URL
    try { url = new URL(source, origin) } catch { return prefix + source }
    return prefix + (url.origin === origin ? replace(url, source) : source)
  })
}
export function referenceAssetNames(html: string, origin: string): string[] {
  const names = new Set<string>()
  localCanvasUrls(html, origin, (url, source) => {
    const asset = /^\/assets\/([\w.-]+)$/.exec(url.pathname)?.[1]
    if (asset) names.add(asset)
    return source
  })
  return [...names]
}
export function frozenHtml(html: string, ctx: Pick<WorkerContext, 'refs' | 'origin'>): string {
  return localCanvasUrls(html, ctx.origin(), (url, source) => {
    if (url.pathname.startsWith('/frame/')) throw new Error('Live canvas embeds cannot be rendered as frozen references. Use captured HTML or assets.')
    const asset = /^\/assets\/([\w.-]+)$/.exec(url.pathname)?.[1]
    if (!asset) return source
    const bytes = ctx.refs.assets.get(asset)
    if (!bytes) throw new Error(`Local asset ${asset} was not captured in the references.`)
    return `data:image/png;base64,${bytes.toString('base64')}`
  })
}
async function renderFrame(ctx: WorkerContext, id: string, review: boolean): Promise<Content[]> {
  const frame = readable(ctx, id)
  if (frame.kind === 'image') {
    const bytes = ctx.refs.assets.get(frame.asset)
    if (!bytes) throw new Error('Reference image is unavailable.')
    return [image(Buffer.from(bytes)), text({ kind: 'image', note: 'Reference image only.' })]
  }
  const preview = createPreview(frozenHtml(frame.html, ctx), ctx.origin())
  try {
    if (review) {
      const result = await renderUrl(preview.url, frame.width, frame.height, true)
      ctx.resources.check(ctx)
      return [image(result.png), text({ ...result.diagnostics, revision: ctx.drafts.get(id)?.revision, limits: 'Document-level diagnostics do not judge design quality, contrast or internal clipping.' })]
    }
    const result = await renderUrl(preview.url, frame.width, frame.height)
    ctx.resources.check(ctx)
    return [image(result.png)]
  } finally { preview.dispose() }
}
const browser = <S extends z.ZodRawShape>(name: string, description: string, input: S, operation: (args: z.infer<z.ZodObject<S>>, b: import('./browser').Browser) => Promise<Content[]>, readOnly = false) => tool(name, description, input, (args, ctx) => ctx.resources.useBrowser(ctx, b => operation(args, b)), readOnly)
export const WORKER_TOOLS: WorkerTool[] = [
  tool('get_canvas', 'List only frozen selected references and your own drafts. Positions are assigned by main on completion.', {}, async (_a, ctx) => [text({ frames: [...ctx.refs.frames.map(frameSummary), ...ctx.drafts.list()], selectedFrameIds: ctx.refs.frames.map(f => f.id), selectedElements: ctx.refs.selectedElements, browserPick: ctx.refs.browserPick })], true),
  tool('get_frame', 'Read a frozen HTML reference or your own draft. Drafts include a revision for update_frame.', { id: z.string(), standalone: z.boolean().optional() }, async ({ id, standalone }, ctx) => {
    const f = readable(ctx, id)
    if (f.kind !== 'html') throw new Error('This is an image reference. Use screenshot_frame.')
    const html = standalone ? frameDocument({ name: f.name, html: frozenHtml(f.html, ctx) }) : f.html
    return [text({ id: f.id, html, revision: ctx.drafts.get(id)?.revision, styleBlocks: ctx.drafts.get(id)?.styleBlocks, readOnly: !ctx.drafts.get(id) })]
  }, true),
  tool('screenshot_frame', 'Render frozen references or your own drafts.', { id: z.string() }, ({ id }, ctx) => renderFrame(ctx, id, false), true),
  tool('review_frame', 'Render a reference or draft and report measured layout diagnostics.', { id: z.string() }, ({ id }, ctx) => renderFrame(ctx, id, true), true),
  tool('get_reference_page', 'Read the admission capture of the visible browser. Its refs are read-only. Private browsing has no logged-in cookies.', {}, async (_a, ctx) => {
    const page = ctx.refs.page
    if (!page) throw new Error('No visible HTTP(S) page was captured at Send.')
    return [text({ url: page.url, title: page.title, tree: page.tree, styles: page.styles, width: page.width, height: page.height, note: 'Captured refs are for reading only.' }), image(Buffer.from(page.png))]
  }, true),
  tool('create_frame', 'Create an owned draft. Main places new frames after success. Complete jobs must create exactly the assigned screen count. Sections must contain no document shell or script.', { name: z.string(), html: z.string(), width: z.number().int().min(200).max(3840).optional(), height: z.number().int().min(100).max(12000).optional(), x: z.number().optional(), y: z.number().optional(), near_frame_id: z.string().optional() }, async (a, ctx) => {
    if (ctx.job.role === 'integrate') throw new Error('Integrators cannot create drafts.')
    const width = ctx.job.fixedWidth ?? a.width ?? 1440
    const rendered = frozenHtml(a.html, ctx)
    const height = a.height ?? Math.max(100, await ctx.measure(rendered, width))
    ctx.resources.check(ctx)
    const id = newId()
    const revision = ctx.drafts.put({ id, name: a.name, html: a.html, width, height })
    return [text({ created: { id, name: a.name, width, height, revision, styleBlocks: ctx.drafts.get(id)?.styleBlocks }, next: 'Review this draft before finishing.' })]
  }),
  tool('update_frame', 'Replace an owned draft using its latest baseRevision. Stale updates fail. Integrators may change only HTML.', { id: z.string(), baseRevision: z.number().int().min(1), html: z.string().optional(), name: z.string().optional(), width: z.number().int().min(200).max(3840).optional(), height: z.number().int().min(100).max(12000).optional() }, async ({ id, baseRevision, ...patch }, ctx) => {
    const f = owned(ctx, id)
    if (ctx.job.role === 'integrate' && (patch.name !== undefined || patch.width !== undefined || patch.height !== undefined)) throw new Error('Integrator updates may change only HTML.')
    const width = patch.width ?? f.width
    const html = patch.html ?? f.html
    const rendered = frozenHtml(html, ctx)
    const height = patch.height ?? Math.max(100, await ctx.measure(rendered, width))
    ctx.resources.check(ctx)
    const revision = ctx.drafts.put({ ...f, ...patch, html, width, height }, baseRevision)
    return [text({ updated: { id, revision } })]
  }),
  tool('edit_frame', 'Apply exact unique replacements to your owned draft, rebasing on its latest HTML after measurement.', { id: z.string(), edits: z.array(z.strictObject({ find: z.string().min(1), replace: z.string() })).min(1) }, async ({ id, edits }, ctx) => {
    for (;;) {
      const f = owned(ctx, id)
      const html = applyEdits(f.html, edits)
      const height = Math.max(100, await ctx.measure(frozenHtml(html, ctx), f.width))
      ctx.resources.check(ctx)
      const latest = owned(ctx, id)
      if (latest.revision !== f.revision) continue
      const revision = ctx.drafts.put({ ...latest, html, height }, latest.revision)
      return [text({ updated: { id, revision }, editsApplied: edits.length })]
    }
  }),
  tool('delete_frame', 'Remove only an owned draft. References and integrator seeds cannot be deleted.', { id: z.string() }, async ({ id }, ctx) => { owned(ctx, id); ctx.drafts.remove(id); return [text('Draft removed.')] }),
  tool('get_style', 'List or load original styles, including real font recipes. User identity and brand take precedence.', styleInputSchema.shape, async args => [text(resolveStyle(args))], true),
  tool('get_design_guidelines', 'Read base and screen guidance with DESIGN.md frozen at Send.', { screen_type: screenTypeSchema.optional() }, async ({ screen_type = 'general' }, ctx) => [text(`${DESIGN_GUIDE}\n\n${SCREEN_GUIDES[screen_type]}\n\n${ctx.refs.designNotes}`)], true),
  tool('check_numbers', 'Check visible arithmetic using real expressions.', { id: z.string(), claims: z.array(z.strictObject({ says: z.string().min(1).max(300), expression: z.string().min(1).max(500), shown: z.string().min(1).max(80) })).max(80).optional() }, async ({ id, claims }, ctx) => {
    const f = readable(ctx, id)
    if (f.kind !== 'html') throw new Error('Image references have no HTML numbers.')
    return [text(claims?.length ? { results: claims.map(checkClaim) } : { numbers: numberLines(f.html) })]
  }, true),
  tool('search_photos', 'Search remote stock photographs and inspect their contact sheet.', { query: z.string().min(2).max(120), orientation: z.enum(['landscape', 'portrait', 'square']).optional(), count: z.number().int().min(4).max(16).optional() }, async ({ query, orientation, count }, ctx) => {
    const found = await searchPhotos(ctx.photoKeys(), query, orientation, count ?? 12)
    ctx.resources.check(ctx)
    if (!found.photos.length) return [text(found)]
    const preview = createPreview(contactSheet(found.photos), ctx.origin())
    try {
      const result = await renderUrl(preview.url, 1200)
      ctx.resources.check(ctx)
      return [image(result.png), text({ provider: found.provider, photos: found.photos.map(({ thumb: _thumb, ...p }) => p) })]
    } finally { preview.dispose() }
  }, true),
  browser('browser_navigate', 'Navigate your private browser to a public HTTP(S) page. Local addresses and Chalk endpoints are blocked. No logged-in state is inherited.', { url: z.string() }, async ({ url }, b) => [text(await b.navigate(url))]),
  browser('browser_snapshot', 'Read your private page and its browser-specific refs. Other jobs cannot use these refs.', {}, async (_a, b) => [text(await b.snapshot())], true),
  browser('browser_click', 'Click a ref from your private snapshot.', { ref: z.string() }, async ({ ref }, b) => [text(await b.click(ref))]),
  browser('browser_type', 'Type into your private page.', { ref: z.string(), text: z.string(), submit: z.boolean().optional() }, async ({ ref, text: value, submit }, b) => [text(await b.type(ref, value, !!submit))]),
  browser('browser_scroll', 'Scroll your private page.', { dy: z.number() }, async ({ dy }, b) => [text(await b.scroll(dy))]),
  browser('browser_back', 'Go back in your private browser.', {}, async (_a, b) => [text(await b.back())]),
  browser('browser_screenshot', 'Capture your private page as an image. This never publishes an asset or frame.', { full_page: z.boolean().optional(), ref: z.string().optional() }, async ({ full_page, ref }, b) => [image((await b.screenshot({ fullPage: full_page, ref })).png)], true),
  browser('browser_extract_styles', 'Extract styles from your private page.', {}, async (_a, b) => [text(await b.extractStyles())], true),
  browser('browser_set_device', 'Change only your private viewport.', { device: z.enum(BROWSER_DEVICE_IDS) }, async ({ device }, b) => [text(await b.setDevice(device))]),
  browser('browser_state', 'Read only your private browser state.', {}, async (_a, b) => [text(b.state())], true)
]
export const workerTools = (ctx: WorkerContext): WorkerTool[] => ctx.job.role === 'integrate' ? WORKER_TOOLS.filter(t => !['create_frame', 'delete_frame'].includes(t.name)) : WORKER_TOOLS
