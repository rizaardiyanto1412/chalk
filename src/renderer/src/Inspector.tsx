import { useEffect, useRef, useState } from 'react'
import type { Alignment, Arrangement, Frame, GeometryField, Stacking, SelectedElement } from '../../shared/model'
import { FRAME_LIMITS, geometryValue } from '../../shared/frameGeometry'
import { api } from './api'

const fields: { field: GeometryField; label: string }[] = [
  { field: 'x', label: 'X' }, { field: 'y', label: 'Y' },
  { field: 'width', label: 'W' }, { field: 'height', label: 'H' }
]
const alignments: { alignment: Alignment; label: string }[] = [
  { alignment: 'left', label: 'Align left' }, { alignment: 'hcenter', label: 'Align horizontal centers' },
  { alignment: 'right', label: 'Align right' }, { alignment: 'top', label: 'Align top' },
  { alignment: 'vcenter', label: 'Align vertical centers' }, { alignment: 'bottom', label: 'Align bottom' }
]
const stacking: { direction: Stacking; label: string }[] = [
  { direction: 'front', label: 'Bring to front' }, { direction: 'back', label: 'Send to back' },
  { direction: 'forward', label: 'Bring forward' }, { direction: 'backward', label: 'Send backward' }
]

export function Inspector({ frames, projectEpoch, selectedElement }: { frames: Frame[]; projectEpoch: number; selectedElement: SelectedElement | null }) {
  const arrange = (operation: Arrangement) => {
    void api.frameCommand({ type: 'arrange', ids: frames.map((f) => f.id), projectEpoch, operation })
  }
  return (
    <section className="frame-inspector" aria-label="Frame geometry and arrangement">
      {selectedElement && <div className="element-inspector" aria-label="Selected element">
        <strong>&lt;{selectedElement.tag}&gt;</strong>
        <span>{selectedElement.text || 'Element'}</span>
        <span>{Math.round(selectedElement.rect.width)} × {Math.round(selectedElement.rect.height)} px</span>
      </div>}
      <div className="inspector-title">{frames.length ? `${frames.length} selected` : 'Select frames to edit'}</div>
      <div className="geometry-fields">
        {fields.map(({ field, label }) => <GeometryInput key={`${projectEpoch}:${frames.map((f) => f.id).join(',')}:${field}`} field={field} label={label} value={geometryValue(frames, field)} disabled={!frames.length} onCommit={(value) => arrange({ kind: 'geometry', field, value })} />)}
      </div>
      <div className="arrangement-actions" role="group" aria-label="Align frames">
        {alignments.map(({ alignment, label }) => <button key={alignment} disabled={frames.length < 2} onClick={() => arrange({ kind: 'align', alignment })}>{label}</button>)}
      </div>
      <div className="arrangement-actions" role="group" aria-label="Distribute frames">
        <button disabled={frames.length < 3} onClick={() => arrange({ kind: 'distribute', axis: 'x' })}>Distribute horizontally</button>
        <button disabled={frames.length < 3} onClick={() => arrange({ kind: 'distribute', axis: 'y' })}>Distribute vertically</button>
      </div>
      <div className="arrangement-actions" role="group" aria-label="Stack frames">
        {stacking.map(({ direction, label }) => <button key={direction} disabled={!frames.length} onClick={() => arrange({ kind: 'stack', direction })}>{label}</button>)}
      </div>
    </section>
  )
}

function GeometryInput({ field, label, value, disabled, onCommit }: { field: GeometryField; label: string; value: number | null; disabled: boolean; onCommit: (value: number) => void }) {
  const [text, setText] = useState(value === null ? '' : String(value))
  const dirty = useRef(false)
  useEffect(() => {
    setText(value === null ? '' : String(value))
    dirty.current = false
  }, [value])
  const reset = () => {
    dirty.current = false
    setText(value === null ? '' : String(value))
  }
  const commit = () => {
    if (!dirty.current) return
    dirty.current = false
    const parsed = Number(text)
    if (text.trim() && Number.isFinite(parsed)) onCommit(parsed)
    reset()
  }
  const limits = field === 'width' || field === 'height' ? FRAME_LIMITS[field] : undefined
  return (
    <label>{label}<input aria-label={`Frame ${label}`} type="number" step="any" min={limits?.min} max={limits?.max} value={text} placeholder={disabled ? '' : 'Mixed'} disabled={disabled}
      onChange={(event) => { dirty.current = true; setText(event.target.value) }} onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); commit(); event.currentTarget.blur() }
        if (event.key === 'Escape') { event.stopPropagation(); reset(); event.currentTarget.blur() }
      }} /></label>
  )
}
