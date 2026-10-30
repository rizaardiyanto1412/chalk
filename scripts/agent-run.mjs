// Drive the real app: type a prompt in the agent panel, wait for the agent to finish, save renders of every frame.
// Set EASEL_APP_PATH to the packaged binary to drive the built .app instead of the dev build.
// Usage: node scripts/agent-run.mjs <out-dir> "<prompt>" ["<prompt 2>" ...]
import { _electron as electron, chromium } from 'playwright-core'
import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const [outArg, ...prompts] = process.argv.slice(2)
const out = resolve(outArg)
mkdirSync(out, { recursive: true })
const project = process.env.EASEL_PROJECT_DIR || mkdtempSync(join(tmpdir(), 'easel-agent-'))
const PORT = Number(process.env.EASEL_PORT || 7931)
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE'))

const packaged = process.env.EASEL_APP_PATH
let app, win
if (packaged) {
  // Playwright's Electron loader cannot hook a packaged ESM app, so attach over the DevTools protocol instead.
  const child = spawn(packaged, ['--remote-debugging-port=9399'], { env: { ...env, EASEL_PROJECT_DIR: project, EASEL_PORT: String(PORT) }, stdio: 'ignore' })
  let browser
  for (let i = 0; i < 40 && !browser; i++) {
    await new Promise((r) => setTimeout(r, 500))
    browser = await chromium.connectOverCDP('http://127.0.0.1:9399').catch(() => null)
  }
  for (let i = 0; i < 40 && !win; i++) {
    win = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().includes('renderer/index.html'))
    if (!win) await new Promise((r) => setTimeout(r, 250))
  }
  app = { close: async () => { await browser.close().catch(() => {}); child.kill() } }
} else {
  app = await electron.launch({ args: [root], cwd: root, env: { ...env, EASEL_PROJECT_DIR: project, EASEL_PORT: String(PORT) } })
  win = await app.firstWindow()
}
await win.waitForSelector('.chat textarea')
const started = Date.now()

for (const [i, prompt] of prompts.entries()) {
  await win.locator('.chat textarea').fill(prompt)
  await win.keyboard.press('Enter')
  await win.waitForSelector('.send.is-stop', { timeout: 30000 })
  await win.waitForSelector('.send:not(.is-stop)', { timeout: 15 * 60 * 1000 })
  await win.waitForTimeout(1500)
  await win.screenshot({ path: join(out, `ui-${i + 1}.png`) })
}

const transcript = await win.locator('.messages').innerText()
writeFileSync(join(out, 'transcript.txt'), transcript)

const rpc = async (name, args = {}) => {
  const res = await fetch(`http://127.0.0.1:${PORT}/mcp`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  })
  return (await res.json()).result.content
}
const canvas = JSON.parse((await rpc('get_canvas'))[0].text)
for (const f of canvas.frames) {
  const [img] = await rpc('screenshot_frame', { id: f.id })
  const ext = img.mimeType === 'image/jpeg' ? 'jpg' : 'png'
  writeFileSync(join(out, `frame-${f.name.replace(/[^\w-]+/g, '_')}.${ext}`), Buffer.from(img.data, 'base64'))
}
console.log(JSON.stringify({ project, seconds: Math.round((Date.now() - started) / 1000), frames: canvas.frames.map((f) => `${f.name} ${f.width}x${f.height}`) }, null, 2))
console.log(transcript.slice(-1500))
await app.close()
