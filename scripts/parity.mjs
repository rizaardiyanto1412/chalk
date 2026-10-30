// Compare an Easel frame with an app built from it, in the same headless Chrome.
// Usage: node scripts/parity.mjs --port 7971 --frame <id> --dist <built app dir> --out <dir> [--route /]
import { chromium } from 'playwright-core'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

const { values: a } = parseArgs({ options: { port: { type: 'string' }, frame: { type: 'string' }, dist: { type: 'string' }, out: { type: 'string' }, route: { type: 'string', default: '/' } } })
const out = resolve(a.out)
mkdirSync(out, { recursive: true })

async function mcp(name, args) {
  const res = await fetch(`http://127.0.0.1:${a.port}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  })
  const body = await res.json()
  if (body.result?.isError) throw new Error(body.result.content[0].text)
  return body.result.content
}

const canvas = JSON.parse((await mcp('get_canvas', {}))[0].text)
const frame = canvas.frames.find((f) => f.id === a.frame)
if (!frame) throw new Error(`no frame ${a.frame}`)
const refHtml = (await mcp('get_frame', { id: frame.id, standalone: true }))[0].text

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.json': 'application/json' }
const dist = resolve(a.dist)
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname)
  if (path === '/__ref') {
    res.writeHead(200, { 'content-type': 'text/html' })
    return res.end(refHtml)
  }
  let file = join(dist, path)
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html')
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise((r) => server.listen(0, '127.0.0.1', r))
const base = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
async function shoot(url, file) {
  const page = await browser.newPage({ viewport: { width: frame.width, height: 900 }, deviceScaleFactor: 1 })
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.evaluate(async () => {
    await document.fonts.ready
    await Promise.race([customElements.whenDefined('iconify-icon').catch(() => {}), new Promise((r) => setTimeout(r, 1500))])
    await new Promise((r) => setTimeout(r, 800))
  })
  await page.screenshot({ path: file, fullPage: true })
  await page.close()
  return PNG.sync.read(readFileSync(file))
}

const ref = await shoot(`${base}/__ref`, join(out, 'ref.png'))
const impl = await shoot(`${base}${a.route}`, join(out, 'impl.png'))
await browser.close()
server.close()

const width = Math.max(ref.width, impl.width)
const height = Math.max(ref.height, impl.height)
const pad = (img) => {
  const p = new PNG({ width, height })
  p.data.fill(255)
  PNG.bitblt(img, p, 0, 0, img.width, img.height, 0, 0)
  return p
}
const diff = new PNG({ width, height })
const mismatched = pixelmatch(pad(ref).data, pad(impl).data, diff.data, width, height, { threshold: 0.1 })
writeFileSync(join(out, 'diff.png'), PNG.sync.write(diff))

// Rows with any difference show where the layouts drift apart.
const rows = []
for (let y = 0; y < height; y++) {
  let n = 0
  for (let x = 0; x < width; x++) if (diff.data[(y * width + x) * 4] === 255 && diff.data[(y * width + x) * 4 + 1] === 0) n++
  if (n) rows.push(y)
}
const firstDiffRow = rows[0] ?? null
const result = {
  frame: frame.name,
  ref: `${ref.width}x${ref.height}`,
  impl: `${impl.width}x${impl.height}`,
  heightDelta: impl.height - ref.height,
  mismatchPct: +((mismatched / (width * height)) * 100).toFixed(3),
  firstDiffRow
}
writeFileSync(join(out, 'result.json'), JSON.stringify(result, null, 2))
console.log(JSON.stringify(result))
