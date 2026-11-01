import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { parseFragment, type DefaultTreeAdapterTypes } from 'parse5'

type Node = DefaultTreeAdapterTypes.ChildNode | DefaultTreeAdapterTypes.DocumentFragment

const resolveSheet = createRequire(import.meta.url).resolve
const sheets: Record<string, string> = {}
const sheet = (name: string) => (sheets[name] ??= readFileSync(resolveSheet(`tailwindcss/${name}.css`), 'utf8'))
/** The same stylesheet ids the Tailwind browser build accepts; anything else falls back to the runtime build. */
const STYLESHEETS: Record<string, string> = {
  tailwindcss: 'index',
  'tailwindcss/preflight': 'preflight', 'tailwindcss/preflight.css': 'preflight', './preflight.css': 'preflight',
  'tailwindcss/theme': 'theme', 'tailwindcss/theme.css': 'theme', './theme.css': 'theme',
  'tailwindcss/utilities': 'utilities', 'tailwindcss/utilities.css': 'utilities', './utilities.css': 'utilities'
}

let tailwind: Promise<typeof import('tailwindcss')> | undefined

/**
 * Compile a frame's Tailwind CSS exactly as the browser build would at load: the frame's `text/tailwindcss` blocks,
 * with `@import "tailwindcss"` unless they import it themselves, built for every class token in the markup.
 * Returns null when the frame needs the runtime build: scripts or event handlers can add classes later.
 */
export async function compileFrame(html: string): Promise<string | null> {
  const tree = parseFragment(html)
  const classes = new Set<string>()
  let input = ''
  let dynamic = false
  const walk = (node: Node) => {
    if (!('tagName' in node) && node.nodeName !== '#document-fragment') return
    if ('tagName' in node) {
      if (node.tagName === 'script') dynamic = true
      for (const attr of node.attrs) {
        if (attr.name === 'class') for (const token of attr.value.split(/[\t\n\f\r ]+/)) if (token) classes.add(token)
        if (attr.name.startsWith('on')) dynamic = true
      }
      if (node.tagName === 'style' && node.attrs.some((a) => a.name === 'type' && a.value === 'text/tailwindcss')) {
        input += node.childNodes.map((c) => ('value' in c ? c.value : '')).join('') + '\n'
      }
    }
    for (const child of node.childNodes) walk(child)
  }
  walk(tree)
  if (dynamic) return null
  if (!input.includes('@import')) input = `@import "tailwindcss";${input}`
  const { compile } = await (tailwind ??= import('tailwindcss'))
  const compiler = await compile(input, {
    base: '/',
    loadStylesheet: async (id, base) => {
      const name = STYLESHEETS[id]
      if (!name) throw new Error(`Unsupported stylesheet ${id}`)
      return { path: `virtual:tailwindcss/${name}.css`, base, content: sheet(name) }
    },
    loadModule: async () => {
      throw new Error('Plugins need the runtime build.')
    }
  })
  return compiler.build([...classes])
}
