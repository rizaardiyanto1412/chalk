import { useRef } from 'react'
import type { Frame } from '../../shared/model'
import type { PresenceVisual } from '../../shared/presence'
import { PRESENCE_CURSOR_PATH } from '../../shared/presenceVisual'

export function CanvasPresence({ visual, frames, cam }: { visual: PresenceVisual; frames: Frame[]; cam: { x: number; y: number; zoom: number } }) {
  const point = useRef({ x: 40, y: 40 })
  const target = visual.phase !== 'idle' ? visual.target : null
  const frame = target?.kind === 'frame' ? frames.find((frame) => frame.id === target.frameId) : undefined
  if (frame) point.current = { x: cam.x + frame.x * cam.zoom + 12, y: cam.y + frame.y * cam.zoom - 16 }
  return <div className={`chalk-presence canvas-presence ${!frame || visual.phase === 'fading' ? 'is-fading' : ''}`} aria-hidden="true" data-presence-frame={frame?.id} data-phase={visual.phase}>
    {frame && visual.phase !== 'idle' && <div key={visual.id} className="presence-scan" style={{ left: cam.x + frame.x * cam.zoom, top: cam.y + frame.y * cam.zoom, width: frame.width * cam.zoom, height: frame.height * cam.zoom, right: 'auto', bottom: 'auto' }}>
      {visual.operation === 'running' && <div className="presence-tint" />}
      <div className="presence-band" />
    </div>}
    <div className="presence-cursor" style={{ transform: `translate(${point.current.x}px, ${point.current.y}px)` }}>
      <svg viewBox="0 0 22 24"><path d={PRESENCE_CURSOR_PATH} /></svg>
      <span className="presence-tag">Chalk</span>
    </div>
  </div>
}
