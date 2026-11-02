import { useEffect, useRef, useState } from 'react'
import { api, type CodebaseState } from './api'
import { Icon } from './icons'

const LEARN = 'Explore the linked codebase and save a product brief for designing. Do not design anything yet.'

/** Link a source folder to this project so the agent can learn the product from its code. */
export function CodebaseButton({ disabled, model }: { disabled: boolean; model: string }) {
  const [state, setState] = useState<CodebaseState>(null)
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    void api.codebase('get').then(setState)
    return api.on.codebase(setState)
  }, [])
  useEffect(() => {
    if (!open) return
    void api.codebase('get').then(setState)
    const outside = (e: PointerEvent) => { if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const choose = async () => setState(await api.codebase('choose'))
  return <span className="codebase" ref={root} onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false) }}>
    <button type="button" aria-label="Codebase" aria-haspopup="dialog" aria-expanded={open} title={state?.path ?? 'Link a codebase so the agent can learn the product'} onClick={() => (state ? setOpen(!open) : void choose())}>
      <Icon name="code" size={12} /> {state ? state.name : 'Add codebase'}
    </button>
    {open && state && <div className="run-popover codebase-popover" role="dialog" aria-label="Codebase">
      <strong>{state.name}</strong>
      <p className="codebase-path">{state.path}</p>
      <p>The agent can read this folder but never change it. Secrets, dependencies and build output stay hidden. {state.hasBrief ? 'A product brief from it is saved in DESIGN.md.' : 'No product brief yet; the agent writes one before its first design.'}</p>
      <div className="codebase-actions">
        <button type="button" className="is-primary" disabled={disabled} onClick={() => { setOpen(false); void api.sendAgent(LEARN, model, null, { variations: { axis: 'off' }, agents: 1, mode: 'split' }) }}>{state.hasBrief ? 'Learn again' : 'Learn the product'}</button>
        <button type="button" onClick={() => void choose()}>Change…</button>
        <button type="button" onClick={async () => { setOpen(false); setState(await api.codebase('clear')) }}>Remove</button>
      </div>
    </div>}
  </span>
}
