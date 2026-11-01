# Agent presence

Chalk shows a blue cursor with a Chalk name tag while an agent uses the browser or canvas. Page reading and captures play a 900 ms scan. Clicks and typing move the cursor to the element in 420 ms and play a ripple. Scrolling moves the cursor to the viewport center. Frame tools move the canvas cursor to the frame label and scan the frame at the current zoom.

The chat status shows Chalk, the model when known, the latest activity, and elapsed time. The timer updates each second during a turn. Completion keeps the existing Done message. Cursors fade after three seconds without another action or when the turn ends. Reduced motion keeps the cursors and status static and removes sweeps, ripples, and pulsing.

The shared tool registry drives one typed presence state for in-app and external MCP calls. The main process sends that state to the renderer. The browser controller lives in an isolated JavaScript world and holds a closed shadow root without a window global. Its fixed host cannot intercept input or change page layout. Every browser capture hides the host in a try/finally block. Snapshots and style extraction skip it.

`scripts/presence-e2e.mjs` runs with `npm run e2e`. It checks cursor placement, capture pixel equality, snapshot and style equality, page isolation, canvas interaction, chat timing, fading, and reduced motion. Screenshots and observations appear in `e2e-artifacts/presence`.
