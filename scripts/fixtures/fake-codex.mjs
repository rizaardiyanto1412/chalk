#!/usr/bin/env node
import { appendFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'

const args = process.argv.slice(2)
const dir = args[args.indexOf('-C') + 1]
const prompt = args.at(-1)
if (process.env.CHALK_FAKE_CODEX_LOG) appendFileSync(process.env.CHALK_FAKE_CODEX_LOG, JSON.stringify({ args, cwd: process.cwd() }) + '\n')
if (prompt.includes('[codex-fail]')) {
  process.stderr.write('not signed in\n')
  process.exit(3)
}
if (!prompt.includes('[codex-no-file]')) {
  const [width, height] = prompt.includes('portrait') && prompt.includes('Shape: portrait') ? [64, 96] : [96, 64]
  const png = new PNG({ width, height })
  for (let i = 0; i < png.data.length; i += 4) png.data.set([40, 140, 110, 255], i)
  writeFileSync(join(dir, 'out.png'), PNG.sync.write(png))
}
console.log(join(dir, 'out.png'))
