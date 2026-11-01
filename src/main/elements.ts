import { parse, type DefaultTreeAdapterTypes } from 'parse5'
import type { HtmlFrame, SelectedElement } from '../shared/model'
import type { ElementHit } from '../shared/elementSelection'
import { frameDocument } from './frameHtml'

type Element = DefaultTreeAdapterTypes.Element
const elements = (node: DefaultTreeAdapterTypes.ParentNode): Element[] => node.childNodes.filter((child): child is Element => 'tagName' in child)

function sourceElement(frame: HtmlFrame, path: number[]) {
  const source = frameDocument(frame)
  const doc = parse(source, { sourceCodeLocationInfo: true })
  const html = elements(doc).find((el) => el.tagName === 'html')
  let node = html && elements(html).find((el) => el.tagName === 'body')
  for (const index of path) node = node && elements(node)[index]
  const location = node?.sourceCodeLocation
  const offset = source.indexOf('<body>\n') + '<body>\n'.length
  if (!node || !location || location.startOffset < offset || location.endOffset > offset + frame.html.length) return null
  const start = location.startOffset - offset
  const end = location.endOffset - offset
  return { node, start, end }
}

function textContent(node: DefaultTreeAdapterTypes.Node): string {
  if (node.nodeName === '#text' && 'value' in node) return node.value
  if ('tagName' in node && ['script', 'style'].includes(node.tagName)) return ''
  return 'childNodes' in node ? node.childNodes.map(textContent).join('') : ''
}

export function selectedElement(frame: HtmlFrame, hit: ElementHit): SelectedElement | null {
  const found = sourceElement(frame, hit.path)
  if (!found || ['script', 'style', 'link', 'meta'].includes(found.node.tagName)) return null
  return {
    frameId: frame.id, frameName: frame.name, path: hit.path, tag: found.node.tagName,
    text: textContent(found.node).replace(/\s+/g, ' ').trim().slice(0, 200),
    rect: hit.rect, outerHTML: frame.html.slice(found.start, found.end).slice(0, 2000)
  }
}

export function removeElement(frame: HtmlFrame, path: number[]): string | null {
  const found = sourceElement(frame, path)
  return found ? frame.html.slice(0, found.start) + frame.html.slice(found.end) : null
}
