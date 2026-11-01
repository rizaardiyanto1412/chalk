export const PRESENCE_CURSOR_PATH = 'M3 2.5 5.5 20l4.8-5.3 6.7-.8L3 2.5Z'

export const PRESENCE_CSS = `
.chalk-presence { --presence-accent: #2563eb; position: absolute; inset: 0; pointer-events: none; overflow: visible; opacity: 1; transition: opacity 400ms ease; z-index: 8; }
.chalk-presence *, .chalk-presence *::before, .chalk-presence *::after { box-sizing: border-box; pointer-events: none; }
.chalk-presence.is-fading { opacity: 0; }
.presence-cursor { position: absolute; left: 0; top: 0; width: 22px; height: 24px; transition: transform 420ms cubic-bezier(.22,.8,.24,1); filter: drop-shadow(0 2px 3px #17255426); }
.presence-cursor svg { display: block; width: 22px; height: 24px; overflow: visible; fill: var(--presence-accent); stroke: white; stroke-width: 1.5; stroke-linejoin: round; }
.presence-tag { position: absolute; top: 23px; left: 14px; padding: 3px 7px; border: 1px solid #ffffff70; border-radius: 4px 9px 9px 9px; background: var(--presence-accent); color: white; font: 600 11px/15px -apple-system, BlinkMacSystemFont, sans-serif; letter-spacing: .01em; white-space: nowrap; }
.presence-scan { position: absolute; inset: 0; overflow: hidden; border-radius: 2px; }
.presence-band { position: absolute; inset: 0; background: linear-gradient(180deg, transparent 0%, #2563eb04 22%, #2563eb18 65%, #2563eb2b 86%, #2563eb00 100%); animation: presence-scan 900ms cubic-bezier(.25,.4,.45,1) both; }
.presence-tint { position: absolute; inset: 0; background: #2563eb06; box-shadow: inset 0 0 0 1px #2563eb18; }
.presence-ripple { position: absolute; left: 3px; top: 3px; width: 12px; height: 12px; margin: -6px; border: 2px solid var(--presence-accent); border-radius: 50%; animation: presence-ripple 620ms 420ms ease-out both; }
@keyframes presence-scan { from { transform: translateY(-100%); opacity: 0; } 12% { opacity: 1; } 85% { opacity: 1; } to { transform: translateY(100%); opacity: 0; } }
@keyframes presence-ripple { from { transform: scale(.6); opacity: .7; } to { transform: scale(3.2); opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  .chalk-presence, .presence-cursor { transition: none; }
  .presence-band, .presence-ripple, .presence-tint { display: none; animation: none; }
}
`
