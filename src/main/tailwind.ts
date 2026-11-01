/// <reference types="electron-vite/node" />
import { createHash } from 'node:crypto'
import type { Worker } from 'node:worker_threads'
import createWorker from './tailwindWorker?nodeWorker'

const cache = new Map<string, Promise<string | null>>()
const CACHE_LIMIT = 300
const pending = new Map<number, (css: string | null) => void>()
let worker: Worker | undefined
let nextId = 0

/** One worker thread compiles frame CSS, so the main process stays free for input, IPC, and the agent. */
function compiler(): Worker {
  if (worker) return worker
  const started = createWorker({})
  started.unref()
  started.on('message', ({ id, css }: { id: number; css: string | null }) => {
    pending.get(id)?.(css)
    pending.delete(id)
  })
  const fail = () => {
    if (worker === started) worker = undefined
    for (const resolve of pending.values()) resolve(null)
    pending.clear()
  }
  started.on('error', fail)
  started.on('exit', fail)
  worker = started
  return started
}

/**
 * A frame's Tailwind CSS compiled ahead of time, so canvas iframes skip parsing and running the compiler on the
 * window's one renderer thread. Null means the page should load the runtime build instead.
 */
export function frameCss(html: string): Promise<string | null> {
  const key = createHash('sha1').update(html).digest('base64')
  let css = cache.get(key)
  if (!css) {
    const id = nextId++
    css = new Promise<string | null>((resolve) => {
      pending.set(id, resolve)
      compiler().postMessage({ id, html })
    })
    cache.set(key, css)
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
  }
  return css
}
