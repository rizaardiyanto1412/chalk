import { useEffect, useRef, useState } from 'react'
import { api, type BrowserState } from './api'
import { Icon, type IconName } from './icons'

interface Props {
  state: BrowserState
  recent: string[]
  onClose: () => void
}

export function BrowserPane({ state, recent, onClose }: Props) {
  const slot = useRef<HTMLDivElement>(null)
  const url = useRef<HTMLInputElement>(null)
  const [input, setInput] = useState(state.url)
  const [editing, setEditing] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [home, setHome] = useState(false)
  const hasPage = !!state.url && !state.url.startsWith('about:')
  const showPage = hasPage && !home

  useEffect(() => {
    if (!editing) setInput(showPage ? state.url : '')
  }, [state.url, editing, showPage])

  useEffect(() => {
    if (state.loading) setHome(false)
  }, [state.loading])

  useEffect(() => {
    void api.browser('visible', showPage)
    if (!showPage) return
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
  }, [showPage])

  const go = (u: string) => {
    setHome(false)
    void api.browser('navigate', u)
  }

  const capture = async () => {
    setCapturing(true)
    await api.browser('capture').finally(() => setCapturing(false))
  }

  return (
    <section className="browser-panel">
      <div className="browser-bar">
        <button
          className={state.picking ? 'is-on' : ''}
          disabled={!showPage}
          onClick={() => api.browser('pick', !state.picking)}
          title="Pick an element for the agent (Esc to cancel)"
          aria-label="Pick element"
        >
          <Icon name="pointer" size={15} />
        </button>
        <span className="bar-sep" />
        <button disabled={!state.canGoBack} onClick={() => api.browser('back')} title="Back" aria-label="Back"><Icon name="left" /></button>
        <button disabled={!state.canGoForward} onClick={() => api.browser('forward')} title="Forward" aria-label="Forward"><Icon name="right" /></button>
        <button disabled={!showPage} onClick={() => api.browser('reload')} title="Reload" aria-label="Reload"><Icon name="reload" size={15} /></button>
        <form
          className="url"
          onSubmit={(e) => {
            e.preventDefault()
            if (input.trim()) go(input.trim())
            url.current?.blur()
          }}
        >
          <Icon name="globe" size={13} />
          <input
            ref={url}
            value={input}
            placeholder="Enter a URL"
            onFocus={(e) => {
              setEditing(true)
              e.target.select()
            }}
            onBlur={() => setEditing(false)}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
          />
          {state.loading && <span className="spinner" />}
          {hasPage && (
            <button type="button" className="url-home" title="Start page" aria-label="Start page" onClick={() => setHome(!home)}>
              <Icon name="canvas" size={13} />
            </button>
          )}
        </form>
        <button className="import-btn" disabled={!showPage || capturing} onClick={capture} title="Put a full-page screenshot on the canvas">
          {capturing ? 'Capturing…' : 'Capture'}
        </button>
        <span className="bar-sep" />
        <button onClick={onClose} title="Close browser" aria-label="Close browser"><Icon name="panelRight" size={15} /></button>
      </div>

      <div ref={slot} className="browser-slot">
        {!showPage && (
          <div className="browser-home">
            <div className="home-mark"><Icon name="globe" size={22} /></div>
            <h3>Bring the web onto your canvas</h3>
            <p>Open a live site or your localhost dev server. The agent can browse it, read its menus, and redesign any part.</p>
            <button className="home-cta" onClick={() => url.current?.focus()}>
              Enter a URL <Icon name="right" size={14} />
            </button>

            <div className="home-cards">
              <HomeCard icon="camera" title="Capture a page" text="Put a full-page screenshot on the canvas, ready to redesign." />
              <HomeCard icon="pointer" title="Pick an element" text="Point at one part of the page and ask the agent about it." />
              <HomeCard icon="upload" title="Drop a screenshot" text="Drag a PNG or JPG onto the canvas to use it as a reference." />
            </div>

            {recent.length > 0 && (
              <div className="recent">
                <div className="recent-head">
                  <span><Icon name="file" size={13} /> Recent</span>
                  <button onClick={() => api.browser('clearRecent')}>Clear all</button>
                </div>
                {recent.map((u) => (
                  <button key={u} className="recent-row" onClick={() => go(u)} title={u}>
                    <Icon name="globe" size={13} />
                    <span>{u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}</span>
                    <Icon name="arrow" size={13} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

function HomeCard({ icon, title, text }: { icon: IconName; title: string; text: string }) {
  return (
    <div className="home-card">
      <div className="home-card-icon"><Icon name={icon} size={15} /></div>
      <h4>{title}</h4>
      <p>{text}</p>
    </div>
  )
}
