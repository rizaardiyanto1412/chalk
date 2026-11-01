import { parentPort } from 'node:worker_threads'
import { compileFrame } from './tailwindCompile'

parentPort?.on('message', async ({ id, html }: { id: number; html: string }) => {
  let css: string | null = null
  try {
    css = await compileFrame(html)
  } catch {
    css = null
  }
  parentPort?.postMessage({ id, css })
})
