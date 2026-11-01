interface TomlTable {
  kind: 'table'
  path: string[]
  array: boolean
  start: number
  end: number
}

interface TomlValue {
  kind: 'value'
  path: string[]
  table: TomlTable | null
  start: number
  valueStart: number
  valueEnd: number
}

type TomlItem = TomlTable | TomlValue

export class TomlProblem extends Error {}

const BARE_KEY = /[A-Za-z0-9_-]+/y

/** Checks structure (strings, brackets, keys, headers), not the grammar of each value. */
function scanToml(text: string): TomlItem[] {
  const items: TomlItem[] = []
  let table: TomlTable | null = null
  let i = 0
  const fail = (problem: string): never => {
    throw new TomlProblem(`it is not valid TOML (${problem} on line ${text.slice(0, i).split('\n').length})`)
  }
  const spaces = () => {
    while (text[i] === ' ' || text[i] === '\t') i++
  }
  const lineEnd = () => {
    spaces()
    if (text[i] === '#') while (i < text.length && text[i] !== '\n') i++
    if (text[i] === '\r') i++
    if (i < text.length && text[i] !== '\n') fail('unexpected text')
    i++
  }
  const string = (): string => {
    const quote = text[i]
    const triple = text.startsWith(quote.repeat(3), i)
    const start = i
    i += triple ? 3 : 1
    for (;;) {
      if (i >= text.length || (!triple && text[i] === '\n')) fail('unclosed string')
      if (quote === '"' && text[i] === '\\') i += 2
      else if (triple ? text.startsWith(quote.repeat(3), i) : text[i] === quote) break
      else i++
    }
    i += triple ? 3 : 1
    for (let extra = 0; triple && extra < 2 && text[i] === quote; extra++) i++
    return text.slice(start, i)
  }
  const key = (): string[] => {
    const parts: string[] = []
    for (;;) {
      spaces()
      if (text[i] === '"' || text[i] === "'") {
        parts.push(tomlString(string()) ?? fail('unsupported key'))
      } else {
        BARE_KEY.lastIndex = i
        const bare = BARE_KEY.exec(text)?.[0] ?? fail('invalid key')
        parts.push(bare)
        i += bare.length
      }
      spaces()
      if (text[i] !== '.') return parts
      i++
    }
  }
  const value = () => {
    let depth = 0
    for (;;) {
      const c = text[i]
      if (c === undefined) return depth ? fail('unclosed bracket') : undefined
      if (c === '"' || c === "'") string()
      else if (c === '[' || c === '{') {
        depth++
        i++
      } else if (c === ']' || c === '}') {
        if (!depth) fail('unbalanced bracket')
        depth--
        i++
      } else if (c === '#' || c === '\n' || c === '\r') {
        if (!depth) return
        if (c === '#') while (i < text.length && text[i] !== '\n') i++
        else i++
      } else i++
    }
  }
  while (i < text.length) {
    spaces()
    if (i >= text.length || text[i] === '#' || text[i] === '\n' || text[i] === '\r') {
      lineEnd()
      continue
    }
    const start = i
    if (text[i] === '[') {
      const array = text[i + 1] === '['
      i += array ? 2 : 1
      const path = key()
      if (!text.startsWith(array ? ']]' : ']', i)) fail('invalid table header')
      i += array ? 2 : 1
      table = { kind: 'table', path, array, start, end: i }
      items.push(table)
    } else {
      const path = key()
      if (text[i] !== '=') fail('expected "="')
      i++
      spaces()
      const valueStart = i
      value()
      let valueEnd = i
      while (valueEnd > valueStart && (text[valueEnd - 1] === ' ' || text[valueEnd - 1] === '\t')) valueEnd--
      if (valueEnd === valueStart) fail('missing value')
      items.push({ kind: 'value', path: [...(table?.path ?? []), ...path], table, start, valueStart, valueEnd })
    }
    lineEnd()
  }
  return items
}

function tomlString(raw: string): string | null {
  if (/^'[^'\n]*'$/.test(raw)) return raw.slice(1, -1)
  if (!/^"(?:[^"\\\n]|\\.)*"$/.test(raw)) return null
  try {
    return JSON.parse(raw) as string
  } catch {
    return null
  }
}

const inChalk = (path: string[]) => path[0] === 'mcp_servers' && path[1] === 'chalk'

function chalkTable(text: string) {
  const items = scanToml(text)
  const headers = items.filter((item): item is TomlTable => item.kind === 'table' && !item.array && item.path.length === 2 && inChalk(item.path))
  if (headers.length > 1) throw new TomlProblem('it defines [mcp_servers.chalk] more than once')
  const header = headers[0]
  const editable = items.every((item) => !inChalk(item.path) || (item.kind === 'table' ? !item.array && !!header : !!item.table && inChalk(item.table.path)))
  if (!editable) throw new TomlProblem('it defines chalk in a layout that Chalk does not edit')
  const own = (name: string) => items.find((item): item is TomlValue => !!header && item.kind === 'value' && item.table === header && item.path.length === 3 && item.path[2] === name)
  return {
    items,
    header,
    url: own('url'),
    enabled: own('enabled'),
    stdio: items.some((item) => inChalk(item.path) && ['command', 'args', 'env', 'cwd'].includes(item.path[2]))
  }
}

export function readCodexChalk(text: string): { url: string | null; exists: boolean } {
  const chalk = chalkTable(text)
  const exists = !!chalk.header
  if (!chalk.url || chalk.stdio || (chalk.enabled && text.slice(chalk.enabled.valueStart, chalk.enabled.valueEnd) === 'false')) return { url: null, exists }
  const url = tomlString(text.slice(chalk.url.valueStart, chalk.url.valueEnd))
  if (url === null) throw new TomlProblem('its chalk URL is not a plain string')
  return { url, exists }
}

/** Set `[mcp_servers.chalk] url` and keep every other byte, comment, and table as it was. */
export function withCodexChalk(text: string, url: string): string {
  const result = editCodexChalk(text, url)
  if (readCodexChalk(result).url !== url) throw new TomlProblem('Chalk could not verify the edited file')
  return result
}

function editCodexChalk(text: string, url: string): string {
  const chalk = chalkTable(text)
  const newline = text.includes('\r\n') ? '\r\n' : '\n'
  const value = JSON.stringify(url)
  if (!chalk.header) {
    if (chalk.items.some((item) => item.path.length === 1 && item.path[0] === 'mcp_servers' && (item.kind === 'value' || item.array))) throw new TomlProblem('its mcp_servers table uses a layout that Chalk does not edit')
    const gap = !text ? '' : text.endsWith('\n') ? newline : newline + newline
    return `${text}${gap}[mcp_servers.chalk]${newline}url = ${value}${newline}`
  }
  if (chalk.stdio) throw new TomlProblem('its chalk entry runs a command instead of a URL')
  const edits: [number, number, string][] = []
  if (chalk.url) edits.push([chalk.url.valueStart, chalk.url.valueEnd, value])
  else {
    const eol = text.indexOf('\n', chalk.header.end)
    edits.push(eol < 0 ? [text.length, text.length, `${newline}url = ${value}${newline}`] : [eol + 1, eol + 1, `url = ${value}${newline}`])
  }
  if (chalk.enabled) edits.push([chalk.enabled.valueStart, chalk.enabled.valueEnd, 'true'])
  return edits.sort((a, b) => b[0] - a[0]).reduce((out, [start, end, insert]) => out.slice(0, start) + insert + out.slice(end), text)
}
