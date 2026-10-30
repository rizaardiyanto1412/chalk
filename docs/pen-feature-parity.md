# Pen feature parity checklist

This checklist compares Pen 1.2.21's bundled code and schemas with Chalk. It records partial features explicitly. Bundled evidence establishes available code, not successful live server behavior.

The overnight run starts from Chalk commit `15e49c6` with 34 passing Electron checks. Its deadline is 07:00 Asia/Jakarta on 2026-10-31. The final results belong in [the morning report](overnight-2026-10-31.md).

| Priority | Capability | Chalk at baseline | Overnight status | Pen evidence |
| --- | --- | --- | --- | --- |
| 1 | Image export and PNG clipboard | HTML export and copy exist; no PNG or JPEG export or image clipboard. | Verified PNG/JPEG/HTML/PDF export, PNG clipboard, toolbar/File menu and shared MCP. 48 Electron checks pass. | `out/menu.js` export selection menu; editor `copy-as-png` command. |
| 2 | Manual frames, duplication, frame clipboard | Frames require agent output or image import. | Verified desktop/mobile creation, mixed duplication, frame clipboard across projects, and atomic undo. Native browser OS-focus check remains skipped on locked macOS. | Editor frame tool, duplicate command, paste commands. |
| 3 | Selection inspector and arrangement | Rename and resize exist. Shift selects several frames, but drag moves one. | Verified group drag, repeat-coalesced nudge, exact/mixed geometry, alignment, equal-gap distribution, stacking, and live iframe state preservation. 74 checks pass with one native-focus skip. | Editor alignment, nudge, select-all, stacking commands. |
| 4 | Responsive browser presets | Browser uses sidebar width. | Verified Responsive, Phone390×844 and Tablet1180×820 viewports, shared MCP, persistent choice, scaled picking and capture dimensions. 84 checks pass with one physical-input skip. UA and touch parity deferred. | Browser device handling and device dimensions in editor bundle. |
| 5 | Persistent conversations | Messages and session state remain in memory. | Queued. | `out/chat-store.js`; `out/chat-database.js`. |
| 6 | Editable website import | Browser capture creates a screenshot. | Queued for a local DOM-to-HTML implementation. | `import_website` schema and `out/browser-import/`. Pen's import runs on its servers. |
| 7 | Project browser restoration | Recent URL list exists. Current page and scroll do not restore. | Queued. | `out/browser-page-states.js`; browser-node IPC state handling. |
| 8 | Project design tokens | Presets return tokens for independent frame markup. There is no shared project token sheet. | Queued. | Variable operations in `execute.md` and variable references in `pen-schema.md`. |
| 9 | Snapping and guides | Positions round to pixels. No configurable snapping or guides. | Queued. | Editor snap-to-grid, snap-to-objects, and pixel-grid commands. |
| 10 | Appearance and chat text size | Fixed application chrome and chat size. | Queued. | `out/menu.js` appearance and chat-size settings. |
| 11 | SVG import | Native raster image drop; no explicit SVG flow. | Queued for safe isolated image handling. | `out/menu.js` image, SVG, and Figma import entry. |
| 12 | Portable project export | Users can copy the project folder manually. | Queued. | Export Snapshot dialog. Pen's exact snapshot format is unconfirmed. |
| 13 | Linked components and overrides | Whole HTML frames are independent. | Large architectural gap. Investigate after foundational editing flows. | Components guide and Create Component command. |
| 14 | Live browser nodes on canvas | One browser sidebar and static reference images. | Large architectural gap. URL-backed references are a smaller useful step. | Whiteboard guide and Browser node schema. |

## Existing capabilities

Chalk already supports canvas pan and zoom, fit, image drop, frame rename and resize, Shift multiselection, undo and redo, browser menus and element picking, screenshots, HTML export, Claude MCP, six original styles, screen guides, project design notes, and rendered layout review.

## Research evidence

The local REA extraction and hash summary remain under `.audit/pen-rea/`. A fresh REA static graph for menu, capture, chat, and workspace modules is `.audit/overnight/pen-features-application.json`, Evidence `ev_2b96ae862d40167dcdffb11f548be7615e12d351814de6112423fddac9a2f835`. Selected input hashes are in `.audit/overnight/research-inputs.json`. These files are local-only.

`out/snapshot-store.js` stages temporary PNGs. It does not establish that Pen has document version history. No feature is marked implemented until its user-visible flow passes verification.
