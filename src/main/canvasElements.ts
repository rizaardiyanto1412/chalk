function canvasElementBridge(): void {
  const pathOf = (element: Element): number[] | null => {
    const path: number[] = []
    let node: Element | null = element
    while (node && node !== document.body) {
      const parent: Element | null = node.parentElement
      if (!parent) return null
      path.unshift(Array.from(parent.children).indexOf(node))
      node = parent
    }
    return node === document.body && path.length ? path : null
  }
  const meaningful = (element: Element): Element => {
    let node = element
    while (node.tagName === 'DIV' && node.children.length === 1 && !Array.from(node.childNodes).some((child) => child.nodeType === Node.TEXT_NODE && child.textContent?.trim())) {
      const child = node.children[0]
      const a = node.getBoundingClientRect()
      const b = child.getBoundingClientRect()
      if (Math.abs(a.x - b.x) > 0.5 || Math.abs(a.y - b.y) > 0.5 || Math.abs(a.width - b.width) > 0.5 || Math.abs(a.height - b.height) > 0.5) break
      node = child
    }
    return node
  }
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== parent || !event.data || typeof event.data !== 'object') return
    const data = event.data
    if (!('requestId' in data) || typeof data.requestId !== 'string' || data.requestId.length > 40 || !('type' in data)) return
    let node: Element | null = null
    if (data.type === 'chalk:hit' && 'x' in data && 'y' in data && typeof data.x === 'number' && typeof data.y === 'number' && Number.isFinite(data.x) && Number.isFinite(data.y)) {
      node = document.elementFromPoint(data.x, data.y)
      if (node) node = meaningful(node)
    } else if (data.type === 'chalk:resolve' && 'path' in data && Array.isArray(data.path) && data.path.length <= 128 && data.path.every((index: unknown) => typeof index === 'number' && Number.isInteger(index) && index >= 0)) {
      node = document.body
      for (const index of data.path) node = node?.children[index] ?? null
    } else return
    const path = node && pathOf(node)
    const box = node?.getBoundingClientRect()
    const hit = node && path && box && !['SCRIPT', 'STYLE', 'LINK', 'META'].includes(node.tagName)
      ? { path, rect: { x: box.x, y: box.y, width: box.width, height: box.height } } : null
    parent.postMessage({ type: 'chalk:element', requestId: data.requestId, hit }, '*')
  })
}

export const CANVAS_ELEMENT_SCRIPT = `<script>(${canvasElementBridge.toString()})()</script>`
