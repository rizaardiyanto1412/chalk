# Frame editing

The tool strip has **Add Desktop frame (1440 × 900)** and **Add Mobile frame (390 × 844)** buttons. Each creates an empty HTML frame to the right of the canvas contents, selects it, and brings it into view. Each creation takes one Undo.

**Edit > Select All** selects every frame outside native editing and selected-text contexts. Shift-click adds a frame to the selection. Delete removes all selected frames in one Undo step.

**Edit > Duplicate**, or Cmd+D on macOS and Ctrl+D elsewhere, copies selected HTML and image frames to the right of the selection with an 80-pixel gap. Copies preserve their relative positions, dimensions, HTML, and image source URL. Image duplicates reference the same project asset. One Undo removes the entire duplicate group.

**Edit > Copy**, **Cut**, and **Paste** support frame groups. Copy places the frame names on the native text clipboard and a private token for Chalk. Chalk holds a snapshot of the frames and image bytes in the main process. Paste centers the group in the canvas viewport, preserves relative positions, and creates fresh image assets in the destination project. Paste works after switching projects, even if the original image file changes after Copy. Each Cut and Paste takes one Undo.

Copying other text or an image replaces the token, so Paste cannot restore an older frame group. Frame snapshots are local to this running Chalk instance. Restarting the app loses them. Other applications receive the frame names as text. HTML markup is copied unchanged. Asset URLs inside HTML still refer to the destination project.

Editable inputs, chat text selections, the built-in browser, and live frame iframes retain native editing commands. Duplicate does nothing in those contexts. Clipboard commands run in order. Cut removes frames only after a successful native clipboard write. If the project or document changes while Cut waits, Chalk reports an error and leaves the frames in place.

Missing image files, traversal paths, symbolic links, asset folders that are links, and special files cause a visible error before Copy or Cut changes the clipboard. Existing version 1 documents retain their frames when opened. Clipboard validation does not migrate or discard them. Undo, Delete, and Cut never remove asset files. Arrangement controls, snapping, and OS image paste are outside this slice.

`scripts/frames-e2e.mjs` runs after the existing exact-frame-count persistence checks in `npm run e2e`. It uses temporary project folders and real Electron menu commands. Native dialogs and delayed clipboard writes are controlled at their Electron boundaries. No application test hooks are exposed. If Electron cannot gain OS window focus, the native browser routing check is explicitly skipped and writes an evidence file. It must be rerun in an unlocked desktop session.
