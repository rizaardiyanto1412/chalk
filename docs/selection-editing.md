# Selection editing

Click a frame to select it. Click inside that selected frame to select a UI element. Cmd-click picks an element directly from any HTML frame. Shift-click toggles an element when elements in that frame are selected. Otherwise Shift-click toggles the frame. Dragging a frame still moves it. Double-click enters live mode.

With Select, drag from empty canvas to draw a marquee. Its accent outline and fill follow the pointer. Frames fully inside it take priority. If it only partly overlaps one HTML frame, it selects the meaningful elements under the box. The search descends into elements that contain the entire intersection with the frame. Other intersecting elements become selections. If several frames partly overlap, those frames become the selection. Outlines preview the result before release. Shift held at release adds frames to frames, or elements to elements in the same frame. A click on empty canvas clears selection. Space-drag, Hand, middle mouse, trackpad scroll, and pinch keep their pan and zoom behavior.

Hover over a selected frame to outline the element under the pointer. Hold Cmd to preview elements in other frames. Each selected element has an outline. One union box has four corner handles and a size badge. The badge shows rounded CSS pixels at every canvas zoom. A single element keeps its existing appearance. Empty wrapper divs with the same box as their single child resolve to that child. Script, style, link, and meta elements are ignored.

Escape with several elements selected selects their frame. With one element, Escape selects its parent. Repeat Escape to reach the frame, then clear selection. Delete or Backspace removes all selected elements from saved HTML in one change. Nested selections remove the ancestor once. Source ranges are removed from the end of the HTML. One Undo restores the exact HTML. With no element selected, Delete removes selected frames.

The Frames panel shows one element's tag, short text, and size. For several elements it shows "N elements" and their union size. The chat composer also shows "N elements". Agent turns and `get_canvas` use `selectedElements`, an array of records with frame id and name, path, tag, text, CSS rectangle, and up to 2000 characters of saved outer HTML. There is no singular `selectedElement` field. The path is an array of element child indexes starting at body. Existing frame editing tools can change that HTML without another MCP tool.

Selection follows frame movement, canvas pan and zoom, and HTML reloads. Reloads resolve the same path. Paths that no longer exist are removed from the selection. Project changes clear selection. Structural edits can change which element occupies a path.

Frames keep their opaque sandbox origin. Only canvas frame documents receive the hit-test script. Exports and standalone `get_frame` output do not include it. The renderer accepts replies only from the requested iframe window, with a matching request id and validated arrays of paths and rectangles. Messages cannot issue edits. The main process resolves context and deletion against saved HTML, so live scripts cannot insert content into the saved fragment.

Dragging any selected frame moves the entire selection by the same rounded canvas delta. The group keeps its relative layout and takes one Undo. Pressing a selected frame preserves the selection until release. An unmodified release without a drag collapses a multi-frame selection to that frame. A label click selects just the frame. Shift-click adds or removes a frame. The Frames panel supports the same toggle.

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

Inputs, textareas, selects, contenteditable elements, selected chat text, and live iframes retain native shortcuts. The built-in browser keeps its existing native command routing. Frame element selection adds context to the agent and `get_canvas`. Browser and clipboard commands keep their existing behavior.

`updatedAt` retains its existing meaning as the timestamp of any actual frame patch, including position edits. The renderer keeps a separate iframe source revision based on frame identity, project, HTML, and name. Moving, nudging, or resizing a frame does not change that revision, replace the iframe node, or reload its interactive state. HTML or name changes still request the existing buffered frame reload. Export and standalone rendering paths remain unchanged.

Arrangement commands share the frame-command queue with clipboard operations. Undo runs immediately. If an earlier clipboard operation is slow, Undo can apply before a queued arrangement command. That arrangement can then create a new history entry and clear Redo. This ordering limitation remains unresolved.

`scripts/arrangement-e2e.mjs` runs within `npm run e2e`, after the exact-count persistence checks and frame clipboard checks. It uses temporary projects, a temporary Electron profile, app-driven renderer input, Electron menu callbacks, and the existing local `get_canvas` tool. The profile is shared only across the restart checks within one suite run. It does not prove physical keyboard accelerators or OS focus on a locked desktop. The existing browser focus check records a skip when macOS cannot focus Electron.

`scripts/elements-e2e.mjs` and `scripts/marquee-e2e.mjs` run within `npm run e2e`. They check element picks, hover, the CSS size badge, parent traversal, deletion and Undo, overlay movement and reloads, agent context, and forged frame messages. Marquee checks cover frame and element previews, union sizes, Shift toggles and additions, atomic deletion, nested paths, cancellation, and panning.
