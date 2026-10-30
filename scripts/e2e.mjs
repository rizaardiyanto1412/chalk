import { _electron as electron } from 'playwright-core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const artifacts = join(root, 'e2e-artifacts')
mkdirSync(artifacts, { recursive: true })
const project = mkdtempSync(join(tmpdir(), 'easel-e2e-'))
const PORT = 7911
const results = []
const check = async (name, fn) => {
  const t = Date.now()
  try {
    await fn()
    results.push(['PASS', name, Date.now() - t])
    console.log(`PASS  ${name}`)
  } catch (err) {
    results.push(['FAIL', name, Date.now() - t])
    console.log(`FAIL  ${name}\n      ${err.stack?.split('\n').slice(0, 3).join('\n      ')}`)
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
await new Promise((r) => site.listen(7912, '127.0.0.1', r))
const SITE = 'http://127.0.0.1:7912'

const launch = () =>
  electron.launch({ args: [root], cwd: root, env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE')), EASEL_PROJECT_DIR: project, EASEL_PORT: String(PORT), ELECTRON_RENDERER_URL: '' } })

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
let win = await app.firstWindow()
await win.waitForSelector('.topbar')
const client = await mcp()
let frameId

await check('UI boots with canvas empty state, frames panel, agent panel', async () => {
  await win.waitForSelector('.empty h2')
  assert.equal(await win.locator('.layer').count(), 0)
  assert.ok(await win.locator('.chat textarea').isVisible())
  await win.screenshot({ path: join(artifacts, '01-empty.png') })
})

await check('MCP lists all 18 tools', async () => {
  const { tools } = await client.listTools()
  assert.equal(tools.length, 18, tools.map((t) => t.name).join(','))
})

await check('create_frame adds a frame, fits height to content, and shows it on the canvas', async () => {
  const html = `<div class="min-h-[1200px] bg-white p-16"><h1 class="text-5xl font-semibold tracking-tight text-zinc-900">Hello Easel</h1><p id="sub" class="mt-4 text-zinc-500">Subtitle</p><iconify-icon icon="lucide:sparkles" width="24"></iconify-icon></div>`
  const out = json(await call(client, 'create_frame', { name: 'Hello', html }))
  frameId = out.created.id
  assert.equal(out.created.width, 1440)
  assert.equal(out.created.height, 1200, 'height fitted from min-h-[1200px] proves Tailwind ran')
  await win.waitForSelector(`[data-frame-id="${frameId}"] iframe`)
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

await check('browser_navigate loads a page and switches the UI to the Browser tab', async () => {
  const s = json(await call(client, 'browser_navigate', { url: SITE }))
  assert.equal(s.title, 'Home')
  await win.waitForSelector('.segmented button.is-on:has-text("Browser")')
})

await check('the native browser view is visible and covers exactly the browser area', async () => {
  await win.waitForTimeout(300)
  const slot = await win.locator('.browser-slot').boundingBox()
  const view = await app.evaluate(({ BrowserWindow }) => {
    const v = BrowserWindow.getAllWindows()[0].contentView.children[0]
    return { visible: v.getVisible(), bounds: v.getBounds(), url: v.webContents.getURL() }
  })
  assert.ok(view.visible)
  assert.equal(view.url, `${SITE}/`)
  for (const k of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(view.bounds[k] - slot[k]) <= 1, `${k}: view ${view.bounds[k]} vs slot ${slot[k]}`)
  await win.locator('.segmented button:has-text("Canvas")').click()
  await win.waitForTimeout(200)
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children[0].getVisible()), false, 'hidden on the Canvas tab')
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
  assert.equal(await win.locator('.layer').count(), 2)
})

await check('Pick element sends the clicked element to the agent context', async () => {
  await win.locator('.segmented button:has-text("Browser")').click()
  await call(client, 'browser_navigate', { url: SITE })
  await win.locator('button:has-text("Pick element")').click()
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
  await win.locator('.segmented button:has-text("Canvas")').click()
  await win.waitForSelector(`[data-frame-id="${out.created.id}"] iframe[sandbox="allow-scripts"]`)
  await win.waitForTimeout(1500)
  assert.equal(win.url(), before, 'app window stayed on the app')
  assert.ok(json(await call(client, 'get_canvas')).frames.some((f) => f.id === frameId), 'MCP call from the frame was refused')
  await call(client, 'delete_frame', { id: out.created.id })
})

await check('a page cannot forge or crash the pick channel through the console', async () => {
  await app.evaluate(async ({ webContents }, site) => {
    const wc = webContents.getAllWebContents().find((w) => w.getURL().startsWith(site))
    await wc.executeJavaScript(`console.log('__EASEL_PICK__{'); console.log('__easel_pick_x__' + JSON.stringify({ tag: 'forged' }))`)
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
  await win.locator('.segmented button:has-text("Canvas")').click()
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

await client.close()
await win.waitForTimeout(400)
await app.close()

await check('frames persist across a restart', async () => {
  const saved = JSON.parse(readFileSync(join(project, 'easel.json'), 'utf8'))
  assert.equal(saved.frames.length, 2)
  app = await launch()
  win = await app.firstWindow()
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

await app.close()
site.close()
const failed = results.filter((r) => r[0] === 'FAIL').length
console.log(`\n${results.length - failed}/${results.length} passed. Artifacts: ${artifacts}`)
process.exit(failed ? 1 : 0)
