import type { RunView } from '../../shared/run'
import { api } from './api'

export function RunCard({ run, activity, live }: { run: RunView; activity: Record<string, string>; live: boolean }) {
  const done = run.jobs.filter(j => j.state === 'done').length
  const failed = run.jobs.filter(j => j.state === 'failed').length
  const running = run.jobs.filter(j => j.state === 'running').length
  const queued = run.jobs.filter(j => j.state === 'queued').length
  const stopping = activity['run'] === 'Stopping…' && live
  const count = `${done} of ${run.jobs.length} finished · ${failed} failed · ${running} running · ${queued} queued`
  return <div className="run-card" role="group" aria-label="Parallel run">
    <div className="run-card-head"><strong>{stopping ? 'Stopping…' : run.finished ? `Run ${run.finished.outcome}` : live ? 'Designing' : 'Interrupted'}</strong>
      {run.finished?.costUsd !== undefined && <span>{!run.finished.costComplete ? 'At least ' : ''}${run.finished.costUsd.toFixed(3)}</span>}
    </div>
    <p role={live ? 'status' : undefined} aria-live={live ? 'polite' : undefined}>{count}</p>
    <ol>{run.jobs.map(job => <li key={job.id}>
      <div><strong>{job.label}</strong><span className={`run-job-state is-${job.state}`}>{job.state}{job.partial ? ' · partial' : ''}</span></div>
      {job.state === 'running' && activity[job.id] && <small>{activity[job.id].replaceAll('_', ' ')}</small>}
      {job.error && <small className="run-job-error">{job.error}</small>}
      {job.costUsd !== undefined && <small>${job.costUsd.toFixed(3)}</small>}
      {job.frameIds.map((id, i) => <button type="button" key={id} onClick={() => { void api.showRunFrame(id) }} aria-label={`Show ${job.label}${job.frameIds.length > 1 ? ` frame ${i + 1}` : ''}`}>Show{job.frameIds.length > 1 ? ` ${i + 1}` : ''}</button>)}
    </li>)}</ol>
  </div>
}
