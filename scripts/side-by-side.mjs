// Put the design (left) and the build (right) side by side: node scripts/side-by-side.mjs <parity dir> <out.png> [height]
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'
const [dir, outFile, h = '1000'] = process.argv.slice(2)
const ref = PNG.sync.read(readFileSync(join(dir, 'ref.png')))
const impl = PNG.sync.read(readFileSync(join(dir, 'impl.png')))
const height = Math.min(Number(h), ref.height, impl.height)
const out = new PNG({ width: ref.width + impl.width + 20, height })
out.data.fill(255)
PNG.bitblt(ref, out, 0, 0, ref.width, height, 0, 0)
PNG.bitblt(impl, out, 0, 0, impl.width, height, ref.width + 20, 0)
writeFileSync(outFile, PNG.sync.write(out))
