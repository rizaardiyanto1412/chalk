// Side-by-side image of two PNGs, scaled to the same width: node scripts/pair.mjs <left.png> <right.png> <out.png> [maxHeight]
import { readFileSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
const [a, b, out, maxH = '2400'] = process.argv.slice(2)
const L = PNG.sync.read(readFileSync(a))
const R = PNG.sync.read(readFileSync(b))
const h = Math.min(Number(maxH), Math.max(L.height, R.height))
const img = new PNG({ width: L.width + R.width + 40, height: h })
img.data.fill(255)
PNG.bitblt(L, img, 0, 0, L.width, Math.min(h, L.height), 0, 0)
PNG.bitblt(R, img, 0, 0, R.width, Math.min(h, R.height), L.width + 40, 0)
writeFileSync(out, PNG.sync.write(img))
