import { randomUUID } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { nativeImage } from 'electron'
import { z } from 'zod'
import { findFrame, nextSlot, FRAME_GAP, type Frame, type FrameId, type HtmlFrame } from '../shared/model'
import type { Store } from './store'
import type { Browser } from './browser'
import { renderUrl } from './render'
import { frameDocument } from './frameHtml'
import { DESIGN_GUIDE } from './prompt'

export type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }

export interface ToolContext {
  store: Store
  browser: Browser
  frameUrl: (frame: Frame) => string
  /** Render HTML that is not on the canvas yet and return its content height. */
  measure: (html: string, width: number) => Promise<number>
  /** Tell the UI what the agent is touching so the user can watch it. */
  focus: (target: { mode: 'canvas'; frameId?: FrameId } | { mode: 'browser' }) => void
}

export interface Tool<S extends z.ZodRawShape = z.ZodRawShape> {
  name: string
  description: string
  input: S
  readOnly?: boolean
  run: (args: z.infer<z.ZodObject<S>>, ctx: ToolContext) => Promise<Content[]>
}

const tool = <S extends z.ZodRawShape>(t: Tool<S>): Tool => t as unknown as Tool

const text = (value: unknown): Content => ({ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) })

const MAX_EDGE = 7800
const MAX_BYTES = 3_500_000

/** Keep images inside the model's size limits: scale down tall captures, then JPEG, then shrink until it fits. */
function image(png: Buffer): Content {
  const src = nativeImage.createFromBuffer(png)
  const { width, height } = src.getSize()
  let scale = Math.min(1, MAX_EDGE / Math.max(width, height))
  const at = (s: number) => (s < 1 ? src.resize({ width: Math.round(width * s), height: Math.round(height * s), quality: 'best' }) : src)
  const asPng = at(scale).toPNG()
  if (asPng.length <= MAX_BYTES) return { type: 'image', data: asPng.toString('base64'), mimeType: 'image/png' }
  let jpeg = at(scale).toJPEG(82)
  while (jpeg.length > MAX_BYTES && scale > 0.05) {
    scale *= 0.75
    jpeg = at(scale).toJPEG(78)
  }
  return { type: 'image', data: jpeg.toString('base64'), mimeType: 'image/jpeg' }
}

function frameSummary(f: Frame) {
  return { id: f.id, name: f.name, kind: f.kind, x: f.x, y: f.y, width: f.width, height: f.height, ...(f.kind === 'image' ? { sourceUrl: f.sourceUrl } : {}) }
}

function requireFrame(ctx: ToolContext, id: string): Frame {
  const f = findFrame(ctx.store.doc, id)
  if (!f) throw new Error(`No frame with id "${id}". Call get_canvas to list frames.`)
  return f
}

function requireHtml(ctx: ToolContext, id: string): HtmlFrame {
  const f = requireFrame(ctx, id)
  if (f.kind !== 'html') throw new Error(`Frame "${f.name}" is a screenshot, not an HTML design.`)
  return f
}

const fitted = async (ctx: ToolContext, html: string, width: number) => Math.max(100, await ctx.measure(html, width))

function applyEdits(source: string, edits: { find: string; replace: string }[]): string {
  let html = source
  for (const [i, e] of edits.entries()) {
    const at = html.indexOf(e.find)
    if (at < 0) throw new Error(`Edit ${i + 1}: text not found. Call get_frame and copy the exact text.`)
    if (html.indexOf(e.find, at + 1) >= 0) throw new Error(`Edit ${i + 1}: text appears more than once. Include more surrounding text.`)
    html = html.slice(0, at) + e.replace + html.slice(at + e.find.length)
  }
  return html
}

const newId = () => randomUUID().slice(0, 8) as FrameId

export const TOOLS: Tool[] = [
  tool({
    name: 'get_canvas',
    description: 'List every frame on the Easel canvas (id, name, kind, position, size), plus what the user has selected: selected frame ids and the element they picked in the built-in browser.',
    input: {},
    readOnly: true,
    run: async (_a, ctx) => [
      text({
        project: ctx.store.dir,
        frames: ctx.store.doc.frames.map(frameSummary),
        selectedFrameIds: ctx.store.selection,
        browserPick: ctx.store.browserPick
      })
    ]
  }),
  tool({
    name: 'get_frame',
    description: 'Get the HTML of a frame. The fragment is Tailwind v4 markup for <body>. Set standalone=true for a complete HTML document that runs in any browser (loads Tailwind, Inter, and iconify-icon from CDNs). For an implementation, reproduce it exactly: same layout, spacing, colors, type, copy, and icons.',
    input: { id: z.string(), standalone: z.boolean().optional() },
    readOnly: true,
    run: async ({ id, standalone }, ctx) => {
      const f = requireHtml(ctx, id)
      return [text(standalone ? frameDocument(f) : f.html)]
    }
  }),
  tool({
    name: 'screenshot_frame',
    description: 'Render a frame and return it as an image. Use it to check your own work after every change, or to see a design you must implement.',
    input: { id: z.string() },
    readOnly: true,
    run: async ({ id }, ctx) => {
      const f = requireFrame(ctx, id)
      ctx.focus({ mode: 'canvas', frameId: f.id })
      if (f.kind === 'image') return [image(readFileSync(ctx.store.assetPath(f.asset)))]
      const { png } = await renderUrl(ctx.frameUrl(f), f.width, f.height)
      return [image(png)]
    }
  }),
  tool({
    name: 'create_frame',
    description: 'Create a new design frame from an HTML fragment (Tailwind v4 classes, content of <body> only). Width defaults to 1440 (use 390 for mobile). Height fits the content unless you give one. Position defaults to the right of existing frames; pass near_frame_id to place it right of a specific frame.',
    input: {
      name: z.string(),
      html: z.string(),
      width: z.number().int().min(200).max(3840).optional(),
      height: z.number().int().min(100).max(12000).optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      near_frame_id: z.string().optional()
    },
    run: async (a, ctx) => {
      const width = a.width ?? 1440
      const height = a.height ?? (await fitted(ctx, a.html, width))
      const near = a.near_frame_id ? findFrame(ctx.store.doc, a.near_frame_id) : undefined
      const slot = near ? { x: near.x + near.width + FRAME_GAP, y: near.y } : nextSlot(ctx.store.doc)
      const id = newId()
      ctx.store.dispatch({
        type: 'add',
        frame: { id, kind: 'html', name: a.name, html: a.html, width, height, x: a.x ?? slot.x, y: a.y ?? slot.y, updatedAt: Date.now() }
      })
      ctx.focus({ mode: 'canvas', frameId: id })
      return [text({ created: frameSummary(requireFrame(ctx, id)), next: 'Call screenshot_frame to review it.' })]
    }
  }),
  tool({
    name: 'update_frame',
    description: 'Replace a frame\'s HTML and/or change its name, size, or position. Height re-fits to the content when html or width changes and no height is given.',
    input: {
      id: z.string(),
      html: z.string().optional(),
      name: z.string().optional(),
      width: z.number().int().min(200).max(3840).optional(),
      height: z.number().int().min(100).max(12000).optional(),
      x: z.number().optional(),
      y: z.number().optional()
    },
    run: async ({ id, ...patch }, ctx) => {
      const f = requireFrame(ctx, id)
      if (patch.html !== undefined && f.kind !== 'html') throw new Error('Screenshot frames have no HTML.')
      const refit = f.kind === 'html' && patch.height === undefined && (patch.html !== undefined || patch.width !== undefined)
      const height = refit ? await fitted(ctx, patch.html ?? (f as HtmlFrame).html, patch.width ?? f.width) : patch.height
      requireFrame(ctx, f.id)
      ctx.store.dispatch({ type: 'patch', id: f.id, patch: { ...patch, ...(height !== undefined ? { height } : {}) } })
      ctx.focus({ mode: 'canvas', frameId: f.id })
      return [text({ updated: frameSummary(requireFrame(ctx, f.id)) })]
    }
  }),
  tool({
    name: 'edit_frame',
    description: 'Make targeted edits to a frame\'s HTML. Each edit replaces one exact, unique substring. Prefer this over update_frame for small changes.',
    input: { id: z.string(), edits: z.array(z.object({ find: z.string().min(1), replace: z.string() })).min(1) },
    run: async ({ id, edits }, ctx) => {
      const f = requireHtml(ctx, id)
      const html = applyEdits(f.html, edits)
      const height = await fitted(ctx, html, f.width)
      // Re-apply on the latest HTML so an edit that landed while we measured is kept.
      const latest = requireHtml(ctx, id)
      ctx.store.dispatch({ type: 'patch', id: f.id, patch: { html: latest.html === f.html ? html : applyEdits(latest.html, edits), height } })
      ctx.focus({ mode: 'canvas', frameId: f.id })
      return [text({ updated: frameSummary(requireFrame(ctx, f.id)), editsApplied: edits.length })]
    }
  }),
  tool({
    name: 'delete_frame',
    description: 'Delete a frame from the canvas.',
    input: { id: z.string() },
    run: async ({ id }, ctx) => {
      const f = requireFrame(ctx, id)
      ctx.store.dispatch({ type: 'delete', id: f.id })
      return [text(`Deleted "${f.name}".`)]
    }
  }),
  tool({
    name: 'get_design_guidelines',
    description: 'The Easel design guide: layout, type, color, and component rules every Easel design follows. Read it before you implement or extend an Easel design so the result matches.',
    input: {},
    readOnly: true,
    run: async () => [text(DESIGN_GUIDE)]
  }),
  tool({
    name: 'browser_state',
    description: 'Current URL, title, and loading state of the built-in browser.',
    input: {},
    readOnly: true,
    run: async (_a, ctx) => [text(ctx.browser.state())]
  }),
  tool({
    name: 'browser_navigate',
    description: 'Open a URL (or a search query) in the built-in browser and wait for it to load. localhost URLs work.',
    input: { url: z.string() },
    run: async ({ url }, ctx) => {
      ctx.focus({ mode: 'browser' })
      return [text(await ctx.browser.navigate(url))]
    }
  }),
  tool({
    name: 'browser_snapshot',
    description: 'Read the page structure: landmarks (header, nav, main, footer, dialogs), headings, and every visible interactive element with a ref like [e12]. Use refs with browser_click, browser_type, browser_screenshot, and browser_capture_to_canvas. Refs reset after navigation.',
    input: {},
    readOnly: true,
    run: async (_a, ctx) => {
      ctx.focus({ mode: 'browser' })
      const s = await ctx.browser.snapshot()
      return [text(`URL: ${s.url}\nTitle: ${s.title}\nViewport: ${s.viewport}, scrollY ${s.scrollY} of ${s.pageHeight}\n\n${s.tree}`)]
    }
  }),
  tool({
    name: 'browser_click',
    description: 'Click an element by its snapshot ref (for example a menu item or link). Waits for any navigation.',
    input: { ref: z.string() },
    run: async ({ ref }, ctx) => {
      ctx.focus({ mode: 'browser' })
      return [text(await ctx.browser.click(ref))]
    }
  }),
  tool({
    name: 'browser_type',
    description: 'Type text into an input by snapshot ref. Set submit=true to press Enter.',
    input: { ref: z.string(), text: z.string(), submit: z.boolean().optional() },
    run: async ({ ref, text: value, submit }, ctx) => {
      ctx.focus({ mode: 'browser' })
      return [text(await ctx.browser.type(ref, value, !!submit))]
    }
  }),
  tool({
    name: 'browser_scroll',
    description: 'Scroll the page by dy pixels (negative scrolls up). Returns the new scroll position.',
    input: { dy: z.number() },
    run: async ({ dy }, ctx) => [text({ scrollY: await ctx.browser.scroll(dy) })]
  }),
  tool({
    name: 'browser_back',
    description: 'Go back one page in the built-in browser.',
    input: {},
    run: async (_a, ctx) => [text(await ctx.browser.back())]
  }),
  tool({
    name: 'browser_screenshot',
    description: 'Screenshot the built-in browser: the viewport (default), the full page, or one element by ref.',
    input: { full_page: z.boolean().optional(), ref: z.string().optional() },
    readOnly: true,
    run: async ({ full_page, ref }, ctx) => {
      ctx.focus({ mode: 'browser' })
      const shot = await ctx.browser.screenshot({ fullPage: full_page, ref })
      return [image(shot.png), text(`${shot.width}×${shot.height} from ${ctx.browser.state().url}`)]
    }
  }),
  tool({
    name: 'browser_capture_to_canvas',
    description: 'Put a screenshot of the current page (full page by default, or one element by ref) on the canvas as a reference frame. Returns the new frame id, so you can place a redesign next to it with create_frame near_frame_id.',
    input: { name: z.string().optional(), ref: z.string().optional(), full_page: z.boolean().optional() },
    run: async ({ name, ref, full_page }, ctx) => {
      const state = ctx.browser.state()
      const shot = await ctx.browser.screenshot({ ref, fullPage: ref ? false : full_page ?? true })
      const id = newId()
      const asset = `${id}.png`
      writeFileSync(ctx.store.assetPath(asset), shot.png)
      const slot = nextSlot(ctx.store.doc)
      ctx.store.dispatch({
        type: 'add',
        frame: { id, kind: 'image', asset, sourceUrl: state.url, name: name ?? (state.title || state.url), x: slot.x, y: slot.y, width: shot.width, height: shot.height, updatedAt: Date.now() }
      })
      ctx.focus({ mode: 'canvas', frameId: id })
      return [text({ created: frameSummary(requireFrame(ctx, id)) })]
    }
  }),
  tool({
    name: 'browser_extract_styles',
    description: 'Measure the current page\'s visual language: most used text colors, backgrounds, font families, font sizes, and corner radii. Use it to keep a redesign on brand.',
    input: {},
    readOnly: true,
    run: async (_a, ctx) => [text(await ctx.browser.extractStyles())]
  })
]

export const TOOL_NAMES = TOOLS.map((t) => t.name)
