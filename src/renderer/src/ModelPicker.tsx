import { useEffect, useRef, useState } from 'react'
import { EFFORTS, EFFORT_LABELS, modelName, type Effort, type ModelOption } from '../../shared/models'
import { BrandMark, Icon } from './icons'

const SHORT: Record<Effort, string> = { low: 'Low', medium: 'Med', high: 'High', xhigh: 'XHigh', max: 'Max' }

/** Choose the Claude model and reasoning effort from what the user's Claude Code offers, or type any model ID. */
export function ModelPicker({ models, model, effort, onChange, onOpen, disabled }: { models: readonly ModelOption[]; model: string; effort: Effort | null; onChange: (model: string, effort: Effort | null) => void; onOpen: () => void; disabled: boolean }) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const root = useRef<HTMLSpanElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const current = models.find((m) => m.id === model)
  const efforts = current ? current.efforts : [...EFFORTS]
  useEffect(() => { if (disabled) setOpen(false) }, [disabled])
  useEffect(() => {
    if (!open) return
    onOpen()
    root.current?.querySelector<HTMLInputElement>('input[name="model"]:checked')?.focus()
    const outside = (e: PointerEvent) => { if (e.target instanceof Node && !root.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [open])
  const close = () => { setOpen(false); trigger.current?.focus() }
  const pick = (id: string) => {
    const next = models.find((m) => m.id === id)
    onChange(id, effort && next && !next.efforts.includes(effort) ? null : effort)
  }
  return <span className="model-picker" ref={root} onKeyDown={(e) => { if (e.key === 'Escape' && open) { e.stopPropagation(); close() } }}>
    <button type="button" ref={trigger} className="model-trigger" aria-label="Claude model" aria-haspopup="dialog" aria-expanded={open} disabled={disabled} title={current ? `${current.version}${current.summary ? ` · ${current.summary}` : ''}` : model} onClick={() => setOpen(!open)}>
      <BrandMark brand="anthropic" size={11} />
      <span className="model-name">{modelName(models, model)}</span>
      {effort && <span className="model-effort">{SHORT[effort]}</span>}
      <Icon name="chevronDown" size={12} />
    </button>
    {open && <div className="run-popover model-popover" role="dialog" aria-label="Model">
      <fieldset><legend>Model</legend>
        {models.map((m) => <label key={m.id || 'default'} className={`model-row ${m.id === model ? 'is-on' : ''}`}>
          <input type="radio" name="model" value={m.id} checked={m.id === model} onChange={() => pick(m.id)} onKeyDown={(e) => { if (e.key === 'Enter') close() }} />
          <span className="model-logo"><BrandMark brand="anthropic" size={12} /></span>
          <span className="model-row-text"><strong>{m.version}</strong><small>{m.summary}</small></span>
          {m.price && <span className="model-price" title={`${m.price} (input/output per million tokens)`}>{m.price.replace(/ per Mtok.*$/, '').replace(/ \(.*$/, '')}</span>}
          {m.id === model && <Icon name="check" size={13} />}
        </label>)}
        {!current && model && <label className="model-row is-on"><input type="radio" name="model" checked readOnly /><span className="model-logo"><BrandMark brand="anthropic" size={12} /></span><span className="model-row-text"><strong>{model}</strong><small>Custom model ID</small></span><Icon name="check" size={13} /></label>}
      </fieldset>
      {efforts.length > 0 && <fieldset className="effort"><legend>Effort <small>how hard it thinks; higher is slower and costs more</small></legend>
        <div className="effort-options" role="radiogroup" aria-label="Effort">
          <label className={effort === null ? 'is-on' : ''} title="Let Claude Code choose"><input type="radio" name="effort" checked={effort === null} onChange={() => onChange(model, null)} />Auto</label>
          {EFFORTS.filter((level) => efforts.includes(level)).map((level) => <label key={level} className={effort === level ? 'is-on' : ''} title={EFFORT_LABELS[level]}><input type="radio" name="effort" checked={effort === level} onChange={() => onChange(model, level)} />{SHORT[level]}</label>)}
        </div>
      </fieldset>}
      <form className="model-custom" onSubmit={(e) => { e.preventDefault(); if (custom.trim()) { onChange(custom.trim(), effort); setCustom(''); close() } }}>
        <input aria-label="Other model ID" placeholder="Other model ID, e.g. claude-opus-5" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button type="submit" disabled={!custom.trim()}>Use</button>
      </form>
      <p>The list comes from your Claude Code. Older versions work if Claude Code accepts their ID.</p>
    </div>}
  </span>
}
