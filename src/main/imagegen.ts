import { spawn } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { nativeImage } from 'electron'
import { findCli, userPath } from './agentCli'

export type ImageShape = 'landscape' | 'portrait' | 'square'

const TIMEOUT_MS = 180_000
const MAX_RUNNING = 2
let running = 0
const waiting: (() => void)[] = []

/** Codex is the image generator: Chalk's own agent asks, the user's local Codex CLI draws with its own login. */
export function codexPath(): string | null {
  return process.env.CHALK_CODEX_PATH || findCli('codex')
}

const brief = (prompt: string, shape: ImageShape) => `Generate exactly one image with your image generation tool, then copy it to ./out.png in the current directory.
Do not edit any other file. Do not add text, captions, watermarks, logos, or UI to the image unless the description asks for them.
Shape: ${shape === 'landscape' ? 'landscape, about 3:2' : shape === 'portrait' ? 'portrait, about 2:3' : 'square, 1:1'}.
Description: ${prompt}
Reply only with the saved file path.`

async function slot(): Promise<() => void> {
  if (running >= MAX_RUNNING) await new Promise<void>((resolve) => waiting.push(resolve))
  running++
  return () => {
    running--
    waiting.shift()?.()
  }
}

/** Run one Codex image generation in a throwaway folder and return the image as PNG bytes. */
export async function generateImage(prompt: string, shape: ImageShape): Promise<{ png: Buffer; width: number; height: number; seconds: number }> {
  const codex = codexPath()
  if (!codex) throw new Error('Codex CLI was not found. Install it from https://developers.openai.com/codex and sign in with `codex login`, or use search_photos.')
  const release = await slot()
  const dir = mkdtempSync(join(tmpdir(), 'chalk-imagegen-'))
  const started = Date.now()
  try {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(codex, ['exec', '--skip-git-repo-check', '--ephemeral', '--sandbox', 'workspace-write', '-C', dir, brief(prompt, shape)], {
        cwd: dir,
        stdio: ['ignore', 'ignore', 'pipe'],
        env: { ...process.env, PATH: userPath() }
      })
      let stderr = ''
      child.stderr.on('data', (d) => { stderr = (stderr + d).slice(-2000) })
      const timer = setTimeout(() => child.kill('SIGTERM'), TIMEOUT_MS)
      child.on('error', (e) => { clearTimeout(timer); reject(e) })
      child.on('exit', (code, signal) => {
        clearTimeout(timer)
        if (code === 0) resolve()
        else reject(new Error(signal ? `Codex image generation timed out after ${TIMEOUT_MS / 1000} s.` : `Codex exited with code ${code}: ${stderr.trim().split('\n').slice(-3).join(' ').slice(0, 400)}`))
      })
    })
    let bytes: Buffer
    try {
      bytes = readFileSync(join(dir, 'out.png'))
    } catch {
      throw new Error('Codex finished without saving an image. Check that `codex` is signed in and image generation is enabled (`codex features list`).')
    }
    const image = nativeImage.createFromBuffer(bytes)
    if (image.isEmpty()) throw new Error('Codex saved a file that is not a readable image.')
    const { width, height } = image.getSize()
    return { png: image.toPNG(), width, height, seconds: Math.round((Date.now() - started) / 1000) }
  } finally {
    release()
    rmSync(dir, { recursive: true, force: true })
  }
}
