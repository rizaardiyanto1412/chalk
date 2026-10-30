# Selection editing

Dragging any selected frame moves the entire selection by the same rounded canvas delta. The group keeps its relative layout and takes one Undo. Pressing a selected frame preserves the selection until release. An unmodified release without a drag collapses the selection to that frame. Shift-click adds or removes a frame. The Frames panel supports the same toggle.

Arrow keys move selected frames by one canvas pixel. Shift-arrow moves them by ten. Holding an arrow key previews each repeat and commits once when the last held arrow is released. One Undo restores the entire gesture. A zero-distance gesture creates no history entry.

The Frames panel contains these selection controls.

| Control | Behavior |
| --- | --- |
| X and Y | A single frame's exact coordinate. For multiple frames, the selection's minimum coordinate. A change translates the group without changing relative positions. Fractional coordinates are preserved. |
| W and H | The common size, or an empty field labeled Mixed when sizes differ. A change sets every selected frame's size. Sizes round to whole pixels. Width is limited to 200 through 3840 and height to 100 through 12000. The resize handle uses these same limits. |
| Align left, horizontal centers, and right | Aligns at least two frames against the selection's outer horizontal bounds. |
| Align top, vertical centers, and bottom | Aligns at least two frames against the selection's outer vertical bounds. |
| Distribute horizontally and vertically | Requires at least three frames. Sorts by the chosen coordinate and gives every neighboring pair an equal edge-to-edge gap across the selection's outer bounds. Sizes remain unchanged. Overlapping selections can have negative gaps. |
| Bring to front and send to back | Moves the selected group to the end or start of document order while preserving its internal order. The last frame draws on top. |
| Bring forward and send backward | Moves selected frames across one neighboring unselected frame. Selected frames retain their relative order. |

Enter and blur commit a changed geometry field once. Escape discards the field edit. Empty and invalid input resets to the current value. Commands that leave geometry or order unchanged do not create Undo entries. Every arrangement action uses one atomic Store batch.

The main process computes arrangement against the current document. Commands identify their frame targets and project epoch. A stale project epoch or any missing target cancels the command. Project switches remount transient canvas state. Selection removal, target deletion, pointer cancellation, native editing focus, and window focus loss cancel active gestures. Undo and edit menu commands also discard transient previews. During a canvas pointer gesture, iframe pointer input is temporarily disabled so live content cannot take the pointer away from the drag. Release or cancellation restores iframe interaction.

Inputs, textareas, selects, contenteditable elements, selected chat text, and live iframes retain native shortcuts. The built-in browser keeps its existing native command routing. No new browser, agent, clipboard, or MCP commands are part of selection editing.

`updatedAt` retains its existing meaning as the timestamp of any actual frame patch, including position edits. The renderer keeps a separate iframe source revision based on frame identity, project, HTML, and name. Moving, nudging, or resizing a frame does not change that revision, replace the iframe node, or reload its interactive state. HTML or name changes still request the existing buffered frame reload. Export and standalone rendering paths remain unchanged.

Arrangement commands share the frame-command queue with clipboard operations. Undo runs immediately. If an earlier clipboard operation is slow, Undo can apply before a queued arrangement command. That arrangement can then create a new history entry and clear Redo. This ordering limitation remains unresolved.

`scripts/arrangement-e2e.mjs` runs within `npm run e2e`, after the exact-count persistence checks and frame clipboard checks. It uses temporary projects, a temporary Electron profile, app-driven renderer input, Electron menu callbacks, and the existing local `get_canvas` tool. The profile is shared only across the restart checks within one suite run. It does not prove physical keyboard accelerators or OS focus on a locked desktop. The existing browser focus check records a skip when macOS cannot focus Electron.
