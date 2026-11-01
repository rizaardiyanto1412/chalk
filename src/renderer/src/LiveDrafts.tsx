import { useEffect, useState } from 'react'
import { agentColor, type LiveDraft, type LiveRun } from '../../shared/run'
import { CanvasCursor } from './CanvasPresence'

/** Workers' private drafts, drawn read-only in world coordinates while a run is active. */
export function LiveDraftFrames({ live, port }: { live: LiveRun; port: number }) {
  return <>{live.drafts.map((d) => (
    <div key={d.id} className="live-draft" data-live-draft={d.id} style={{ left: d.x, top: d.y, width: d.width, height: d.height, '--agent': agentColor(d.agent) } as React.CSSProperties}>
      <div className="live-draft-label" title={d.name ? `${d.name} · ${d.label}` : d.label}>
        <span className="live-draft-dot" />
        <span className="live-draft-name">{d.name ?? d.label}</span>
        <span className="live-draft-state">draft</span>
      </div>
      {d.token ? <DraftView draft={d} port={port} /> : <div className="live-draft-empty">{d.label}</div>}
    </div>
  ))}</>
}

/** Keep the previous render until the next revision has loaded, so drafts update without flashing. */
function DraftView({ draft, port }: { draft: LiveDraft; port: number }) {
  const src = `http://127.0.0.1:${port}/preview/${draft.token}?r=${draft.revision}`
  const [shown, setShown] = useState(src)
  const [pending, setPending] = useState<string | null>(null)
  useEffect(() => { if (src !== shown) setPending(src) }, [src, shown])
  return <>
    <iframe key={shown} title={draft.name ?? draft.label} src={shown} scrolling="no" sandbox="allow-scripts" tabIndex={-1} />
    {pending && <iframe key={pending} title={draft.name ?? draft.label} src={pending} scrolling="no" sandbox="allow-scripts" tabIndex={-1} className="is-pending" onLoad={() => setTimeout(() => { setShown(pending); setPending(null) }, 200)} />}
  </>
}

/** One cursor per worker, pinned in world coordinates on the part of its draft it last changed. */
export function LiveCursors({ live }: { live: LiveRun }) {
  return <div className="chalk-presence live-cursors" aria-hidden="true">
    {live.cursors.map((c) => {
      const d = live.drafts.find((draft) => draft.id === c.draftId)
      if (!d) return null
      return <div key={`${c.runId}:${c.jobId}`} data-live-cursor={c.jobId} style={{ '--presence-accent': agentColor(c.agent) } as React.CSSProperties}>
        {c.scans > 0 && <div key={c.scans} className="presence-scan live-scan" style={{ left: d.x, top: d.y, width: d.width, height: d.height, right: 'auto', bottom: 'auto' }}><div className="presence-band" /></div>}
        <CanvasCursor x={d.x + c.fx * d.width} y={d.y + c.fy * d.height}>{c.label}<span className="live-activity"> · {c.activity}</span></CanvasCursor>
      </div>
    })}
  </div>
}
