import { useEffect, useRef, useState } from 'react'
import { DEFAULT_RUN_SETTINGS, directionCount, isOrdinary, runSettingsSchema, taskBound, type RunSettings } from '../../shared/run'

export function savedRunSettings(): RunSettings {
  try { return runSettingsSchema.parse(JSON.parse(localStorage.getItem('chalk.parallel') ?? 'null')) }
  catch { return DEFAULT_RUN_SETTINGS }
}
export function RunControls({ value, onChange, disabled, children }: { value: RunSettings; onChange: (value: RunSettings) => void; disabled: boolean; children?: React.ReactNode }) {
  const [open, setOpen] = useState<'variations' | 'agents' | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const variations = useRef<HTMLButtonElement>(null)
  const agents = useRef<HTMLButtonElement>(null)
  const close = () => {
    const target = open === 'variations' ? variations : agents
    setOpen(null)
    target.current?.focus()
  }
  useEffect(() => { if (disabled) setOpen(null) }, [disabled])
  useEffect(() => {
    if (!open) return
    root.current?.querySelector<HTMLInputElement>('[role="dialog"] input:not(:disabled)')?.focus()
    const outside = (e: PointerEvent) => { if (e.target instanceof Node && !root.current?.contains(e.target)) close() }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const update = (next: RunSettings) => { onChange(next); localStorage.setItem('chalk.parallel', JSON.stringify(next)) }
  return <div className="run-controls" ref={root} onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); close() } }}>
    <div className="run-triggers">
      <button type="button" ref={variations} aria-label="Variations" aria-haspopup="dialog" aria-expanded={open === 'variations'} disabled={disabled} onClick={() => setOpen(open === 'variations' ? null : 'variations')}>
        <span aria-hidden="true">◫</span> {value.variations.axis === 'off' ? '1 design' : `${value.variations.axis === 'layout' ? 'Layout' : 'Style'} ×${value.variations.count}`}
      </button>
      <button type="button" ref={agents} aria-label="Parallel agents" title={`${value.agents} ${value.agents === 1 ? 'agent' : 'agents'} at a time`} aria-haspopup="dialog" aria-expanded={open === 'agents'} disabled={disabled} onClick={() => setOpen(open === 'agents' ? null : 'agents')}>
        <span aria-hidden="true">⫶</span> {value.agents}
      </button>
      {children}
    </div>
    {open && <div className="run-popover" role="dialog" aria-label={open === 'variations' ? 'Variations' : 'Parallel agents'}>
      {open === 'variations' ? <>
        <fieldset><legend>Variations</legend>
          {(['off', 'layout', 'style'] as const).map(axis => <label className="run-option" key={axis}>
            <input type="radio" name="variation-axis" value={axis} checked={value.variations.axis === axis} onChange={() => update({ ...value, variations: axis === 'off' ? { axis } : { axis, count: value.variations.axis === 'off' ? 2 : value.variations.count } })} />
            <span><strong>{axis === 'off' ? 'Off' : axis === 'layout' ? 'Layout' : 'Style'}</strong><small>{axis === 'off' ? 'One design direction.' : axis === 'layout' ? 'Different compositions, one visual identity.' : 'Different visual directions, the same content.'}</small></span>
          </label>)}
        </fieldset>
        <label className="run-number">Number of variations <input type="number" min={2} max={6} disabled={value.variations.axis === 'off'} value={value.variations.axis === 'off' ? 2 : value.variations.count} onChange={e => { if (value.variations.axis !== 'off' && e.currentTarget.validity.valid && e.currentTarget.value) update({ ...value, variations: { ...value.variations, count: Number(e.currentTarget.value) } }) }} /></label>
      </> : <>
        <label className="run-number">Agents at once <input type="number" min={1} max={6} value={value.agents} onChange={e => { if (e.currentTarget.validity.valid && e.currentTarget.value) update({ ...value, agents: Number(e.currentTarget.value) }) }} /></label>
        <fieldset disabled={value.agents === 1}><legend>Work mode</legend>
          {(['split', 'side'] as const).map(mode => <label className="run-option" key={mode}>
            <input type="radio" name="work-mode" checked={value.mode === mode} onChange={() => update({ ...value, mode })} />
            <span><strong>{mode === 'split' ? 'Split Work' : 'Side by Side'}</strong><small>{mode === 'split' ? 'Build complementary parts of each result.' : 'Build complete alternatives independently.'}</small></span>
          </label>)}
        </fieldset>
        <p>The limit includes planning and integration. Private browsers have no logged-in state.</p>
      </>}
      <p>Creates new frames. Selected frames stay unchanged.</p>
    </div>}
  </div>
}

/** What the next send will start, shown only when it starts more than one ordinary agent turn. */
export function RunEstimate({ value }: { value: RunSettings }) {
  if (isOrdinary(value)) return null
  return <div className="run-estimate">{directionCount(value)} results · up to {taskBound(value)} tasks · {value.agents} at a time</div>
}
