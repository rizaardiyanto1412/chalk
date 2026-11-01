import { EventEmitter } from 'node:events'
import { activityForTool, idlePresence, reducePresence, type PresenceEvent, type PresenceTarget } from '../shared/presence'

export class Presence extends EventEmitter {
  state = idlePresence()
  private sequence = 0
  private timer: ReturnType<typeof setTimeout> | undefined

  dispatch(event: PresenceEvent): void {
    this.state = reducePresence(this.state, event)
    this.emit('change', this.state)
    if (event.type === 'turn-start') clearTimeout(this.timer)
    if (event.type === 'turn-end' && this.state.visual.phase !== 'idle') this.expire(this.state.visual.id, 0)
  }

  begin(name: string): number {
    this.dispatch({ type: 'activity', activity: activityForTool(name) })
    return ++this.sequence
  }

  focus(id: number, name: string, target: PresenceTarget): void {
    if (id !== this.sequence) return
    clearTimeout(this.timer)
    this.dispatch({ type: 'focus', id, activity: activityForTool(name), target, since: Date.now() })
  }

  finish(id: number): void {
    const visual = this.state.visual
    if (visual.phase === 'idle' || visual.id !== id) return
    this.dispatch({ type: 'settled', id })
    this.expire(id, 3000)
  }

  private expire(id: number, delay: number): void {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.dispatch({ type: 'fade', id })
      this.timer = setTimeout(() => this.dispatch({ type: 'clear', id }), 400)
      this.timer.unref()
    }, delay)
    this.timer.unref()
  }
}
