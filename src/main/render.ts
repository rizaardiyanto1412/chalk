import { BrowserWindow } from 'electron'

const SETTLE_JS = `Promise.race([
  Promise.all([document.fonts.ready, customElements.whenDefined('iconify-icon').catch(() => {})]),
  new Promise((r) => setTimeout(r, 2500))
]).then(() => new Promise((r) => setTimeout(r, 350)))`

const MAX_HEIGHT = 12000

export interface RenderResult {
  png: Buffer
  contentHeight: number
}

/**
 * Load a frame URL in a fresh offscreen window and capture it. A new window per render keeps
 * concurrent renders from sharing size or load state.
 */
export async function renderUrl(url: string, width: number, height?: number): Promise<RenderResult> {
  const win = new BrowserWindow({
    show: false,
    width,
    height: height ?? 900,
    useContentSize: true,
    webPreferences: { offscreen: true, backgroundThrottling: false, sandbox: true }
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
    const contentHeight = Math.min(
      MAX_HEIGHT,
      Math.ceil(await win.webContents.executeJavaScript('document.documentElement.scrollHeight'))
    )
    const target = height ?? contentHeight
    win.setContentSize(width, target)
    await new Promise((r) => setTimeout(r, 120))
    win.webContents.invalidate()
    const image = await win.webContents.capturePage({ x: 0, y: 0, width, height: target })
    return { png: image.toPNG(), contentHeight }
  } finally {
    win.destroy()
  }
}
