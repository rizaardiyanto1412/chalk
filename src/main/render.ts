import { BrowserWindow, session } from 'electron'
import { z } from 'zod'
import { previews } from './previews'

const SETTLE_JS = `Promise.race([
  Promise.all([document.fonts.ready, customElements.whenDefined('iconify-icon').catch(() => {})]),
  new Promise((r) => setTimeout(r, 2500))
]).then(() => new Promise((r) => setTimeout(r, 350)))`

const MAX_HEIGHT = 12000
let exportSession: Electron.Session | undefined

function privateExportSession(origin: string): Electron.Session {
  if (exportSession) return exportSession
  exportSession = session.fromPartition('chalk-frame-exports')
  exportSession.webRequest.onBeforeRequest((details, callback) => {
    const request = new URL(details.url)
    const host = request.hostname.toLowerCase().replace(/\.$/, '')
    const local = host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) || host === '0.0.0.0' || host === '[::]' || host === '[::1]' || host.startsWith('[::ffff:')
    const serverPort = request.port === new URL(origin).port
    const token = request.pathname.match(/^\/preview\/([\w-]+)$/)?.[1]
    const allowedLocal = request.origin === origin && (request.pathname === '/vendor/tailwind.js' || (token !== undefined && previews.get(token)?.kind === 'document'))
    callback({ cancel: request.protocol === 'file:' || ((local || serverPort) && !allowedLocal) })
  })
  return exportSession
}

export interface RenderResult {
  png: Buffer
  contentHeight: number
}

interface ReviewedRenderResult extends RenderResult {
  diagnostics: RenderDiagnostics
}

const diagnosticsSchema = z.object({
  viewport: z.object({ width: z.number(), height: z.number() }),
  content: z.object({ width: z.number(), height: z.number() }),
  horizontalOverflowPx: z.number(),
  clippedBelowFramePx: z.number(),
  failedImages: z.array(z.object({ source: z.string(), alt: z.string() })),
  pendingImages: z.number()
})

export type RenderDiagnostics = z.infer<typeof diagnosticsSchema>

const DIAGNOSTICS_JS = `(() => {
  const root = document.documentElement;
  const body = document.body;
  const width = Math.max(root.scrollWidth, body?.scrollWidth ?? 0);
  const height = Math.max(root.scrollHeight, body?.scrollHeight ?? 0);
  const images = [...document.images].filter((image) => image.currentSrc || image.getAttribute('src'));
  return {
    viewport: { width: innerWidth, height: innerHeight },
    content: { width, height },
    horizontalOverflowPx: Math.max(0, width - innerWidth),
    clippedBelowFramePx: Math.max(0, height - innerHeight),
    failedImages: images.filter((image) => image.complete && image.naturalWidth === 0)
      .slice(0, 20).map((image) => ({ source: (image.currentSrc || image.src).slice(0, 300), alt: image.alt })),
    pendingImages: images.filter((image) => !image.complete).length
  };
})()`

/**
 * Load a frame URL in a fresh offscreen window and capture it. A new window per render keeps
 * concurrent renders from sharing size or load state.
 */
export function renderUrl(url: string, width: number, height: number, review: true): Promise<ReviewedRenderResult>
export function renderUrl(url: string, width: number, height?: number): Promise<RenderResult>
export async function renderUrl(url: string, width: number, height?: number, review = false): Promise<RenderResult | ReviewedRenderResult> {
  return withSettledPage(url, width, height, async (win, target, contentHeight) => {
    const diagnostics = review ? diagnosticsSchema.parse(await win.webContents.executeJavaScript(DIAGNOSTICS_JS)) : null
    win.webContents.invalidate()
    const image = await win.webContents.capturePage({ x: 0, y: 0, width, height: target })
    return diagnostics ? { png: image.toPNG(), contentHeight, diagnostics } : { png: image.toPNG(), contentHeight }
  })
}

export async function renderExport(url: string, width: number, height: number, format: 'png' | 'jpeg' | 'pdf'): Promise<Buffer> {
  return withSettledPage(url, width, height, async (win) => {
    if (format === 'pdf') {
      await win.webContents.insertCSS(`@page{margin:0!important}html,body{width:${width}px!important;height:${height}px!important;max-height:${height}px!important;overflow:hidden!important}`)
      return win.webContents.printToPDF({
        pageSize: { width: width / 96, height: height / 96 },
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
        printBackground: true,
        preferCSSPageSize: false,
        pageRanges: '1'
      })
    }
    win.webContents.invalidate()
    const image = await win.webContents.capturePage({ x: 0, y: 0, width, height })
    return format === 'jpeg' ? image.toJPEG(90) : image.toPNG()
  }, true)
}

async function withSettledPage<T>(url: string, width: number, height: number | undefined, use: (win: BrowserWindow, target: number, contentHeight: number) => Promise<T>, privateExport = false): Promise<T> {
  const privateSession = privateExport ? privateExportSession(new URL(url).origin) : undefined
  const win = new BrowserWindow({
    show: false,
    width,
    height: height ?? 900,
    useContentSize: true,
    ...(privateExport ? { backgroundColor: '#ffffff' } : {}),
    webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true, ...(privateSession ? { session: privateSession } : {}) }
  })
  // Frame HTML is untrusted: it must not take the render window anywhere else.
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  try {
    await win.loadURL(url).catch((err: Error) => {
      // A frame script that tries to navigate aborts the load promise even though navigation was blocked.
      if (!String(err).includes('ERR_ABORTED')) throw err
    })
    if (win.webContents.isLoading()) await new Promise<void>((r) => win.webContents.once('did-stop-loading', () => r()))
    await win.webContents.executeJavaScript(SETTLE_JS)
    let contentHeight = Math.min(
      MAX_HEIGHT,
      Math.ceil(await win.webContents.executeJavaScript('document.documentElement.scrollHeight'))
    )
    let target = height ?? contentHeight
    win.setContentSize(width, target)
    await win.webContents.executeJavaScript(`Promise.race([
      Promise.all([...document.images].filter((image) => !image.complete).map((image) => new Promise((resolve) => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      }))),
      new Promise((resolve) => setTimeout(resolve, 1500))
    ]).then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))`)
    contentHeight = Math.min(MAX_HEIGHT, Math.ceil(await win.webContents.executeJavaScript('document.documentElement.scrollHeight')))
    if (height === undefined && contentHeight !== target) {
      target = contentHeight
      win.setContentSize(width, target)
      await win.webContents.executeJavaScript('new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    }
    return await use(win, target, contentHeight)
  } finally {
    win.destroy()
  }
}
