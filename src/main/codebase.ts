import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, isAbsolute, join, relative, sep } from 'node:path'
import { z } from 'zod'

/** Folders that are generated, vendored, or private. Never listed, searched, or read. */
const SKIP_DIRS = new Set(['.git', 'node_modules', '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', '.vercel', '.output', 'dist', 'build', 'out', 'coverage', 'vendor', '.venv', 'venv', '__pycache__', 'target', 'Pods', 'DerivedData', '.chalk', '.idea', '.vscode'])
/** Files that commonly hold credentials. */
const SECRET = /^(\.env(\..*)?|.*\.(pem|key|p12|pfx|keystore|jks|der|crt|cer)|id_(rsa|dsa|ecdsa|ed25519).*|\.npmrc|\.pypirc|\.netrc|\.git-credentials|credentials(\..*)?|secrets?(\..*)?|.*\.secret(s)?(\..*)?|service-account.*\.json)$/i
const BINARY = /\.(png|jpe?g|gif|webp|avif|ico|icns|bmp|tiff?|mp4|mov|webm|mp3|wav|ogg|woff2?|ttf|otf|eot|zip|gz|tgz|bz2|xz|7z|rar|pdf|psd|sketch|fig|exe|dll|so|dylib|bin|wasm|class|jar|lock|map|sqlite|db)$/i
const MAX_FILES = 20_000
const MAX_FILE_BYTES = 512 * 1024

const blockedPart = (part: string) => SKIP_DIRS.has(part)
export const isBlocked = (relPath: string): boolean => {
  const parts = relPath.split(/[\\/]/).filter(Boolean)
  return parts.some(blockedPart) || SECRET.test(parts.at(-1) ?? '')
}

/** Read-only view of one source folder the user chose for a Chalk project. */
export class Codebase {
  readonly root: string

  constructor(dir: string) {
    this.root = realpathSync(dir)
    if (!statSync(this.root).isDirectory()) throw new Error('The codebase must be a folder.')
  }

  get name(): string {
    return basename(this.root)
  }

  /** Resolve a user or agent path inside the root, refusing escapes through `..` or symbolic links. */
  private resolve(path = ''): { abs: string; rel: string } {
    const candidate = isAbsolute(path) ? path : join(this.root, path)
    if (!existsSync(candidate)) throw new Error(`No such path in the codebase: ${path || '.'}`)
    const abs = realpathSync(candidate)
    const rel = relative(this.root, abs)
    if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('That path is outside the codebase folder.')
    if (rel && isBlocked(rel)) throw new Error(`${rel} is excluded (secrets, dependencies, or build output).`)
    return { abs, rel }
  }

  /** Every readable text file under a folder, relative to the root. Git repositories honour .gitignore. */
  files(under = ''): string[] {
    const { abs, rel } = this.resolve(under)
    let listed: string[] | null = null
    try {
      const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z', '--', '.'], { cwd: abs, encoding: 'utf8', timeout: 10_000, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] })
      listed = out.split('\0').filter(Boolean).map((f) => (rel ? join(rel, f) : f))
    } catch {
      listed = null
    }
    if (!listed) {
      listed = []
      const walk = (dir: string) => {
        for (const entry of readdirSync(join(this.root, dir), { withFileTypes: true })) {
          if (listed!.length >= MAX_FILES) return
          const path = dir ? join(dir, entry.name) : entry.name
          if (entry.isDirectory() && !blockedPart(entry.name)) walk(path)
          else if (entry.isFile()) listed!.push(path)
        }
      }
      walk(rel)
    }
    return listed.filter((f) => !isBlocked(f) && !BINARY.test(f)).slice(0, MAX_FILES)
  }

  /** A compact tree: folders with file counts down to `depth`, then files at the requested level. */
  list(path = '', depth = 2): { root: string; path: string; entries: string[]; truncated: boolean } {
    const { rel } = this.resolve(path)
    const files = this.files(rel)
    const base = rel ? rel.split(sep).length : 0
    const seen = new Map<string, number>()
    for (const f of files) {
      const parts = f.split(sep)
      const shown = parts.slice(0, Math.min(parts.length, base + depth))
      const key = shown.join('/') + (shown.length < parts.length ? '/' : '')
      seen.set(key, (seen.get(key) ?? 0) + 1)
    }
    const entries = [...seen].map(([k, n]) => (k.endsWith('/') ? `${k} (${n} files)` : k)).sort()
    return { root: this.name, path: rel || '.', entries: entries.slice(0, 400), truncated: entries.length > 400 }
  }

  /** Lines matching a regular expression, case-insensitive, optionally limited to paths containing `glob`-like text. */
  search(pattern: string, path = '', include?: string): { matches: string[]; truncated: boolean } {
    let re: RegExp
    try {
      re = new RegExp(pattern, 'i')
    } catch {
      throw new Error('The pattern is not a valid regular expression.')
    }
    const filter = include ? globToRegExp(include) : null
    const matches: string[] = []
    for (const f of this.files(path)) {
      if (filter && !filter.test(f)) continue
      const text = this.text(f)
      if (text === null) continue
      const lines = text.split('\n')
      for (let i = 0; i < lines.length; i++) {
        if (!re.test(lines[i]!)) continue
        matches.push(`${f}:${i + 1}: ${lines[i]!.trim().slice(0, 240)}`)
        if (matches.length >= 120) return { matches, truncated: true }
      }
    }
    return { matches, truncated: false }
  }

  /** Numbered lines of one file. */
  read(path: string, offset = 1, limit = 400): { path: string; lines: string; totalLines: number; next: number | null } {
    const { rel } = this.resolve(path)
    if (BINARY.test(rel)) throw new Error(`${rel} is not a text file.`)
    const text = this.text(rel)
    if (text === null) throw new Error(`${rel} is too large or not text.`)
    const all = text.split('\n')
    const start = Math.max(1, offset)
    const slice = all.slice(start - 1, start - 1 + limit)
    const end = start - 1 + slice.length
    return { path: rel, lines: slice.map((l, i) => `${start + i}\t${l.slice(0, 500)}`).join('\n'), totalLines: all.length, next: end < all.length ? end + 1 : null }
  }

  /** File contents, resolved again so a symbolic link inside the folder can never read a file outside it. */
  private text(rel: string): string | null {
    try {
      const { abs } = this.resolve(rel)
      if (statSync(abs).size > MAX_FILE_BYTES) return null
      const bytes = readFileSync(abs)
      if (bytes.includes(0)) return null
      return bytes.toString('utf8')
    } catch {
      return null
    }
  }
}

function globToRegExp(glob: string): RegExp {
  const body = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '.').replace(/\u0000/g, '.*')
  return new RegExp(`(^|/)${body}$`, 'i')
}

const settingsSchema = z.object({ dir: z.string().min(1) })
const settingsFile = (project: string) => join(project, '.chalk', 'codebase.json')

/** The codebase folder saved for a Chalk project, or null when none is set or it no longer exists. */
export function savedCodebase(project: string): Codebase | null {
  try {
    return new Codebase(settingsSchema.parse(JSON.parse(readFileSync(settingsFile(project), 'utf8'))).dir)
  } catch {
    return null
  }
}

export function saveCodebase(project: string, dir: string | null): void {
  mkdirSync(join(project, '.chalk'), { recursive: true })
  writeFileSync(settingsFile(project), JSON.stringify(dir ? { dir } : {}, null, 2))
}

const BRIEF_START = '<!-- chalk:product-brief -->'
const BRIEF_END = '<!-- /chalk:product-brief -->'

export const hasProductBrief = (project: string): boolean => {
  try {
    return readFileSync(join(project, 'DESIGN.md'), 'utf8').includes(BRIEF_START)
  } catch {
    return false
  }
}

/** Write or replace the product brief section in the project's DESIGN.md, keeping everything the user wrote. */
export function saveProductBrief(project: string, source: string, markdown: string): void {
  const file = join(project, 'DESIGN.md')
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const section = `${BRIEF_START}\n## Product brief (from the ${source} codebase)\n\n${markdown.trim()}\n${BRIEF_END}`
  const start = existing.indexOf(BRIEF_START)
  const end = existing.indexOf(BRIEF_END)
  const next = start >= 0 && end > start ? existing.slice(0, start) + section + existing.slice(end + BRIEF_END.length) : `${section}\n\n${existing}`
  writeFileSync(file, next.trimEnd() + '\n')
}
