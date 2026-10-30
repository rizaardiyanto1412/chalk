import { useEffect, useRef, useState } from 'react'
import { api, type BrowserState } from './api'
import { Icon } from './icons'

export function BrowserPane({ state, visible }: { state: BrowserState; visible: boolean }) {
  const slot = useRef<HTMLDivElement>(null)
  const [input, setInput] = useState(state.url)
  const [editing, setEditing] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const hasPage = !!state.url && !state.url.startsWith('about:')

  useEffect(() => {
    if (!editing) setInput(hasPage ? state.url : '')
  }, [state.url, editing, hasPage])

  useEffect(() => {
    void api.browser('visible', visible && hasPage)
    if (!visible) return
    const el = slot.current!
    const report = () => {
      const r = el.getBoundingClientRect()
      void api.browser('bounds', { x: r.left, y: r.top, width: r.width, height: r.height })
    }
    report()
    const ro = new ResizeObserver(report)
    ro.observe(el)
    window.addEventListener('resize', report)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', report)
      void api.browser('visible', false)
    }
  }, [visible, hasPage])

  return (
    <div className="browser" style={{ display: visible ? 'flex' : 'none' }}>
      <div className="browser-bar">
        <button disabled={!state.canGoBack} onClick={() => api.browser('back')} title="Back"><Icon name="left" /></button>
        <button disabled={!state.canGoForward} onClick={() => api.browser('forward')} title="Forward"><Icon name="right" /></button>
        <button disabled={!hasPage} onClick={() => api.browser('reload')} title="Reload"><Icon name="reload" size={15} /></button>
        <form
          className="url"
          onSubmit={(e) => {
            e.preventDefault()
            if (input.trim()) void api.browser('navigate', input.trim())
            ;(document.activeElement as HTMLElement).blur()
          }}
        >
          <Icon name="globe" size={14} />
          <input
            value={input}
            placeholder="Enter a URL, like localhost:3000 or stripe.com"
            onFocus={(e) => {
              setEditing(true)
              e.target.select()
            }}
            onBlur={() => setEditing(false)}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
          />
          {state.loading && <span className="spinner" />}
        </form>
        <button className={`labeled ${state.picking ? 'is-on' : ''}`} disabled={!hasPage} onClick={() => api.browser('pick', !state.picking)} title="Pick an element for the agent to redesign">
          <Icon name="pointer" size={14} /> {state.picking ? 'Picking… (Esc)' : 'Pick element'}
        </button>
        <button
          className="labeled"
          disabled={!hasPage || capturing}
          title="Put a full-page screenshot on the canvas"
          onClick={async () => {
            setCapturing(true)
            await api.browser('capture').finally(() => setCapturing(false))
          }}
        >
          <Icon name="camera" size={14} /> {capturing ? 'Capturing…' : 'Capture'}
        </button>
      </div>
      <div ref={slot} className="browser-slot">
        {!hasPage && (
          <div className="browser-empty">
            <Icon name="globe" size={28} />
            <h3>Built-in browser</h3>
            <p>Open your app or any site. The agent can navigate it, read its menus, take screenshots, and redesign what you pick.</p>
            <div className="chips">
              {['localhost:3000', 'linear.app', 'stripe.com/pricing'].map((u) => (
                <button key={u} onClick={() => api.browser('navigate', u)}>{u}</button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
