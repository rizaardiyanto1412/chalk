// Measure what a user waits on in the real app: cold start, project switch, canvas pan and zoom, and agent tool latency.
// Usage: node scripts/perf/bench.mjs --roots <rootA>,<rootB> --runs 5 --out results.json
// Roots alternate run by run so warmup and machine drift favor neither build.
import { _electron as electron } from 'playwright-core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { cpSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const here = dirname(fileURLToPath(import.meta.url))
const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const roots = arg('roots', resolve(here, '../..')).split(',').map((r) => resolve(r))
const runs = Number(arg('runs', 5))
const out = resolve(arg('out', 'perf-results.json'))
const sources = arg('fixtures', resolve(here, '../../.audit/bench')).split(',')
const pause = (ms) => new Promise((r) => setTimeout(r, ms))
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE'))

/** A busy project built from real agent designs: every HTML and image frame the benchmark rounds produced. */
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'chalk-perf-'))
  const project = join(dir, 'project')
  const empty = join(dir, 'empty')
  mkdirSync(join(project, 'assets'), { recursive: true })
  mkdirSync(join(empty, 'assets'), { recursive: true })
  const frames = []
  for (const source of sources) for (const run of ['chalk-r4-runs', 'chalk']) {
    const base = join(source, run)
    if (!existsSync(base)) continue
    for (const name of readdirSync(base).filter((n) => n.endsWith('-project')).sort()) {
      const doc = JSON.parse(readFileSync(join(base, name, 'chalk.json'), 'utf8'))
      for (const f of doc.frames) {
        if (f.kind === 'image') cpSync(join(base, name, 'assets', f.asset), join(project, 'assets', f.asset))
        frames.push({ ...f, id: `${frames.length}`.padStart(8, 'f') })
      }
    }
  }
  let x = 0
  for (const f of frames) {
    f.x = x
    f.y = 0
    x += f.width + 80
  }
  writeFileSync(join(project, 'chalk.json'), JSON.stringify({ version: 1, frames }))
  return { dir, project, empty, frames: frames.length, html: frames.filter((f) => f.kind === 'html').length, htmls: frames.filter((f) => f.kind === 'html').map((f) => ({ html: f.html, width: f.width })), sample: frames.find((f) => f.kind === 'html' && f.width === 1440 && f.height < 2000) }
}

/** Every canvas iframe has fired load and the renderer has painted twice since. */
async function canvasReady(win, count, since) {
  for (;;) {
    const frames = win.frames().filter((f) => /\/frame\/[\w-]+\?canvas=1/.test(f.url()))
    if (frames.length >= count) {
      await Promise.all(frames.map((f) => f.waitForLoadState('load')))
      await win.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
      return performance.now() - since
    }
    await pause(10)
  }
}

/** Frame intervals while the user scrolls or zooms the canvas, from requestAnimationFrame in the renderer. */
async function gesture(win, zoom) {
  const box = await win.locator('.canvas').boundingBox()
  await win.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await win.evaluate(() => {
    window.__frames = []
    let last = performance.now()
    const tick = (t) => {
      window.__frames.push(t - last)
      last = t
      if (window.__recording) requestAnimationFrame(tick)
    }
    window.__recording = true
    requestAnimationFrame(tick)
  })
  if (zoom) await win.keyboard.down('Meta')
  for (let i = 0; i < 90; i++) {
    await win.mouse.wheel(zoom ? 0 : 40, zoom ? (i < 45 ? -12 : 12) : 25)
    await pause(8)
  }
  if (zoom) await win.keyboard.up('Meta')
  const frames = await win.evaluate(() => {
    window.__recording = false
    return window.__frames.slice(1)
  })
  const sorted = [...frames].sort((a, b) => a - b)
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]
  return { frames: frames.length, p50: at(0.5), p95: at(0.95), max: sorted.at(-1), long: frames.filter((f) => f > 33.4).length }
}

async function timed(fn) {
  const start = performance.now()
  const value = await fn()
  return { ms: performance.now() - start, value }
}

async function once(root, fx, port, measureAll) {
  const result = { root }
  const t0 = performance.now()
  const app = await electron.launch({ args: [root, `--user-data-dir=${join(fx.dir, `profile-${port}`)}`], cwd: root, env: { ...env, CHALK_PROJECT_DIR: fx.project, CHALK_PORT: String(port) } })
  try {
    const win = await app.firstWindow()
    await win.setViewportSize({ width: 1480, height: 920 }).catch(() => {})
    await win.waitForSelector('.chat textarea')
    result.uiReadyMs = performance.now() - t0
    result.canvasReadyMs = await canvasReady(win, fx.html, t0)
    await pause(500)

    const init = await win.evaluate(() => window.chalk.invoke('init'))
    assert.equal(init.doc.frames.length, fx.frames, 'fixture loaded every frame')
    await app.evaluate(({ dialog }, dir) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] }) }, fx.empty)
    await win.evaluate(() => window.chalk.invoke('project', 'open'))
    await win.waitForFunction(() => document.querySelectorAll('[data-frame-id]').length === 0)
    const switchStart = performance.now()
    await win.evaluate((dir) => window.chalk.invoke('project', 'switch', dir), fx.project)
    result.switchBackMs = await canvasReady(win, fx.html, switchStart)
    await pause(500)

    result.pan = await gesture(win, false)
    await pause(300)
    result.zoom = await gesture(win, true)

    const client = new Client({ name: 'perf', version: '1' })
    await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${init.port}/mcp`)))
    const call = async (name, args) => {
      const r = await client.callTool({ name, arguments: args })
      assert.ok(!r.isError, `${name} failed: ${JSON.stringify(r.content).slice(0, 300)}`)
      return r
    }
    const create = await timed(() => call('create_frame', { name: 'Perf probe', html: fx.sample.html, width: 1440, x: 0, y: 6000 }))
    const id = JSON.parse(create.value.content[0].text).created.id
    result.createFrameMs = create.ms
    result.reviewFrameMs = (await timed(() => call('review_frame', { id }))).ms
    result.editFrameMs = (await timed(() => call('edit_frame', { id, edits: [{ find: fx.sample.html.slice(0, 40), replace: fx.sample.html.slice(0, 40) + ' ' }] }))).ms
    await call('delete_frame', { id })
    if (measureAll) {
      result.heights = []
      for (const html of fx.htmls) {
        const r = await client.callTool({ name: 'create_frame', arguments: { name: 'Height probe', html: html.html, width: html.width, x: 0, y: 9000 } })
        if (r.isError) {
          result.heights.push(r.content[0].text)
          continue
        }
        const made = JSON.parse(r.content[0].text).created
        result.heights.push(made.height)
        await call('delete_frame', { id: made.id })
      }
    }
    await client.close()

    const metrics = await app.evaluate(({ app }) => app.getAppMetrics())
    result.memoryMb = Math.round(metrics.reduce((sum, m) => sum + m.memory.workingSetSize, 0) / 1024)
    result.processes = metrics.length
  } finally {
    await app.close().catch(() => {})
  }
  return result
}

const fx = fixture()
console.error(`fixture ${fx.project}: ${fx.frames} frames (${fx.html} HTML)`)
const results = []
for (let i = 0; i < runs; i++) {
  for (const [j, root] of roots.entries()) {
    const r = await once(root, fx, 8700 + i * 10 + j, i === 0)
    results.push({ run: i, ...r })
    console.error(JSON.stringify({ run: i, root: root.split('/').slice(-2).join('/'), ui: Math.round(r.uiReadyMs), canvas: Math.round(r.canvasReadyMs), switch: Math.round(r.switchBackMs), panP95: +r.pan.p95.toFixed(1), zoomP95: +r.zoom.p95.toFixed(1), create: Math.round(r.createFrameMs), review: Math.round(r.reviewFrameMs), edit: Math.round(r.editFrameMs), mem: r.memoryMb }))
  }
}

const metric = (r, k) => k.split('.').reduce((o, p) => o[p], r)
const keys = ['uiReadyMs', 'canvasReadyMs', 'switchBackMs', 'pan.p95', 'pan.long', 'zoom.p95', 'zoom.long', 'createFrameMs', 'reviewFrameMs', 'editFrameMs', 'memoryMb']
const summary = {}
for (const root of roots) {
  summary[root] = {}
  for (const k of keys) {
    const v = results.filter((r) => r.root === root).map((r) => metric(r, k)).sort((a, b) => a - b)
    summary[root][k] = { median: v[Math.floor(v.length / 2)], min: v[0], max: v.at(-1) }
  }
}
writeFileSync(out, JSON.stringify({ fixture: { frames: fx.frames, html: fx.html }, runs, summary, results }, null, 2))
console.log(JSON.stringify(summary, null, 2))
