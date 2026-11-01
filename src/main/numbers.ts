import { parse, type DefaultTreeAdapterTypes } from 'parse5'

type Node = DefaultTreeAdapterTypes.ChildNode | DefaultTreeAdapterTypes.Document
type Element = DefaultTreeAdapterTypes.Element

export interface Claim {
  says: string
  expression: string
  shown: string
}

export interface ClaimResult {
  says: string
  expression: string
  shown: string
  computed?: number
  status: 'ok' | 'mismatch' | 'error'
  note?: string
}

const DAY_MS = 86_400_000
const FUNCTIONS: Record<string, (...xs: number[]) => number> = {
  round: (x, d = 0) => Math.round(x * 10 ** d) / 10 ** d,
  floor: (x) => Math.floor(x),
  ceil: (x) => Math.ceil(x),
  abs: (x) => Math.abs(x),
  min: (...xs) => Math.min(...xs),
  max: (...xs) => Math.max(...xs),
  sum: (...xs) => xs.reduce((a, b) => a + b, 0),
  avg: (...xs) => xs.reduce((a, b) => a + b, 0) / xs.length
}

type Token = { kind: 'num'; value: number } | { kind: 'name'; value: string } | { kind: 'op'; value: string }

function tokenize(src: string): Token[] {
  const tokens: Token[] = []
  const re = /\s*(?:(\d{4}-\d{2}-\d{2})|((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)|([a-z]+)|([-+*/(),]))/iy
  const clean = src.replace(/[$€£¥_]/g, '').replace(/[−–]/g, '-').replace(/÷/g, '/').replace(/([\d)])\s*[×x]\s*(?=[\d(.])/g, '$1*')
  let at = 0
  while (at < clean.length) {
    if (/^\s*$/.test(clean.slice(at))) break
    re.lastIndex = at
    const m = re.exec(clean)
    if (!m) throw new Error(`Cannot read "${clean.slice(at).trim()}"`)
    at = re.lastIndex
    if (m[1]) {
      const t = Date.parse(`${m[1]}T00:00:00Z`)
      if (Number.isNaN(t)) throw new Error(`Invalid date ${m[1]}`)
      tokens.push({ kind: 'num', value: t / DAY_MS })
    } else if (m[2]) tokens.push({ kind: 'num', value: Number(m[2].replace(/,/g, '')) })
    else if (m[3]) tokens.push({ kind: 'name', value: m[3].toLowerCase() })
    else tokens.push({ kind: 'op', value: m[4] })
  }
  return tokens
}

/** Evaluate plain arithmetic: + - * / parentheses, round/floor/ceil/abs/min/max/sum/avg, and YYYY-MM-DD dates as day numbers. */
export function evaluate(expression: string): number {
  const tokens = tokenize(expression)
  let i = 0
  const peek = () => tokens[i]
  const isOp = (v: string) => peek()?.kind === 'op' && peek()!.value === v
  const expect = (v: string) => {
    if (!isOp(v)) throw new Error(`Expected "${v}"`)
    i++
  }
  const sum = (): number => {
    let v = product()
    while (isOp('+') || isOp('-')) v = tokens[i++].value === '+' ? v + product() : v - product()
    return v
  }
  const product = (): number => {
    let v = unary()
    while (isOp('*') || isOp('/')) {
      const op = tokens[i++].value
      const r = unary()
      if (op === '/' && r === 0) throw new Error('Division by zero')
      v = op === '*' ? v * r : v / r
    }
    return v
  }
  const unary = (): number => {
    if (isOp('-')) return i++, -unary()
    if (isOp('+')) return i++, unary()
    return atom()
  }
  const atom = (): number => {
    const t = tokens[i++]
    if (!t) throw new Error('Expression ended early')
    if (t.kind === 'num') return t.value
    if (t.kind === 'op' && t.value === '(') {
      const v = sum()
      expect(')')
      return v
    }
    if (t.kind === 'name') {
      const fn = FUNCTIONS[t.value]
      if (!fn) throw new Error(`Unknown function "${t.value}"`)
      expect('(')
      const args = [sum()]
      while (isOp(',')) i++, args.push(sum())
      expect(')')
      return fn(...args)
    }
    throw new Error(`Unexpected "${t.value}"`)
  }
  const v = sum()
  if (i < tokens.length) throw new Error(`Unexpected "${tokens[i].value}"`)
  if (!Number.isFinite(v)) throw new Error('Result is not a finite number')
  return v
}

/** Read the number a design prints, with the precision it is printed at: "$2,388" → 2388 ± 0.5, "18.4%" → 18.4 ± 0.05, "1.2k" → 1200 ± 50. */
export function readShown(shown: string): { value: number; tolerance: number } {
  const m = shown.replace(/[−–]/g, '-').match(/(-?)\s*[$€£¥]?\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?|\.(\d+))\s*([kmb])?\b/i)
  if (!m) throw new Error(`No number in "${shown}"`)
  const decimals = (m[3] ?? m[4] ?? '').length
  const scale = { k: 1e3, m: 1e6, b: 1e9 }[(m[5] ?? '').toLowerCase() as 'k' | 'm' | 'b'] ?? 1
  const value = (m[1] ? -1 : 1) * Number(m[2].replace(/,/g, '')) * scale
  return { value, tolerance: 0.5 * 10 ** -decimals * scale + 1e-9 }
}

export function checkClaim(claim: Claim): ClaimResult {
  try {
    const computed = evaluate(claim.expression)
    const { value, tolerance } = readShown(claim.shown)
    const ok = Math.abs(computed - value) <= tolerance
    return { ...claim, computed: Number(computed.toPrecision(12)), status: ok ? 'ok' : 'mismatch', ...(ok ? {} : { note: `The screen shows ${value}, but the values add up to ${Number(computed.toPrecision(12))}.` }) }
  } catch (e) {
    return { ...claim, status: 'error', note: (e as Error).message }
  }
}

const SKIP = new Set(['script', 'style', 'template', 'svg', 'iconify-icon'])
const INLINE = new Set(['#text', '#comment', 'span', 'b', 'strong', 'em', 'i', 'a', 'small', 'sup', 'sub', 'br', 'abbr', 'code', 'mark', 's', 'u', 'del', 'ins', 'time', 'data', 'label', 'kbd', 'img', 'iconify-icon', 'svg'])
const STATEMENT = new Set(['tr', 'li', 'dt', 'dd', 'option'])

function textOf(node: Node): string {
  if (node.nodeName === '#text') return (node as DefaultTreeAdapterTypes.TextNode).value
  if (SKIP.has(node.nodeName) || !('childNodes' in node)) return ''
  return node.childNodes.map(textOf).join(' ')
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim()

/** Every visible statement that contains a digit: a table row, list item, or element holding only inline text. */
export function numberLines(html: string, limit = 300): string[] {
  const out = new Set<string>()
  const walk = (node: Node) => {
    if (SKIP.has(node.nodeName) || !('childNodes' in node)) return
    const inline = node.childNodes.every((c) => INLINE.has(c.nodeName) && (!('childNodes' in c) || c.childNodes.every((g) => INLINE.has(g.nodeName))))
    if (node.nodeName !== '#document' && (STATEMENT.has(node.nodeName) || inline)) {
      const line = squash(textOf(node))
      if (/\d/.test(line)) out.add(line.length > 240 ? `${line.slice(0, 237)}...` : line)
      return
    }
    for (const c of node.childNodes) {
      if (c.nodeName === '#text') {
        const t = squash((c as DefaultTreeAdapterTypes.TextNode).value)
        if (/\d/.test(t)) out.add(t)
      } else walk(c)
    }
  }
  walk(parse(html))
  return [...out].slice(0, limit)
}
