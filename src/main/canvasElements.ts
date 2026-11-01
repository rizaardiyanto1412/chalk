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
  const ignored = (node: Element) => ['SCRIPT', 'STYLE', 'LINK', 'META'].includes(node.tagName)
  const hitOf = (node: Element) => {
    const path = pathOf(node)
    const box = node.getBoundingClientRect()
    return path && !ignored(node) ? { path, rect: { x: box.x, y: box.y, width: box.width, height: box.height } } : null
  }
  const isPath = (value: unknown): value is number[] => Array.isArray(value) && value.length > 0 && value.length <= 128 && value.every((index: unknown) => typeof index === 'number' && Number.isInteger(index) && index >= 0 && index <= 100000)
  const isRect = (value: unknown): value is { x: number; y: number; width: number; height: number } => {
    if (!value || typeof value !== 'object') return false
    return 'x' in value && typeof value.x === 'number' && Number.isFinite(value.x) && Math.abs(value.x) <= 1000000 &&
      'y' in value && typeof value.y === 'number' && Number.isFinite(value.y) && Math.abs(value.y) <= 1000000 &&
      'width' in value && typeof value.width === 'number' && Number.isFinite(value.width) && value.width >= 0 && value.width <= 1000000 &&
      'height' in value && typeof value.height === 'number' && Number.isFinite(value.height) && value.height >= 0 && value.height <= 1000000
  }
  window.addEventListener('message', (event: MessageEvent<unknown>) => {
    if (event.source !== parent || !event.data || typeof event.data !== 'object') return
    const data = event.data
    if (!('requestId' in data) || typeof data.requestId !== 'string' || data.requestId.length > 40 || !('type' in data)) return
    const hits: NonNullable<ReturnType<typeof hitOf>>[] = []
    if (data.type === 'chalk:hit' && 'x' in data && 'y' in data && typeof data.x === 'number' && typeof data.y === 'number' && Number.isFinite(data.x) && Number.isFinite(data.y)) {
      const node = document.elementFromPoint(data.x, data.y)
      const hit = node && hitOf(meaningful(node))
      if (hit) hits.push(hit)
    } else if (data.type === 'chalk:resolve' && 'paths' in data && Array.isArray(data.paths) && data.paths.length <= 10000 && data.paths.every(isPath)) {
      for (const path of data.paths) {
        let node: Element | null = document.body
        for (const index of path) node = node?.children[index] ?? null
        const hit = node && hitOf(node)
        if (hit) hits.push(hit)
      }
    } else if (data.type === 'chalk:marquee' && 'rect' in data && isRect(data.rect)) {
      const rect = data.rect
      const walk = (element: Element) => {
        if (ignored(element) || hits.length >= 10000) return
        const node = meaningful(element)
        const box = node.getBoundingClientRect()
        if (node !== document.body && (box.width <= 0 || box.height <= 0 || box.x >= rect.x + rect.width || box.right <= rect.x || box.y >= rect.y + rect.height || box.bottom <= rect.y)) return
        if (node === document.body || box.x <= rect.x && box.y <= rect.y && box.right >= rect.x + rect.width && box.bottom >= rect.y + rect.height) {
          for (const child of node.children) walk(child)
        } else {
          const hit = hitOf(node)
          if (hit) hits.push(hit)
        }
      }
      walk(document.body)
    } else return
    parent.postMessage({ type: 'chalk:element', requestId: data.requestId, hits }, '*')
  })
}

export const CANVAS_ELEMENT_SCRIPT = `<script>(${canvasElementBridge.toString()})()</script>`
