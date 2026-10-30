import { clipboard, ClipboardItem } from 'electron'
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { basename, extname, join, resolve } from 'node:path'
import { z } from 'zod'
import { parseFragment, serialize, type DefaultTreeAdapterTypes } from 'parse5'
import valueParser from 'postcss-value-parser'
import { EXPORT_FORMATS, type Frame } from '../shared/model'
import { frameDocument, TAILWIND_CDN } from './frameHtml'
import { createPreview } from './previews'
import { renderExport } from './render'

export const exportFormatSchema = z.enum(EXPORT_FORMATS)

export interface ExportSnapshot {
  frame: Frame
  projectDir: string
  origin: string
  html: string
}

export interface ExportFile {
  bytes: Buffer
  ext: 'png' | 'jpg' | 'html' | 'pdf'
  width: number
  height: number
}

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.css': 'text/css', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf'
}

export function snapshotExport(frame: Frame, projectDir: string, origin: string): ExportSnapshot {
  const size = z.number().int().min(1).max(12000)
  if (!size.safeParse(frame.width).success || !size.safeParse(frame.height).success) {
    throw new Error('Export dimensions must be whole pixels between 1 and 12000.')
  }
  const captured = { ...frame }
  const project = realpathSync(projectDir)
  const assets = join(project, 'assets')
  const embedded = new Map<string, string>()
  const reading = new Set<string>()
  const embed = (raw: string): string => {
    const name = decodeURIComponent(raw.split(/[?#]/, 1)[0])
    if (!name || name === '.' || name === '..' || basename(name) !== name || /[\\/\0]/.test(name)) {
      throw new Error('Unsafe asset path. Exports only read files directly inside project assets.')
    }
    const cached = embedded.get(name)
    if (cached) return cached
    if (reading.has(name)) throw new Error(`Circular asset reference: ${name}`)
    const folder = lstatSync(assets)
    if (folder.isSymbolicLink() || !folder.isDirectory() || realpathSync(assets) !== assets) {
      throw new Error('Assets must be a folder inside the project, not a symbolic link.')
    }
    const file = join(assets, name)
    const mime = MIME[extname(name).toLowerCase()]
    if (!mime) throw new Error(`Unsupported local asset type: ${name}`)
    let fd: number
    try {
      fd = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    } catch {
      throw new Error(`Asset ${name} is missing or unsafe; add the asset again.`)
    }
    reading.add(name)
    try {
      if (!fstatSync(fd).isFile()) throw new Error(`Asset ${name} must be a regular file.`)
      const bytes = readFileSync(fd)
      const data = mime === 'text/css' ? Buffer.from(embedCss(bytes.toString('utf8'))) : bytes
      const uri = `data:${mime};base64,${data.toString('base64')}`
      embedded.set(name, uri)
      return uri
    } finally {
      reading.delete(name)
      closeSync(fd)
    }
  }
  const localReference = (value: string, relative = false, link = false): string => {
    const decoded = value.replace(/&amp;/g, '&')
    let path = decoded
    if (/^(?:https?:)?\/\//i.test(path)) {
      let url: URL
      try { url = new URL(path, origin) } catch { return value }
      const server = new URL(origin)
      const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      if (url.origin !== origin && !(loopback && url.port === server.port && url.protocol === server.protocol)) return value
      path = url.pathname + url.search
    } else if (/^(?:data:|https?:|#)/i.test(path)) return value
    const asset = path.match(/^(?:\/|\.\/)?assets\/(.*)$/)
    if (asset) {
      if (link && !MIME[extname(asset[1].split(/[?#]/, 1)[0]).toLowerCase()]) return value
      return embed(asset[1])
    }
    if (link) return value
    if (relative && !/^[a-z][a-z\d+.-]*:/i.test(path)) return embed(path.replace(/^\.\//, ''))
    if (path.startsWith('/') || path.startsWith('../') || path.startsWith('file:')) {
      throw new Error(`Unsupported local asset reference: ${value}. Use project assets.`)
    }
    return value
  }
  const embedCss = (css: string): string => {
    const parsed = valueParser(css)
    parsed.walk((node, index, nodes) => {
      if (node.type === 'function' && node.value.toLowerCase() === 'url') {
        const target = node.nodes.filter((child) => child.type !== 'space' && child.type !== 'comment')
        if (target.length === 1 && (target[0].type === 'string' || target[0].type === 'word')) {
          target[0].value = localReference(target[0].value, true)
        }
        return false
      }
      if (node.type === 'word' && node.value.toLowerCase() === '@import') {
        const next = nodes.slice(index + 1).find((child) => child.type !== 'space' && child.type !== 'comment')
        if (next?.type === 'string') next.value = localReference(next.value, true)
      }
    })
    return parsed.toString()
  }
  const embedSrcset = (value: string): string => {
    const candidates: string[] = []
    let rest = value.trim()
    while (rest) {
      rest = rest.replace(/^[\s,]+/, '')
      if (!rest) break
      const url = rest.match(/^\S+/)?.[0] ?? ''
      rest = rest.slice(url.length)
      if (url.endsWith(',')) {
        candidates.push(localReference(url.replace(/,+$/, '')))
        continue
      }
      const comma = rest.indexOf(',')
      const descriptor = comma < 0 ? rest : rest.slice(0, comma)
      candidates.push(localReference(url) + descriptor)
      rest = comma < 0 ? '' : rest.slice(comma + 1)
    }
    return candidates.join(', ')
  }
  const embedHtml = (html: string): string => {
    const tree = parseFragment(html)
    const visit = (node: DefaultTreeAdapterTypes.Node): void => {
      if ('tagName' in node) {
        for (const attr of node.attrs) {
          if (attr.name === 'style') attr.value = embedCss(attr.value)
          else if (attr.name === 'srcset') attr.value = embedSrcset(attr.value)
          else if (['src', 'poster', 'href'].includes(attr.name)) {
            attr.value = localReference(attr.value, false, attr.name === 'href' && node.tagName !== 'link')
          }
        }
        if (node.tagName === 'style') {
          for (const child of node.childNodes) if ('value' in child) child.value = embedCss(child.value)
        }
        if ('content' in node) visit(node.content)
      }
      if ('childNodes' in node) node.childNodes.forEach(visit)
    }
    visit(tree)
    return serialize(tree)
  }
  const html = captured.kind === 'image'
    ? `<img alt="" src="${embed(captured.asset)}" style="display:block;width:${captured.width}px;height:${captured.height}px;object-fit:cover;object-position:top">`
    : embedHtml(captured.html)
  return { frame: captured, projectDir: project, origin, html: frameDocument({ name: captured.name, html }) }
}

export async function buildExport(snapshot: ExportSnapshot, format: z.infer<typeof exportFormatSchema>): Promise<ExportFile> {
  const { width, height } = snapshot.frame
  if (format === 'html') return { bytes: Buffer.from(snapshot.html), ext: 'html', width, height }
  const preview = createPreview(snapshot.html.replace(TAILWIND_CDN, `${snapshot.origin}/vendor/tailwind.js`), snapshot.origin, 'document')
  try {
    return { bytes: await renderExport(preview.url, width, height, format), ext: format === 'jpeg' ? 'jpg' : format, width, height }
  } finally {
    preview.dispose()
  }
}

export function exportFileName(frame: Frame, ext: ExportFile['ext']): string {
  const safe = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'frame'
  return `${safe(frame.name)}-${safe(frame.id)}.${ext}`
}

export function writeExport(path: string, bytes: Buffer): void {
  const temp = `${path}.${randomUUID()}.tmp`
  try {
    writeFileSync(temp, bytes, { flag: 'wx' })
    renameSync(temp, path)
  } finally {
    try { unlinkSync(temp) } catch (err) {
      if (!(err instanceof Error && 'code' in err && err.code === 'ENOENT')) throw err
    }
  }
}

export function writeProjectExport(snapshot: ExportSnapshot, file: ExportFile): string {
  const folder = join(snapshot.projectDir, 'exports')
  try { mkdirSync(folder) } catch (err) {
    if (!(err instanceof Error && 'code' in err && err.code === 'EEXIST')) throw err
  }
  const stat = lstatSync(folder)
  if (stat.isSymbolicLink() || !stat.isDirectory() || realpathSync(folder) !== folder) {
    throw new Error('exports is not a folder inside the project. Symbolic links are not allowed.')
  }
  const path = resolve(folder, exportFileName(snapshot.frame, file.ext))
  if (resolve(folder, basename(path)) !== path) throw new Error('Unsafe export file name.')
  writeExport(path, file.bytes)
  return path
}

export async function copyFrameImage(snapshot: ExportSnapshot) {
  const file = await buildExport(snapshot, 'png')
  await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(file.bytes)], { type: 'image/png' }) })])
  return { status: 'copied' as const, width: file.width, height: file.height }
}
