import type { PresenceVisual } from '../shared/presence'

export function createBrowserPresence(css: string, cursorPath: string) {
  const host = document.createElement('div')
  host.setAttribute('data-chalk-presence', '')
  host.setAttribute('aria-hidden', 'true')
  for (const [name, value] of Object.entries({ all: 'initial', position: 'fixed', inset: '0', width: '100%', height: '100%', margin: '0', padding: '0', border: '0', 'pointer-events': 'none', 'z-index': '2147483647', contain: 'strict' })) host.style.setProperty(name, value, 'important')
  const shadow = host.attachShadow({ mode: 'closed' })
  const style = document.createElement('style')
  style.textContent = css
  const overlay = document.createElement('div')
  overlay.className = 'chalk-presence'
  const cursor = document.createElement('div')
  cursor.className = 'presence-cursor'
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 22 24')
  const path = document.createElementNS(svg.namespaceURI, 'path')
  path.setAttribute('d', cursorPath)
  svg.append(path)
  const tag = document.createElement('span')
  tag.className = 'presence-tag'
  tag.textContent = 'Chalk'
  cursor.append(svg, tag)
  overlay.append(cursor)
  shadow.append(style, overlay)
  document.documentElement.append(host)
  let lastId = -1
  let lastPoint = { x: 28, y: 40 }
  let sweep: HTMLDivElement | null = null
  let ripple: HTMLSpanElement | null = null
  let tint: HTMLDivElement | null = null

  return {
    update(visual: PresenceVisual) {
      if (visual.phase === 'idle' || visual.target.kind !== 'browser') {
        overlay.style.display = 'none'
        return
      }
      overlay.style.display = ''
      overlay.classList.toggle('is-fading', visual.phase === 'fading')
      if (visual.operation === 'running' && !tint) {
        tint = document.createElement('div')
        tint.className = 'presence-tint'
        overlay.prepend(tint)
      } else if (visual.operation === 'settled') {
        tint?.remove()
        tint = null
      }
      if (lastId === visual.id) return
      lastId = visual.id
      sweep?.remove()
      ripple?.remove()
      if (visual.target.action === 'scan') {
        sweep = document.createElement('div')
        sweep.className = 'presence-scan'
        const band = document.createElement('div')
        band.className = 'presence-band'
        sweep.append(band)
        overlay.prepend(sweep)
      }
      const point = visual.target.point ?? lastPoint
      lastPoint = { x: Math.max(3, Math.min(innerWidth - 3, point.x)), y: Math.max(3, Math.min(innerHeight - 3, point.y)) }
      tag.style.left = lastPoint.x > innerWidth - 70 ? '-50px' : '14px'
      tag.style.top = lastPoint.y > innerHeight - 44 ? '-20px' : '23px'
      cursor.style.transform = `translate(${lastPoint.x}px, ${lastPoint.y}px)`
      if (visual.target.action === 'click' || visual.target.action === 'type') {
        ripple = document.createElement('span')
        ripple.className = 'presence-ripple'
        cursor.append(ripple)
      }
      if (visual.target.point && !matchMedia('(prefers-reduced-motion: reduce)').matches) return new Promise<void>((resolve) => setTimeout(resolve, 420))
    },
    hide(hidden: boolean) {
      host.style.setProperty('visibility', hidden ? 'hidden' : 'visible', 'important')
    }
  }
}
