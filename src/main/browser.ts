import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { WebContentsView, type BaseWindow, type Rectangle } from 'electron'
import type { BrowserPick } from '../shared/model'

export interface BrowserState {
  url: string
  title: string
  loading: boolean
  canGoBack: boolean
  canGoForward: boolean
  picking: boolean
}


const SNAPSHOT_JS = `(() => {
  const MAX = 450
  const lines = []
  let n = 0
  document.querySelectorAll('[data-easel-ref]').forEach((el) => el.removeAttribute('data-easel-ref'))
  const visible = (el) => {
    const r = el.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return false
    const s = getComputedStyle(el)
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0'
  }
  const text = (el) => (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || el.alt || '').replace(/\\s+/g, ' ').trim().slice(0, 80)
  const INTERACTIVE = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],[role=switch],[onclick]'
  const LANDMARK = { HEADER: 'header', NAV: 'nav', MAIN: 'main', ASIDE: 'aside', FOOTER: 'footer', FORM: 'form', DIALOG: 'dialog' }
  const walk = (el, depth) => {
    if (lines.length >= MAX || !(el instanceof Element)) return
    const tag = el.tagName
    let d = depth
    const role = el.getAttribute('role')
    const mark = LANDMARK[tag] || (role && ['navigation','banner','main','contentinfo','dialog','menu','menubar','tablist'].includes(role) ? role : null)
    if (mark && visible(el)) { lines.push('  '.repeat(d) + mark + (el.getAttribute('aria-label') ? ' "' + el.getAttribute('aria-label') + '"' : '') + ':'); d++ }
    if (/^H[1-3]$/.test(tag) && visible(el)) { lines.push('  '.repeat(d) + tag.toLowerCase() + ' "' + text(el) + '"'); return }
    if (el.matches(INTERACTIVE) && visible(el)) {
      const ref = 'e' + (++n)
      el.setAttribute('data-easel-ref', ref)
      const kind = role || (tag === 'A' ? 'link' : tag === 'INPUT' ? 'input[' + (el.type || 'text') + ']' : tag.toLowerCase())
      const href = tag === 'A' ? ' -> ' + el.getAttribute('href') : ''
      const state = el.getAttribute('aria-expanded') ? ' (expanded=' + el.getAttribute('aria-expanded') + ')' : ''
      lines.push('  '.repeat(d) + '[' + ref + '] ' + kind + ' "' + text(el) + '"' + href + state)
      if (tag !== 'SELECT') return
    }
    for (const c of el.children) walk(c, d)
  }
  walk(document.body, 0)
  const h = document.documentElement
  return { url: location.href, title: document.title, scrollY: Math.round(scrollY), pageHeight: h.scrollHeight, viewport: innerWidth + 'x' + innerHeight, tree: lines.join('\\n') + (lines.length >= MAX ? '\\n…(truncated)' : '') }
})()`

const STYLES_JS = `(() => {
  const tally = (m, k, w = 1) => { if (k) m.set(k, (m.get(k) || 0) + w) }
  const colors = new Map(), bgs = new Map(), fonts = new Map(), sizes = new Map(), radii = new Map()
  const els = [...document.querySelectorAll('body *')].slice(0, 4000)
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    const s = getComputedStyle(el)
    const area = Math.min(r.width * r.height, 200000) / 1000
    if (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) {
      tally(colors, s.color); tally(fonts, s.fontFamily.split(',')[0].replace(/["']/g, '').trim()); tally(sizes, s.fontSize)
    }
    if (s.backgroundColor !== 'rgba(0, 0, 0, 0)') tally(bgs, s.backgroundColor, area)
    if (s.borderRadius !== '0px') tally(radii, s.borderRadius)
  }
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k)
  const bodyStyle = getComputedStyle(document.body)
  return { textColors: top(colors, 8), backgrounds: top(bgs, 8), fonts: top(fonts, 4), fontSizes: top(sizes, 8), radii: top(radii, 5), bodyBackground: bodyStyle.backgroundColor }
})()`

const pickJs = (prefix: string) => `(() => {
  if (window.__easelPick) return
  const box = document.createElement('div')
  box.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;border:2px solid #2563eb;background:rgba(37,99,235,.08);border-radius:3px;transition:all .05s'
  const label = document.createElement('div')
  label.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483647;background:#2563eb;color:#fff;font:600 11px/1.6 -apple-system,sans-serif;padding:0 6px;border-radius:3px'
  document.documentElement.append(box, label)
  let cur = null
  const path = (el) => {
    const parts = []
    while (el && el.nodeType === 1 && el !== document.body && parts.length < 6) {
      let p = el.tagName.toLowerCase()
      if (el.id) { parts.unshift(p + '#' + CSS.escape(el.id)); break }
      const sib = [...el.parentNode.children].filter((c) => c.tagName === el.tagName)
      if (sib.length > 1) p += ':nth-of-type(' + (sib.indexOf(el) + 1) + ')'
      parts.unshift(p); el = el.parentElement
    }
    return parts.join(' > ')
  }
  const move = (e) => {
    cur = e.target
    const r = cur.getBoundingClientRect()
    Object.assign(box.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' })
    label.textContent = cur.tagName.toLowerCase() + '  ' + Math.round(r.width) + '×' + Math.round(r.height)
    Object.assign(label.style, { left: r.left + 'px', top: Math.max(0, r.top - 20) + 'px' })
  }
  const stop = () => { removeEventListener('mousemove', move, true); removeEventListener('click', click, true); removeEventListener('keydown', key, true); box.remove(); label.remove(); window.__easelPick = null }
  const click = (e) => {
    e.preventDefault(); e.stopPropagation()
    const el = cur || e.target
    const r = el.getBoundingClientRect()
    stop()
    console.log('${prefix}' + JSON.stringify({ url: location.href, selector: path(el), tag: el.tagName.toLowerCase(), text: (el.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 300), rect: { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }, outerHTML: el.outerHTML.slice(0, 6000) }))
  }
  const key = (e) => { if (e.key === 'Escape') { stop(); console.log('${prefix}null') } }
  addEventListener('mousemove', move, true); addEventListener('click', click, true); addEventListener('keydown', key, true)
  window.__easelPick = stop
})()`

export class Browser extends EventEmitter {
  readonly view: WebContentsView
  private picking = false
  /** Random per pick session, so a page cannot forge a pick by logging to the console. */
  private pickPrefix: string | null = null

  constructor() {
    super()
    this.view = new WebContentsView({ webPreferences: { partition: 'persist:easel-browser', sandbox: true } })
    this.view.setVisible(false)
    const wc = this.view.webContents
    wc.setUserAgent(wc.getUserAgent().replace(/ (Electron|easel)\/\S+/g, ''))
    for (const ev of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page', 'page-title-updated'] as const) {
      wc.on(ev as 'did-stop-loading', () => {
        if (ev === 'did-navigate') this.picking = false
        this.emit('state', this.state())
      })
    }
    wc.setWindowOpenHandler(({ url }) => {
      void wc.loadURL(url)
      return { action: 'deny' }
    })
    wc.on('console-message', (e) => {
      const message = (e as unknown as { message: string }).message
      const prefix = this.pickPrefix
      if (!prefix || typeof message !== 'string' || !message.startsWith(prefix)) return
      this.pickPrefix = null
      this.picking = false
      this.emit('state', this.state())
      const pick = parsePick(message.slice(prefix.length))
      if (pick !== undefined) this.emit('pick', pick)
    })
  }

  attach(win: BaseWindow): void {
    win.contentView.addChildView(this.view)
  }

  setBounds(b: Rectangle): void {
    this.view.setBounds({ x: Math.round(b.x), y: Math.round(b.y), width: Math.round(b.width), height: Math.round(b.height) })
  }

  setVisible(v: boolean): void {
    this.view.setVisible(v)
  }

  state(): BrowserState {
    const wc = this.view.webContents
    return {
      url: wc.getURL(),
      title: wc.getTitle(),
      loading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
      picking: this.picking
    }
  }

  async navigate(input: string): Promise<BrowserState> {
    const url = /^[a-z]+:\/\//i.test(input) ? input : /^localhost|^\d+\.\d+\.\d+\.\d+|^[\w-]+(\.[\w-]+)+(:\d+)?(\/|$)/.test(input) ? `${input.startsWith('localhost') || /^\d/.test(input) ? 'http' : 'https'}://${input}` : `https://www.google.com/search?q=${encodeURIComponent(input)}`
    try {
      await this.view.webContents.loadURL(url)
    } catch (err) {
      if (!String(err).includes('ERR_ABORTED')) throw err
    }
    await this.settle()
    return this.state()
  }

  async back(): Promise<BrowserState> {
    this.view.webContents.navigationHistory.goBack()
    await this.settle()
    return this.state()
  }

  forward(): void {
    this.view.webContents.navigationHistory.goForward()
  }

  reload(): void {
    this.view.webContents.reload()
  }

  /** Wait for loading to finish plus a short quiet period for client-side rendering. */
  async settle(): Promise<void> {
    const wc = this.view.webContents
    if (wc.isLoading()) await new Promise<void>((r) => { wc.once('did-stop-loading', () => r()); setTimeout(r, 15000) })
    await new Promise((r) => setTimeout(r, 600))
  }

  snapshot(): Promise<{ url: string; title: string; scrollY: number; pageHeight: number; viewport: string; tree: string }> {
    return this.view.webContents.executeJavaScript(SNAPSHOT_JS)
  }

  extractStyles(): Promise<Record<string, unknown>> {
    return this.view.webContents.executeJavaScript(STYLES_JS)
  }

  private async withRef<T>(ref: string, js: (sel: string) => string): Promise<T> {
    const sel = JSON.stringify(`[data-easel-ref="${ref}"]`)
    const res = await this.view.webContents.executeJavaScript(
      `(() => { const el = document.querySelector(${sel}); if (!el) return { error: 'No element ${ref}. Take a new browser_snapshot; refs reset after navigation.' }; ${js('el')} })()`
    )
    if (res && typeof res === 'object' && 'error' in res) throw new Error(String(res.error))
    return res as T
  }

  async click(ref: string): Promise<BrowserState> {
    await this.withRef(ref, (el) => `${el}.scrollIntoView({ block: 'center' }); ${el}.focus?.(); ${el}.click(); return true`)
    await new Promise((r) => setTimeout(r, 300))
    await this.settle()
    return this.state()
  }

  async type(ref: string, text: string, submit: boolean): Promise<BrowserState> {
    await this.withRef(ref, (el) => `${el}.focus(); const proto = Object.getPrototypeOf(${el}); const set = Object.getOwnPropertyDescriptor(proto, 'value')?.set; set ? set.call(${el}, ${JSON.stringify(text)}) : (${el}.value = ${JSON.stringify(text)}); ${el}.dispatchEvent(new Event('input', { bubbles: true })); ${el}.dispatchEvent(new Event('change', { bubbles: true })); return true`)
    if (submit) {
      for (const type of ['keyDown', 'char', 'keyUp'] as const) this.view.webContents.sendInputEvent({ type, keyCode: 'Return' })
      await new Promise((r) => setTimeout(r, 300))
      await this.settle()
    }
    return this.state()
  }

  async scroll(dy: number): Promise<number> {
    return this.view.webContents.executeJavaScript(`scrollBy(0, ${Number(dy) || 0}); new Promise(r => setTimeout(() => r(Math.round(scrollY)), 250))`)
  }

  /** Capture the viewport, the whole page, or one element (by snapshot ref) as PNG via CDP. */
  async screenshot(opts: { fullPage?: boolean; ref?: string } = {}): Promise<{ png: Buffer; width: number; height: number }> {
    const wc = this.view.webContents
    const dbg = wc.debugger
    if (!dbg.isAttached()) dbg.attach('1.3')
    let clip: { x: number; y: number; width: number; height: number } | undefined
    if (opts.ref) {
      clip = await this.withRef(opts.ref, (el) => `const r = ${el}.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, width: r.width, height: r.height }`)
    } else if (opts.fullPage) {
      const m = (await dbg.sendCommand('Page.getLayoutMetrics')) as { cssContentSize: { width: number; height: number } }
      clip = { x: 0, y: 0, width: m.cssContentSize.width, height: Math.min(m.cssContentSize.height, 10000) }
    }
    const res = (await dbg.sendCommand('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: !!clip,
      ...(clip ? { clip: { ...clip, scale: 1 } } : {})
    })) as { data: string }
    const png = Buffer.from(res.data, 'base64')
    return { png, width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
  }

  async startPick(): Promise<void> {
    this.picking = true
    this.pickPrefix = `__easel_pick_${randomUUID()}__`
    this.emit('state', this.state())
    await this.view.webContents.executeJavaScript(pickJs(this.pickPrefix))
  }

  async cancelPick(): Promise<void> {
    this.picking = false
    this.pickPrefix = null
    this.emit('state', this.state())
    await this.view.webContents.executeJavaScript('window.__easelPick && window.__easelPick()').catch(() => {})
  }
}

/** Parse a pick message from the page. `null` means the user cancelled; `undefined` means the message was malformed. */
function parsePick(raw: string): BrowserPick | null | undefined {
  try {
    const p = JSON.parse(raw)
    if (p === null) return null
    const r = p?.rect
    const ok =
      typeof p.url === 'string' && typeof p.selector === 'string' && typeof p.tag === 'string' && typeof p.text === 'string' &&
      typeof p.outerHTML === 'string' && r && ['x', 'y', 'width', 'height'].every((k) => typeof r[k] === 'number')
    return ok ? { url: p.url, selector: p.selector, tag: p.tag, text: p.text, outerHTML: p.outerHTML, rect: { x: r.x, y: r.y, width: r.width, height: r.height } } : undefined
  } catch {
    return undefined
  }
}
