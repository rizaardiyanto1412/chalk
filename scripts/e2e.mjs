import { _electron as electron } from 'playwright-core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, symlinkSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { PNG } from 'pngjs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'
import { checkExports } from './export-e2e.mjs'
import { checkFrames } from './frames-e2e.mjs'
import { checkBrowserDevices, checkBrowserDevicePreference } from './browser-devices-e2e.mjs'
import { checkStyles } from './styles-e2e.mjs'
import { checkArrangement } from './arrangement-e2e.mjs'
import { checkElements } from './elements-e2e.mjs'
import { checkMarquee } from './marquee-e2e.mjs'
import { checkPresence } from './presence-e2e.mjs'
import { checkChatHistory } from './chat-history-e2e.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = process.env.CHALK_E2E_ARTIFACTS || join(root, 'e2e-artifacts')
mkdirSync(artifacts, { recursive: true })
const project = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-e2e-')))
const profile = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-e2e-profile-')))
const fakeLog = join(artifacts, 'fake-claude.jsonl')
writeFileSync(fakeLog, '')
const PORT = Number(process.env.CHALK_PORT) || 7911
const results = []
const check = async (name, fn) => {
  const t = Date.now()
  try {
    const result = await fn()
    if (result?.skip) {
      results.push(['SKIP', name, Date.now() - t])
      console.log(`SKIP  ${name}\n      ${result.skip}`)
    } else {
      results.push(['PASS', name, Date.now() - t])
      console.log(`PASS  ${name}`)
    }
  } catch (err) {
    results.push(['FAIL', name, Date.now() - t])
    console.log(`FAIL  ${name}\n      ${err.stack?.split('\n').join('\n      ')}`)
  }
}

const site = createServer((req, res) => {
  const page = (title, body) => `<!doctype html><title>${title}</title><body style="font-family:Georgia;background:#fdf6e3;color:#073642;margin:0">
<header><nav aria-label="Main"><a href="/">Home</a> <a href="/pricing">Pricing</a> <button onclick="document.getElementById('m').hidden=false" aria-expanded="false">Products</button>
<ul id="m" hidden role="menu"><li><a role="menuitem" href="/analytics">Analytics</a></li></ul></nav></header>
<main><h1>${title}</h1>${body}<input placeholder="Email"><button style="background:#cb4b16;color:#fff;border-radius:6px">Subscribe</button></main><footer>© Test Co</footer></body>`
  res.writeHead(200, { 'content-type': 'text/html' })
  if (req.url === '/pricing') res.end(page('Pricing', '<p>Plans for every team.</p><div style="height:1800px"></div>'))
  else if (req.url === '/analytics') res.end(page('Analytics', '<p>Charts.</p>'))
  else res.end(page('Home', '<p>Welcome to Test Co.</p>'))
})
await new Promise((r) => site.listen(PORT + 1, '127.0.0.1', r))
const SITE = `http://127.0.0.1:${PORT + 1}`

const launch = () =>
  electron.launch({ args: [root, `--user-data-dir=${profile}`], cwd: root, env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE')), CHALK_CLAUDE_PATH: join(root, 'scripts/fixtures/fake-claude.mjs'), CHALK_FAKE_LOG: fakeLog, CHALK_PROJECT_DIR: project, CHALK_PORT: String(PORT), ELECTRON_RENDERER_URL: '' } })

async function mcp() {
  const client = new Client({ name: 'e2e', version: '0' })
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${PORT}/mcp`)))
  return client
}
const call = async (client, name, args = {}) => {
  const res = await client.callTool({ name, arguments: args })
  if (res.isError) throw new Error(`${name}: ${res.content[0]?.text}`)
  return res.content
}
const json = (content) => JSON.parse(content[0].text)

let app = await launch()
const actualProfile = await app.evaluate(({ app }) => app.getPath('userData'))
if (realpathSync(actualProfile) !== profile) {
  await app.close()
  site.close()
  throw new Error('Electron must use the temporary test profile.')
}
writeFileSync(join(artifacts, 'test-environment.json'), JSON.stringify({ project, profile, actualProfile }, null, 2))
let win = await app.firstWindow()
await win.waitForSelector('.titlebar')
const client = await mcp()
let frameId

const framesTab = () => win.locator('.left-tabs button', { hasText: 'Frames' }).click()
const agentTab = () => win.locator('.left-tabs button', { hasText: 'Agent' }).click()

await check('UI boots with the agent panel, tool strip, project tab, and browser panel', async () => {
  await win.waitForSelector('.agent-empty h4')
  assert.ok(await win.locator('.chat textarea').isVisible())
  assert.equal(await win.locator('.tab.is-on').count(), 1)
  assert.ok(await win.locator('.browser-home h3').isVisible())
  await framesTab()
  assert.equal(await win.locator('.layer').count(), 0)
  await agentTab()
  await win.screenshot({ path: join(artifacts, '01-empty.png') })
})

await checkPresence({ app, win, client, call, json, check, artifacts, agentTab })

await check('MCP lists the shared canvas, design, and browser tools', async () => {
  const { tools } = await client.listTools()
  assert.deepEqual(tools.map((t) => t.name).sort(), [
    'get_canvas', 'get_frame', 'screenshot_frame', 'review_frame', 'export_frame', 'copy_frame_image', 'create_frame', 'update_frame', 'edit_frame', 'delete_frame',
    'get_style', 'get_design_guidelines', 'search_photos', 'browser_state', 'browser_navigate', 'browser_snapshot', 'browser_click',
    'browser_set_device', 'browser_type', 'browser_scroll', 'browser_back', 'browser_screenshot', 'browser_capture_to_canvas', 'browser_extract_styles'
  ].sort())
  assert.equal(tools.find((t) => t.name === 'get_style').annotations.readOnlyHint, true)
  assert.equal(tools.find((t) => t.name === 'search_photos').annotations.readOnlyHint, true)
  assert.equal(tools.find((t) => t.name === 'review_frame').annotations.readOnlyHint, true)
})

await check('get_style lists distinct styles and loads fonts and semantic themes by id or name', async () => {
  const { styles } = json(await call(client, 'get_style'))
  assert.ok(styles.length >= 6)
  assert.equal(new Set(styles.map((s) => s.id)).size, styles.length)
  for (const listed of styles) {
    const style = json(await call(client, 'get_style', { name: listed.id }))
    assert.equal(style.name, listed.name)
    assert.ok(style.composition.length > 50)
    assert.ok(style.uses.length > 0)
    assert.ok(style.avoid.length > 0)
    assert.match(style.fontLinks, /fonts\.googleapis\.com/)
    assert.match(style.theme, /@theme/)
    assert.match(style.theme, /--color-on-accent:/)
    for (const color of Object.values(style.colors)) assert.match(color, /^#[\da-f]{6}$/i)
  }
  assert.equal(json(await call(client, 'get_style', { name: 'Field Notes' })).id, 'field-notes')
  const bad = await client.callTool({ name: 'get_style', arguments: { name: 'missing-style' } })
  assert.equal(bad.isError, true)
  assert.match(bad.content[0].text, /studio-ledger/)
})

await check('style theme renders semantic Tailwind tokens as the specified color', async () => {
  const style = json(await call(client, 'get_style', { name: 'studio-ledger' }))
  const out = json(await call(client, 'create_frame', { name: 'Theme fixture', width: 390, height: 200, html: `${style.fontLinks}${style.theme}<div class="min-h-screen bg-canvas text-ink font-sans p-6">Project library</div>` }))
  try {
    const [img] = await call(client, 'review_frame', { id: out.created.id })
    const png = PNG.sync.read(Buffer.from(img.data, 'base64'))
    assert.deepEqual([...png.data.subarray(0, 3)], [245, 246, 248])
  } finally {
    await call(client, 'delete_frame', { id: out.created.id })
  }
})

await checkStyles({ app, win, client, call, json, check, artifacts, root, project, agentTab, fakeLog })

await check('guidelines tailor the screen type and reload bounded project DESIGN.md notes', async () => {
  const file = join(project, 'DESIGN.md')
  const absent = (await call(client, 'get_design_guidelines'))[0].text
  assert.match(absent, /No project DESIGN.md found/)
  const landing = (await call(client, 'get_design_guidelines', { screen_type: 'landing-page' }))[0].text
  const dashboard = (await call(client, 'get_design_guidelines', { screen_type: 'dashboard' }))[0].text
  assert.match(landing, /one conversion goal/)
  assert.match(dashboard, /operational question/)
  assert.notEqual(landing, dashboard)
  try {
    writeFileSync(file, '# Brand\nUse orchard green and an editorial serif.')
    assert.match((await call(client, 'get_design_guidelines'))[0].text, /orchard green/)
    writeFileSync(file, '# Updated brand\nUse brick red and compact spacing.')
    const updated = (await call(client, 'get_design_guidelines'))[0].text
    assert.match(updated, /brick red/)
    assert.doesNotMatch(updated, /orchard green/)
    writeFileSync(file, 'A'.repeat(20000) + 'SHOULD_NOT_BE_INCLUDED')
    const bounded = (await call(client, 'get_design_guidelines'))[0].text
    assert.match(bounded, /truncated after 16384 bytes/)
    assert.doesNotMatch(bounded, /SHOULD_NOT_BE_INCLUDED/)
  } finally {
    unlinkSync(file)
  }
  assert.match((await call(client, 'get_design_guidelines'))[0].text, /No project DESIGN.md found/)
  const bad = await client.callTool({ name: 'get_design_guidelines', arguments: { screen_type: 'unknown' } })
  assert.equal(bad.isError, true)
})

await check('review_frame measures overflow and failed images, then reflects a repair', async () => {
  const out = json(await call(client, 'create_frame', { name: 'Review fixture', width: 390, height: 200, html: '<div style="width:800px;min-height:1000px;background:white">Overflow<img src="data:image/png;base64,AA==" alt="Broken fixture"></div>' }))
  try {
    const before = await call(client, 'review_frame', { id: out.created.id })
    assert.equal(before[0].type, 'image')
    const report = JSON.parse(before[1].text)
    assert.deepEqual(report.viewport, { width: 390, height: 200 })
    assert.ok(report.horizontalOverflowPx >= 410)
    assert.ok(report.clippedBelowFramePx >= 800)
    assert.equal(report.failedImages.length, 1)
    assert.equal(report.failedImages[0].alt, 'Broken fixture')
    assert.equal(report.pendingImages, 0)
    await call(client, 'update_frame', { id: out.created.id, height: 200, html: '<div style="width:100%;height:200px;background:white">Repaired layout</div>' })
    const after = JSON.parse((await call(client, 'review_frame', { id: out.created.id }))[1].text)
    assert.equal(after.horizontalOverflowPx, 0)
    assert.equal(after.clippedBelowFramePx, 0)
    assert.deepEqual(after.failedImages, [])
    assert.equal(after.pendingImages, 0)
  } finally {
    await call(client, 'delete_frame', { id: out.created.id })
  }
})

await check('project notes reject symbolic links and special files without reading them', async () => {
  const file = join(project, 'DESIGN.md')
  const target = join(project, 'private-test-notes.txt')
  writeFileSync(target, 'This target must not enter the design context.')
  try {
    symlinkSync(target, file)
    const link = await client.callTool({ name: 'get_design_guidelines', arguments: {} })
    assert.equal(link.isError, true)
    assert.match(link.content[0].text, /regular file/)
    assert.doesNotMatch(link.content[0].text, /must not enter/)
    unlinkSync(file)
    execFileSync('mkfifo', [file])
    const fifo = await client.callTool({ name: 'get_design_guidelines', arguments: {} })
    assert.equal(fifo.isError, true)
    assert.match(fifo.content[0].text, /regular file/)
  } finally {
    unlinkSync(file)
    unlinkSync(target)
  }
  assert.ok(json(await call(client, 'get_canvas')).frames)
})

await check('a malformed review observation does not break ordinary screenshots', async () => {
  const out = json(await call(client, 'create_frame', { name: 'Observation fixture', width: 390, height: 200, html: '<div>Visible design</div><script>Object.defineProperty(window,"innerWidth",{get:()=>"not a measurement"})</script>' }))
  try {
    const review = await client.callTool({ name: 'review_frame', arguments: { id: out.created.id } })
    assert.equal(review.isError, true)
    assert.equal((await call(client, 'screenshot_frame', { id: out.created.id }))[0].type, 'image')
  } finally {
    await call(client, 'delete_frame', { id: out.created.id })
  }
})

await check('create_frame adds a frame, fits height to content, and shows it on the canvas', async () => {
  const html = `<div class="min-h-[1200px] bg-white p-16"><h1 class="text-5xl font-semibold tracking-tight text-zinc-900">Hello Chalk</h1><p id="sub" class="mt-4 text-zinc-500">Subtitle</p><iconify-icon icon="lucide:sparkles" width="24"></iconify-icon></div>`
  const out = json(await call(client, 'create_frame', { name: 'Hello', html }))
  frameId = out.created.id
  assert.equal(out.created.width, 1440)
  assert.equal(out.created.height, 1200, 'height fitted from min-h-[1200px] proves Tailwind ran')
  await win.waitForSelector(`[data-frame-id="${frameId}"] iframe`)
  await framesTab()
  assert.equal(await win.locator('.layer').count(), 1)
})

await check('screenshot_frame returns a PNG of the rendered design', async () => {
  const [img] = await call(client, 'screenshot_frame', { id: frameId })
  assert.equal(img.type, 'image')
  const png = Buffer.from(img.data, 'base64')
  assert.equal(png.readUInt32BE(16), 1440)
  assert.equal(png.readUInt32BE(20), 1200)
  const { writeFileSync } = await import('node:fs')
  writeFileSync(join(artifacts, '02-frame-render.png'), png)
})

await check('edit_frame replaces a unique substring and rejects a missing one', async () => {
  await call(client, 'edit_frame', { id: frameId, edits: [{ find: '>Subtitle<', replace: '>Edited subtitle<' }] })
  const html = (await call(client, 'get_frame', { id: frameId }))[0].text
  assert.match(html, /Edited subtitle/)
  const bad = await client.callTool({ name: 'edit_frame', arguments: { id: frameId, edits: [{ find: 'nope', replace: 'x' }] } })
  assert.ok(bad.isError)
})

await check('get_frame standalone=true returns a full document with CDN Tailwind', async () => {
  const doc = (await call(client, 'get_frame', { id: frameId, standalone: true }))[0].text
  assert.match(doc, /^<!doctype html>/)
  assert.match(doc, /cdn\.jsdelivr\.net\/npm\/@tailwindcss\/browser@4/)
})

await check('get_canvas reports frames and the UI selection', async () => {
  await win.locator('.layer').first().click()
  await win.waitForTimeout(150)
  const c = json(await call(client, 'get_canvas'))
  assert.equal(c.frames.length, 1)
  assert.deepEqual(c.selectedFrameIds, [frameId])
  await win.screenshot({ path: join(artifacts, '03-canvas-selected.png') })
})

await checkExports({ app, win, client, call, json, check, project, artifacts, framesTab })

await check('browser_navigate loads a page and opens the browser panel', async () => {
  await win.locator('[aria-label="Close browser"]').click()
  await win.waitForSelector('.browser-panel', { state: 'detached' })
  const s = json(await call(client, 'browser_navigate', { url: SITE }))
  assert.equal(s.title, 'Home')
  await win.waitForSelector('.browser-panel')
})

await check('the browser shows the desktop layout by default, scaled to fit the panel', async () => {
  await win.waitForTimeout(300)
  const slot = await win.locator('.browser-slot').boundingBox()
  const view = await app.evaluate(async ({ BrowserWindow }) => {
    const v = BrowserWindow.getAllWindows()[0].contentView.children[0]
    return { visible: v.getVisible(), bounds: v.getBounds(), url: v.webContents.getURL(), cssWidth: await v.webContents.executeJavaScript('innerWidth') }
  })
  assert.ok(view.visible)
  assert.equal(view.url, `${SITE}/`)
  assert.equal(await win.getByLabel('Browser viewport').inputValue(), 'desktop')
  assert.equal(view.cssWidth, 1440, 'page lays out at desktop width')
  assert.ok(view.bounds.x >= slot.x - 1 && view.bounds.y >= slot.y - 1 && view.bounds.x + view.bounds.width <= slot.x + slot.width + 1 && view.bounds.y + view.bounds.height <= slot.y + slot.height + 1, 'scaled view stays inside the panel')
  assert.ok(Math.abs(view.bounds.x + view.bounds.width / 2 - (slot.x + slot.width / 2)) <= 1, 'centered horizontally')
  assert.ok(Math.abs(view.bounds.y + view.bounds.height / 2 - (slot.y + slot.height / 2)) <= 1, 'centered vertically')
})

await check('the Responsive viewport covers exactly the browser area', async () => {
  await call(client, 'browser_set_device', { device: 'responsive' })
  await win.waitForTimeout(300)
  const slot = await win.locator('.browser-slot').boundingBox()
  const view = await app.evaluate(({ BrowserWindow }) => {
    const v = BrowserWindow.getAllWindows()[0].contentView.children[0]
    return { visible: v.getVisible(), bounds: v.getBounds() }
  })
  assert.ok(view.visible)
  for (const k of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(view.bounds[k] - slot[k]) <= 1, `${k}: view ${view.bounds[k]} vs slot ${slot[k]}`)
  await win.locator('[aria-label="Close browser"]').click()
  await win.waitForTimeout(200)
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children[0].getVisible()), false, 'hidden when the panel closes')
  await win.locator('[aria-label="Open browser"]').click()
  await win.waitForTimeout(300)
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children[0].getVisible()), true, 'back when it reopens')
})

let snap
await check('browser_snapshot lists landmarks, headings, and refs for links and menus', async () => {
  snap = (await call(client, 'browser_snapshot'))[0].text
  assert.match(snap, /nav "Main":/)
  assert.match(snap, /\[e\d+\] link "Pricing" -> \/pricing/)
  assert.match(snap, /\[e\d+\] button "Products" \(expanded=false\)/)
  assert.match(snap, /h1 "Home"/)
})

await check('browser_click opens a hidden menu, then follows a menu link', async () => {
  const products = snap.match(/\[(e\d+)\] button "Products"/)[1]
  await call(client, 'browser_click', { ref: products })
  const after = (await call(client, 'browser_snapshot'))[0].text
  const item = after.match(/\[(e\d+)\] menuitem "Analytics"/)[1]
  const s = json(await call(client, 'browser_click', { ref: item }))
  assert.equal(s.url, `${SITE}/analytics`)
})

await check('browser_type fills an input', async () => {
  const s = (await call(client, 'browser_snapshot'))[0].text
  const email = s.match(/\[(e\d+)\] input\[text\] "Email"/)[1]
  await call(client, 'browser_type', { ref: email, text: 'a@b.co' })
})

await check('browser_screenshot captures viewport and full page', async () => {
  await call(client, 'browser_navigate', { url: `${SITE}/pricing` })
  const [vp] = await call(client, 'browser_screenshot')
  const [full] = await call(client, 'browser_screenshot', { full_page: true })
  const h = (img) => Buffer.from(img.data, 'base64').readUInt32BE(20)
  assert.ok(h(full) > 1800, `full page height ${h(full)}`)
  assert.ok(h(vp) < h(full))
  await win.screenshot({ path: join(artifacts, '04-browser.png') })
})

await check('browser_extract_styles reports the page fonts and colors', async () => {
  const s = json(await call(client, 'browser_extract_styles'))
  assert.ok(s.fonts.includes('Georgia'), JSON.stringify(s.fonts))
  assert.equal(s.bodyBackground, 'rgb(253, 246, 227)')
})

await check('browser_capture_to_canvas puts a screenshot frame on the canvas', async () => {
  const out = json(await call(client, 'browser_capture_to_canvas', { name: 'Pricing (live)' }))
  assert.equal(out.created.kind, 'image')
  assert.ok(out.created.height > 1800)
  await win.waitForSelector(`[data-frame-id="${out.created.id}"] img`)
  await framesTab()
  assert.equal(await win.locator('.layer').count(), 2)
})

await check('review_frame returns a reference screenshot without claiming an HTML audit', async () => {
  const reference = json(await call(client, 'get_canvas')).frames.find((f) => f.kind === 'image')
  const result = await call(client, 'review_frame', { id: reference.id })
  assert.equal(result[0].type, 'image')
  const report = JSON.parse(result[1].text)
  assert.equal(report.kind, 'image')
  assert.match(report.note, /HTML layout diagnostics are unavailable/)
  assert.equal(report.horizontalOverflowPx, undefined)
})

await check('Pick element sends the clicked element to the agent context', async () => {
  await call(client, 'browser_navigate', { url: SITE })
  await win.locator('[aria-label="Pick element"]').click()
  await win.waitForTimeout(200)
  const page = (await app.evaluate(({ webContents }) => webContents.getAllWebContents().map((w) => w.getURL()))).find((u) => u.startsWith(SITE))
  assert.ok(page)
  await app.evaluate(async ({ webContents }, site) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith(site))
    await wc.executeJavaScript(`(() => { const h = document.querySelector('h1'); const r = h.getBoundingClientRect(); h.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 2, clientY: r.top + 2 })); h.click() })()`)
  }, SITE)
  await win.waitForSelector('.chip.is-pick')
  const c = json(await call(client, 'get_canvas'))
  assert.equal(c.browserPick.tag, 'h1')
  assert.equal(c.browserPick.text, 'Home')
})

await check('a hostile frame cannot navigate the app window or call MCP', async () => {
  const before = win.url()
  const html = `<div class="p-8">hostile</div><script>try { top.location = 'https://example.com' } catch {} fetch('/mcp', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'delete_frame', arguments: { id: '${frameId}' } } }) }).catch(() => {})</script>`
  const out = json(await call(client, 'create_frame', { name: 'Hostile', html }))
  await win.waitForSelector(`[data-frame-id="${out.created.id}"] iframe[sandbox="allow-scripts"]`)
  await win.waitForTimeout(1500)
  assert.equal(win.url(), before, 'app window stayed on the app')
  assert.ok(json(await call(client, 'get_canvas')).frames.some((f) => f.id === frameId), 'MCP call from the frame was refused')
  await call(client, 'delete_frame', { id: out.created.id })
})

await check('a page cannot forge or crash the pick channel through the console', async () => {
  await app.evaluate(async ({ webContents }, site) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith(site))
    await wc.executeJavaScript(`console.log('__CHALK_PICK__{'); console.log('__chalk_pick_x__' + JSON.stringify({ tag: 'forged' }))`)
  }, SITE)
  await win.waitForTimeout(300)
  const c = json(await call(client, 'get_canvas'))
  assert.equal(c.browserPick.tag, 'h1', 'pick unchanged')
})

await check('one Undo reverts an agent edit and its height change together', async () => {
  const before = json(await call(client, 'get_canvas')).frames.find((f) => f.id === frameId)
  await call(client, 'edit_frame', { id: frameId, edits: [{ find: 'min-h-[1200px]', replace: 'min-h-[1500px]' }] })
  const edited = json(await call(client, 'get_canvas')).frames.find((f) => f.id === frameId)
  assert.equal(edited.height, 1500)
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.focus())
  await app.evaluate(({ Menu, BrowserWindow }) => {
    Menu.getApplicationMenu().items.find((i) => i.label === 'Edit').submenu.items.find((i) => i.label === 'Undo').click(undefined, BrowserWindow.getAllWindows()[0])
  })
  await win.waitForTimeout(300)
  const after = json(await call(client, 'get_canvas')).frames.find((f) => f.id === frameId)
  assert.equal(after.height, before.height)
  assert.match((await call(client, 'get_frame', { id: frameId }))[0].text, /min-h-\[1200px\]/)
})

await check('MCP refuses requests that carry a browser Origin header', async () => {
  const res = await fetch(`http://127.0.0.1:${PORT}/mcp`, { method: 'POST', headers: { origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' })
  assert.equal(res.status, 403)
})

await check('dragging a frame on the canvas moves it and persists the move', async () => {
  await framesTab()
  await win.locator('.layer').first().click()
  await win.waitForTimeout(300)
  const label = win.locator(`[data-frame-id="${frameId}"] .frame-label`)
  const box = await label.boundingBox()
  await win.mouse.move(box.x + 10, box.y + 5)
  await win.mouse.down()
  await win.mouse.move(box.x + 60, box.y + 45, { steps: 6 })
  await win.mouse.up()
  await win.waitForTimeout(150)
  const f = json(await call(client, 'get_canvas')).frames.find((fr) => fr.id === frameId)
  assert.ok(f.x !== 0 || f.y !== 0, `moved to ${f.x},${f.y}`)
})

await check('dropping a PNG on the canvas adds an image frame where it lands', async () => {
  const before = json(await call(client, 'get_canvas')).frames.length
  const [shot] = await call(client, 'screenshot_frame', { id: frameId })
  await win.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], 'reference.png', { type: 'image/png' }))
    const canvas = document.querySelector('.canvas')
    const r = canvas.getBoundingClientRect()
    for (const type of ['dragover', 'drop']) canvas.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 40, clientY: r.top + 40 }))
  }, shot.data)
  await win.waitForFunction((n) => document.querySelectorAll('[data-frame-id]').length > n, before)
  const frames = json(await call(client, 'get_canvas')).frames
  const dropped = frames.find((f) => f.name === 'reference')
  assert.equal(dropped.kind, 'image')
  assert.equal(dropped.width, 1440)
  await call(client, 'delete_frame', { id: dropped.id })
})

await check('recent URLs show on the browser start page and clear', async () => {
  await win.locator('.url-home').click()
  await win.waitForSelector('.recent-row')
  assert.ok((await win.locator('.recent-row').allInnerTexts()).some((t) => t.includes(new URL(SITE).host)))
  await win.locator('.recent-row', { hasText: `${new URL(SITE).host}/pricing` }).click()
  await win.waitForFunction(() => !document.querySelector('.browser-home'))
  await win.locator('.url-home').click()
  await win.locator('.recent-head button').click()
  await win.waitForSelector('.recent-row', { state: 'detached' })
})

await check('hand tool pans the canvas instead of moving frames', async () => {
  await win.keyboard.press('Escape')
  await win.locator('[aria-label="Hand (H)"]').click()
  const before = json(await call(client, 'get_canvas')).frames.find((f) => f.id === frameId)
  const box = await win.locator(`[data-frame-id="${frameId}"]`).boundingBox()
  await win.mouse.move(box.x + 20, box.y + 20)
  await win.mouse.down()
  await win.mouse.move(box.x + 120, box.y + 60, { steps: 5 })
  await win.mouse.up()
  const after = json(await call(client, 'get_canvas')).frames.find((f) => f.id === frameId)
  assert.deepEqual([after.x, after.y], [before.x, before.y], 'frame did not move')
  const moved = await win.locator(`[data-frame-id="${frameId}"]`).boundingBox()
  assert.ok(Math.abs(moved.x - box.x - 100) <= 2, 'view panned')
  await win.locator('[aria-label="Select (V)"]').click()
})

await win.screenshot({ path: join(artifacts, '06-layout.png') })
await client.close()
await win.waitForTimeout(400)
await app.close()

await check('frames persist across a restart', async () => {
  const saved = JSON.parse(readFileSync(join(project, 'chalk.json'), 'utf8'))
  assert.equal(saved.frames.length, 2)
  app = await launch()
  win = await app.firstWindow()
  await win.locator('.left-tabs button', { hasText: 'Frames' }).click()
  await win.waitForSelector('.layer')
  assert.equal(await win.locator('.layer').count(), 2)
  await win.waitForTimeout(1200)
  await win.screenshot({ path: join(artifacts, '05-after-restart.png') })
})

await check('Delete key removes the selected frame', async () => {
  await win.locator('.layer').nth(1).click()
  await win.locator('.canvas').focus().catch(() => {})
  await win.keyboard.press('Backspace')
  await win.waitForTimeout(150)
  assert.equal(await win.locator('.layer').count(), 1)
})

await check('Undo restores a deleted frame and Redo deletes it again', async () => {
  await win.locator('.canvas').click({ position: { x: 5, y: 5 } })
  const clickMenu = (label) => app.evaluate(({ Menu, BrowserWindow }, label) => {
    const item = Menu.getApplicationMenu().items.find((i) => i.label === 'Edit').submenu.items.find((i) => i.label === label)
    item.click(undefined, BrowserWindow.getAllWindows()[0])
  }, label)
  await clickMenu('Undo')
  await win.waitForFunction(() => document.querySelectorAll('.layer').length === 2)
  await clickMenu('Redo')
  await win.waitForFunction(() => document.querySelectorAll('.layer').length === 1)
})

const framesClient = await mcp()
await checkFrames({ app, win, client: framesClient, call, json, check, project, artifacts })
await checkArrangement({ app, win, client: framesClient, call, json, check, project, artifacts })
await checkElements({ app, win, client: framesClient, call, json, check, project, artifacts, fakeLog })
await checkMarquee({ app, win, client: framesClient, call, json, check, project, artifacts, fakeLog })
await checkBrowserDevices({ app, win, client: framesClient, call, json, check, artifacts })
await framesClient.close()
await app.close()
await checkBrowserDevicePreference({ electron, root, project, artifacts, check })
await checkChatHistory({ electron, root, artifacts, check })
site.close()
const failed = results.filter((r) => r[0] === 'FAIL').length
const skipped = results.filter((r) => r[0] === 'SKIP').length
console.log(`\n${results.length - failed - skipped}/${results.length} passed, ${skipped} skipped. Artifacts: ${artifacts}`)
writeFileSync(join(artifacts, 'verification.json'), JSON.stringify({ results, failed, skipped, passed: results.length - failed - skipped }, null, 2))
process.exit(failed ? 1 : 0)
