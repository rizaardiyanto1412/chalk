import type { Frame, FrameId } from './model'

export const FRAME_PRESETS = {
  desktop: { name: 'Desktop', width: 1440, height: 900 },
  mobile: { name: 'Mobile', width: 390, height: 844 }
} as const

export function frameBounds(frames: Frame[]) {
  const x = Math.min(...frames.map((f) => f.x))
  const y = Math.min(...frames.map((f) => f.y))
  return {
    x, y,
    width: Math.max(...frames.map((f) => f.x + f.width)) - x,
    height: Math.max(...frames.map((f) => f.y + f.height)) - y
  }
}

export function cloneFrames(frames: Frame[], newId: () => FrameId, dx: number, dy: number, updatedAt: number): Frame[] {
  return frames.map((frame) => ({ ...frame, id: newId(), x: frame.x + dx, y: frame.y + dy, updatedAt }))
}
