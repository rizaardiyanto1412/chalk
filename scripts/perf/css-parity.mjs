// Prove precompiled frame CSS renders the same pixels as the Tailwind browser runtime, on every real design.
// Usage: node scripts/perf/css-parity.mjs <project dir> [out dir]
import { _electron as electron } from 'playwright-core'
import { PNG } from 'pngjs'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const project = resolve(process.argv[2])
const out = resolve(process.argv[3] ?? join(root, '.audit/perf/css-parity'))
mkdirSync(out, { recursive: true })
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE'))
const app = await electron.launch({ args: [root, `--user-data-dir=${join(out, 'profile')}`], cwd: root, env: { ...env, CHALK_PROJECT_DIR: project, CHALK_PORT: '8795' } })
const win = await app.firstWindow()
await win.waitForSelector('.chat textarea')
const frames = JSON.parse(readFileSync(join(project, 'chalk.json'), 'utf8')).frames.filter((f) => f.kind === 'html')

const capture = (source) => app.evaluate(async ({ BrowserWindow }, { source }) => {
  const w = new BrowserWindow({ show: false, width: source.width, height: source.height, useContentSize: true, webPreferences: { offscreen: true, backgroundThrottling: false } })
  try {
    if (source.url) await w.loadURL(source.url)
    else await w.loadURL(`data:text/html;base64,${Buffer.from(source.html).toString('base64')}`, { baseURLForDataURL: source.base })
    await w.webContents.executeJavaScript(`document.fonts.ready.then(() => new Promise((r) => setTimeout(r, 1500)))`)
    const image = await w.webContents.capturePage({ x: 0, y: 0, width: source.width, height: source.height })
    return image.toPNG().toString('base64')
  } finally {
    w.destroy()
  }
}, { source })

const report = []
for (const f of frames) {
  const height = Math.min(f.height, 3000)
  const precompiled = await (await fetch(`http://127.0.0.1:8795/frame/${f.id}`)).text()
  const usedPrecompiled = !precompiled.includes('/vendor/tailwind.js')
  const head = precompiled.indexOf('</head>')
  const cssStart = precompiled.lastIndexOf('<style>', head)
  const runtime = usedPrecompiled ? `${precompiled.slice(0, cssStart)}<script src="http://127.0.0.1:8795/vendor/tailwind.js"></script>\n${precompiled.slice(head)}` : precompiled
  if (usedPrecompiled && !(runtime.includes('/vendor/tailwind.js') && precompiled.includes('@layer theme') && !runtime.includes('@layer theme'))) throw new Error(`runtime variant of ${f.id} still carries the precompiled CSS`)
  const a = PNG.sync.read(Buffer.from(await capture({ url: `http://127.0.0.1:8795/frame/${f.id}`, width: f.width, height }), 'base64'))
  const b = PNG.sync.read(Buffer.from(await capture({ html: runtime, base: 'http://127.0.0.1:8795/', width: f.width, height }), 'base64'))
  let differing = 0
  for (let i = 0; i < Math.min(a.data.length, b.data.length); i += 4) {
    if (Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]) > 24) differing++
  }
  const share = differing / (a.width * a.height)
  writeFileSync(join(out, `${f.id}-precompiled.png`), PNG.sync.write(a))
  writeFileSync(join(out, `${f.id}-runtime.png`), PNG.sync.write(b))
  report.push({ id: f.id, name: f.name, usedPrecompiled, precompiledBytes: precompiled.length, runtimeBytes: runtime.length, size: `${a.width}x${a.height}`, differingPixels: differing, share: +share.toFixed(5) })
  console.log(JSON.stringify(report.at(-1)))
}
writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2))
await app.close()
const worst = Math.max(...report.map((r) => r.share))
console.log(`worst share ${worst}; precompiled ${report.filter((r) => r.usedPrecompiled).length}/${report.length}`)
process.exit(worst < 0.001 ? 0 : 1)
