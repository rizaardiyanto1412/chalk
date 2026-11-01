import { parse, type DefaultTreeAdapterTypes } from 'parse5'
import type { HtmlFrame, SelectedElement } from '../shared/model'
import type { ElementHit } from '../shared/elementSelection'
import { frameDocument } from './frameHtml'

type Element = DefaultTreeAdapterTypes.Element
const elements = (node: DefaultTreeAdapterTypes.ParentNode): Element[] => node.childNodes.filter((child): child is Element => 'tagName' in child)

function sourceElements(frame: HtmlFrame, paths: number[][]) {
  const source = frameDocument(frame)
  const doc = parse(source, { sourceCodeLocationInfo: true })
  const html = elements(doc).find((el) => el.tagName === 'html')
  const body = html && elements(html).find((el) => el.tagName === 'body')
  const offset = source.indexOf('<body>\n') + '<body>\n'.length
  return paths.map((path) => {
    let node = body
    for (const index of path) node = node && elements(node)[index]
    const location = node?.sourceCodeLocation
    if (!node || !location || location.startOffset < offset || location.endOffset > offset + frame.html.length) return null
    return { node, start: location.startOffset - offset, end: location.endOffset - offset }
  })
}

function textContent(node: DefaultTreeAdapterTypes.Node): string {
  if (node.nodeName === '#text' && 'value' in node) return node.value
  if ('tagName' in node && ['script', 'style'].includes(node.tagName)) return ''
  return 'childNodes' in node ? node.childNodes.map(textContent).join('') : ''
}

export function selectedElements(frame: HtmlFrame, hits: ElementHit[]): SelectedElement[] {
  const found = sourceElements(frame, hits.map((hit) => hit.path))
  return hits.flatMap((hit, i) => {
    const source = found[i]
    if (!source || ['script', 'style', 'link', 'meta'].includes(source.node.tagName)) return []
    return [{
      frameId: frame.id, frameName: frame.name, path: hit.path, tag: source.node.tagName,
      text: textContent(source.node).replace(/\s+/g, ' ').trim().slice(0, 200),
      rect: hit.rect, outerHTML: frame.html.slice(source.start, source.end).slice(0, 2000)
    }]
  })
}

export function removeElements(frame: HtmlFrame, paths: number[][]): string {
  const ranges = sourceElements(frame, paths).flatMap((found) => found ? [{ start: found.start, end: found.end }] : [])
    .sort((a, b) => a.start - b.start || b.end - a.end)
  const removals: typeof ranges = []
  for (const range of ranges) {
    const previous = removals.at(-1)
    if (previous && range.start < previous.end) previous.end = Math.max(previous.end, range.end)
    else removals.push(range)
  }
  return removals.reverse().reduce((html, { start, end }) => html.slice(0, start) + html.slice(end), frame.html)
}
