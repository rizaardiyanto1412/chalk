import type { FrameId } from './model'

export type BrowserPresenceAction = 'scan' | 'click' | 'type' | 'scroll'
export type PresencePoint = { x: number; y: number }
export type PresenceTarget =
  | { kind: 'browser'; action: BrowserPresenceAction; point: PresencePoint | null }
  | { kind: 'frame'; frameId: FrameId }

export type PresenceVisual =
  | { phase: 'idle' }
  | { phase: 'active' | 'fading'; id: number; target: PresenceTarget; activity: string; since: number; operation: 'running' | 'settled' }

export interface PresenceState {
  turn: { since: number; model: string | null; activity: string } | null
  visual: PresenceVisual
}

export const idlePresence = (): PresenceState => ({ turn: null, visual: { phase: 'idle' } })

export type PresenceEvent =
  | { type: 'turn-start'; since: number; model: string | null }
  | { type: 'model'; model: string }
  | { type: 'activity'; activity: string }
  | { type: 'focus'; id: number; since: number; activity: string; target: PresenceTarget }
  | { type: 'settled' | 'fade' | 'clear'; id: number }
  | { type: 'turn-end' }

export function reducePresence(state: PresenceState, event: PresenceEvent): PresenceState {
  const visual = state.visual
  switch (event.type) {
    case 'turn-start':
      return { turn: { since: event.since, model: event.model, activity: 'Thinking' }, visual: { phase: 'idle' } }
    case 'model':
      return state.turn ? { ...state, turn: { ...state.turn, model: event.model } } : state
    case 'activity':
      return state.turn ? { ...state, turn: { ...state.turn, activity: event.activity } } : state
    case 'focus':
      if (visual.phase !== 'idle' && visual.id > event.id) return state
      return { ...state, visual: { phase: 'active', id: event.id, target: event.target, activity: event.activity, since: event.since, operation: 'running' } }
    case 'settled':
      return visual.phase !== 'idle' && visual.id === event.id ? { ...state, visual: { ...visual, operation: 'settled' } } : state
    case 'fade':
      return visual.phase !== 'idle' && visual.id === event.id ? { ...state, visual: { ...visual, phase: 'fading', operation: 'settled' } } : state
    case 'clear':
      return visual.phase !== 'idle' && visual.id === event.id ? { ...state, visual: { phase: 'idle' } } : state
    case 'turn-end':
      return { turn: null, visual: visual.phase === 'idle' ? visual : { ...visual, phase: 'fading', operation: 'settled' } }
  }
}

const ACTIVITIES: Record<string, string> = {
  browser_navigate: 'Opening page', browser_back: 'Opening page', browser_set_device: 'Resizing browser',
  browser_snapshot: 'Reading page', browser_state: 'Reading page', browser_extract_styles: 'Reading page styles',
  browser_screenshot: 'Capturing page', browser_capture_to_canvas: 'Capturing page',
  browser_click: 'Clicking', browser_type: 'Typing', browser_scroll: 'Scrolling',
  get_canvas: 'Reading canvas', get_frame: 'Reading frame', create_frame: 'Designing frame',
  edit_frame: 'Editing frame', update_frame: 'Updating frame', delete_frame: 'Removing frame',
  review_frame: 'Reviewing frame', screenshot_frame: 'Reviewing frame',
  export_frame: 'Exporting frame', copy_frame_image: 'Copying frame',
  get_style: 'Exploring styles', get_design_guidelines: 'Reading design guide',
  search_photos: 'Finding photos', generate_image: 'Generating image', check_numbers: 'Checking numbers', WebFetch: 'Reading page', WebSearch: 'Searching'
}

export const activityForTool = (name: string): string => ACTIVITIES[name] ?? 'Thinking'

export function browserActionForTool(name: string): BrowserPresenceAction | null {
  switch (name) {
    case 'browser_navigate': case 'browser_back': case 'browser_snapshot': case 'browser_screenshot':
    case 'browser_extract_styles': case 'browser_capture_to_canvas': return 'scan'
    case 'browser_click': return 'click'
    case 'browser_type': return 'type'
    case 'browser_scroll': return 'scroll'
    default: return null
  }
}

export function elapsedPresence(since: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - since) / 1000))
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`
}
