import { useRef } from 'react'
import type { Frame } from '../../shared/model'
import type { PresenceVisual } from '../../shared/presence'
import { PRESENCE_CURSOR_PATH } from '../../shared/presenceVisual'

/** Drawn inside the canvas world, so the cursor stays pinned to the canvas while the user pans and zooms. It glides only when the agent moves. */
export function CanvasPresence({ visual, frames }: { visual: PresenceVisual; frames: Frame[] }) {
  const point = useRef({ x: 0, y: 0 })
  const target = visual.phase !== 'idle' ? visual.target : null
  const frame = target?.kind === 'frame' ? frames.find((frame) => frame.id === target.frameId) : undefined
  if (frame) point.current = { x: frame.x, y: frame.y }
  return <div className={`chalk-presence canvas-presence ${!frame || visual.phase === 'fading' ? 'is-fading' : ''}`} aria-hidden="true" data-presence-frame={frame?.id} data-phase={visual.phase}>
    {frame && visual.phase !== 'idle' && <div key={visual.id} className="presence-scan" style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height, right: 'auto', bottom: 'auto' }}>
      {visual.operation === 'running' && <div className="presence-tint" />}
      <div className="presence-band" />
    </div>}
    <CanvasCursor x={point.current.x} y={point.current.y} dx={12} dy={-16}>Chalk</CanvasCursor>
  </div>
}

/** A cursor at a world point. The body is counter-scaled so it keeps its on-screen size at any zoom. */
export function CanvasCursor({ x, y, dx = 0, dy = 0, children }: { x: number; y: number; dx?: number; dy?: number; children: React.ReactNode }) {
  return <div className="presence-cursor canvas-cursor" style={{ transform: `translate(${x}px, ${y}px)` }}>
    <div className="canvas-cursor-body" style={{ left: `calc(${dx}px / var(--zoom))`, top: `calc(${dy}px / var(--zoom))` }}>
      <svg viewBox="0 0 22 24"><path d={PRESENCE_CURSOR_PATH} /></svg>
      <span className="presence-tag">{children}</span>
    </div>
  </div>
}
