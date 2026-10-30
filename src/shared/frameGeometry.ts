import type { Arrangement, Frame, FrameId, FramePatch, GeometryField, Op, Stacking } from './model'

export const FRAME_LIMITS = { width: { min: 200, max: 3840 }, height: { min: 100, max: 12000 } }

export function frameSize(field: 'width' | 'height', value: number): number {
  return Math.max(FRAME_LIMITS[field].min, Math.min(FRAME_LIMITS[field].max, Math.round(value)))
}

export const FRAME_PRESETS = {
  desktop: { name: 'Desktop', width: 1440, height: 900 },
  mobile: { name: 'Mobile', width: 390, height: 844 }
} as const

export function frameBounds(frames: Frame[]) {
  if (!frames.length) return { x: 0, y: 0, width: 0, height: 0 }
  const x = Math.min(...frames.map((f) => f.x))
  const y = Math.min(...frames.map((f) => f.y))
  return {
    x, y,
    width: Math.max(...frames.map((f) => f.x + f.width)) - x,
    height: Math.max(...frames.map((f) => f.y + f.height)) - y
  }
}

export function geometryValue(frames: Frame[], field: GeometryField): number | null {
  if (!frames.length) return null
  if (field === 'x' || field === 'y') return frameBounds(frames)[field]
  return frames.every((f) => f[field] === frames[0][field]) ? frames[0][field] : null
}

export function translated(frames: Frame[], dx: number, dy: number) {
  return frames.map((f) => ({ id: f.id, x: f.x + dx, y: f.y + dy }))
}

function stacked(order: FrameId[], selected: Set<FrameId>, direction: Stacking): FrameId[] {
  const picked = order.filter((id) => selected.has(id))
  const rest = order.filter((id) => !selected.has(id))
  if (direction === 'front') return [...rest, ...picked]
  if (direction === 'back') return [...picked, ...rest]
  const result = [...order]
  const step = direction === 'forward' ? -1 : 1
  for (let i = step === -1 ? result.length - 2 : 1; i >= 0 && i < result.length; i += step) {
    const neighbor = i - step
    if (selected.has(result[i]) && !selected.has(result[neighbor])) {
      ;[result[i], result[neighbor]] = [result[neighbor], result[i]]
    }
  }
  return result
}

export function arrangementOps(all: Frame[], ids: FrameId[], operation: Arrangement): Op[] {
  const selected = new Set(ids)
  const frames = all.filter((f) => selected.has(f.id))
  if (!frames.length) return []
  const bounds = frameBounds(frames)
  const fields: GeometryField[] = ['x', 'y', 'width', 'height']
  const patch = (f: Frame, value: FramePatch): Op[] =>
    fields.some((field) => value[field] !== undefined && f[field] !== value[field]) ? [{ type: 'patch', id: f.id, patch: value }] : []
  switch (operation.kind) {
    case 'translate':
      return frames.flatMap((f) => patch(f, { x: f.x + operation.dx, y: f.y + operation.dy }))
    case 'geometry': {
      const { field, value } = operation
      if (field === 'x' || field === 'y') return frames.flatMap((f) => patch(f, { [field]: f[field] + value - bounds[field] }))
      return frames.flatMap((f) => patch(f, { [field]: frameSize(field, value) }))
    }
    case 'align': {
      if (frames.length < 2) return []
      return frames.flatMap((f) => {
        switch (operation.alignment) {
          case 'left': return patch(f, { x: bounds.x })
          case 'hcenter': return patch(f, { x: bounds.x + (bounds.width - f.width) / 2 })
          case 'right': return patch(f, { x: bounds.x + bounds.width - f.width })
          case 'top': return patch(f, { y: bounds.y })
          case 'vcenter': return patch(f, { y: bounds.y + (bounds.height - f.height) / 2 })
          case 'bottom': return patch(f, { y: bounds.y + bounds.height - f.height })
        }
      })
    }
    case 'distribute': {
      if (frames.length < 3) return []
      const axis = operation.axis
      const size = axis === 'x' ? 'width' : 'height'
      const sorted = [...frames].sort((a, b) => a[axis] - b[axis])
      const gap = (bounds[size] - frames.reduce((sum, f) => sum + f[size], 0)) / (frames.length - 1)
      let cursor = bounds[axis]
      return sorted.flatMap((f) => {
        const ops = patch(f, { [axis]: cursor })
        cursor += f[size] + gap
        return ops
      })
    }
    case 'stack': {
      const order = all.map((f) => f.id)
      const next = stacked(order, selected, operation.direction)
      return next.every((id, i) => id === order[i]) ? [] : [{ type: 'reorder', ids: next }]
    }
  }
}

export function cloneFrames(frames: Frame[], newId: () => FrameId, dx: number, dy: number, updatedAt: number): Frame[] {
  return frames.map((frame) => ({ ...frame, id: newId(), x: frame.x + dx, y: frame.y + dy, updatedAt }))
}
