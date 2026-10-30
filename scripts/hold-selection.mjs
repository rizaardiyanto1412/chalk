// Launch Chalk on a project, select one frame in the UI, and keep the app open until killed.
// Usage: CHALK_PROJECT_DIR=... CHALK_PORT=7801 node scripts/hold-selection.mjs "<frame name>"
import { _electron as electron } from 'playwright-core'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE'))
const app = await electron.launch({ args: [root], cwd: root, env })
const win = await app.firstWindow()
await win.locator('.left-tabs button', { hasText: 'Frames' }).click()
await win.locator('.layer', { hasText: process.argv[2] }).click()
console.log('selected', process.argv[2])
process.on('SIGTERM', async () => { await app.close(); process.exit(0) })
await new Promise(() => {})
