# Chalk overnight report, 31 October 2026

The updated application is installed at `/Applications/Chalk.app`. Its verified source is `4582275a5a87ac0d3ec17345415a727af1517298` on `feature/pen-parity-overnight-20261031`. Delivery verification finished at 06:40 Jakarta. The run closed at 07:00 Jakarta. Both overnight schedules are disabled with no next run.

All changes are local. Nothing was pushed, deployed, or sent externally. User projects were not deleted. The previous installed bundles remain at `/Applications/.Chalk-before-final-20261030T233913Z.app` and `/Applications/.Chalk-before-20261030T205754Z.app`.

## Delivered overnight

- **Frame exports.** PNG, JPEG, HTML, and single-page PDF from the toolbar, File menu, and shared MCP. Copy as PNG works for HTML and image frames. Asset bytes and frame contents are captured before asynchronous work, so exports retain their original project snapshot. [Export behavior and limits](frame-exports.md).
- **Manual frame editing.** Desktop 1440×900 and Mobile 390×844 creation, mixed HTML/image duplication, Cut/Copy/Paste across projects, and grouped Undo. Image paste uses captured bytes and fresh destination asset names. [Frame editing](frame-editing.md).
- **Selection geometry and arrangement.** Group drag, Shift selection, repeated-arrow nudging with one Undo, exact and mixed X/Y/W/H fields, six alignments, equal-gap distribution, and stacking. Moving and resizing retain live iframe input and counter state. Pointer shielding starts before the first drag movement. [Selection editing](selection-editing.md).
- **Browser viewport presets.** Responsive, Phone 390×844, and Tablet 1180×820 through the UI and `browser_set_device`. Fixed CSS viewports fit the sidebar without covering the canvas. Picking and viewport/full-page/element captures use the correct CSS dimensions. The selection persists across restart. Users can navigate away from a stalled response while a viewport update is pending. [Browser presets](browser-viewports.md).

## What REA established

REA 6.7.0 inspected the installed Pen 1.2.21 archive and built static graphs for selected application modules. The archive SHA-256 is `6020b5d71f5b701ef3a523f7e612a24d3d0ff18f151c5d5e705689ca65a6219a`. Extraction recorded 38 integrity mismatches among unpacked files; those bytes were treated as untrusted and never executed.

Bundled evidence exposed style archetypes, screen-specific guides, screenshot review, export commands, canvas arrangement, browser presets, conversation storage, and import capabilities. It did not reveal model weights, training data, a complete server-side prompt, or live server behavior. Chalk uses original code and guidance; Pen's proprietary source, prose, templates, and artwork are not included.

Before this overnight run, Chalk already had six original styles, semantic Tailwind tokens, screen guides, project `DESIGN.md`, reference-first instructions, and `review_frame`. Those are the baseline, not new overnight delivery. [Research details](pen-research.md), [design taste guide](design-taste.md), and [remaining parity checklist](pen-feature-parity.md).

## Verification and installation

The final source passed `npm run typecheck`, `npm run build`, the full real Electron suite, and `git diff --check`: **84 passed, 1 skipped, 0 failed**. These are cumulative checks, not counts to add across slices.

| Accepted slice | Local commit | Verification |
| --- | --- | --- |
| Exports | `6d241ce` | 48 passed |
| Manual frames and clipboard | `345677f` | 63 passed, 1 skipped |
| Selection editing | `b74c49f` | 74 passed, 1 skipped |
| Browser presets and review repairs | `4582275` | 84 passed, 1 skipped |

Each slice received independent static review. Accepted repairs were tested against the final source. Tests cover export artifact bytes, clipboard pixels, project snapshots and epochs, grouped history, live iframe state, native bounds, CSS dimensions, scaled programmatic input, navigation, stalled-load recovery, and preference restart. The final Electron profile path was checked against the actual temporary profile.

`npm run dist` produced the application. Ad-hoc signing and strict signature verification passed. The installed ASAR hash matches the packaged archive: `cb1042d8712e07e1077da8b18fdd35622253e9fbb8bc34cbeb019150f9deef41`. No existing Chalk session was running during replacement.

An installed-binary smoke with a temporary profile and project verified Mobile creation, selection, PNG 390×844, geometry edits, Phone 390×844 and Tablet 1180×820 CSS viewports, the phone PNG, and 23 shared MCP tools. It used a local fixture without viewport metadata and made no AI calls.

Evidence stays local in `.audit/overnight/`: `slice-browser-devices/*-parent-release.log`, `slice-browser-devices/verification-parent-release.json`, `final-install.json`, `final-installed-smoke.json`, and the earlier slice folders. `final-install-smoke.mjs` reruns installed delivery checks. The first smoke carried an incorrect manually typed commit label; its record is preserved. The corrected run asserts the full recorded commit and installed archive hash before launch.

## Limits and unfinished work

- Claude Code OAuth is expired. No generated-design comparison ran, and design-quality parity is not established. No credentials or Pen limits were changed.
- The desktop was locked. Physical mouse input, keyboard accelerators, and macOS focus behavior remain unverified. The final suite explicitly skips physical input. Programmatic menu routing and native input passed.
- Browser presets do not change user agents or emulate touch. Chromium can delay a viewport update until navigation commits. Full-page capture retains its 10,000px height cap; picker labels scale with the page.
- HTML exports retain remote CDNs, fonts, and remote images; script-generated asset URLs are not embedded. HTML frames reflow at browser width. PDF uses Chromium print styles and clips to one page. HTML-fixture PDF content was checked with a thumbnail, but exact color matching was not established. Some image-frame JPEG/PDF checks verify signatures only. Save dialogs were stubbed and menu commands invoked programmatically.
- Undo runs immediately while arrangement shares the clipboard queue. Undo can precede an arrangement waiting behind slow clipboard I/O, and that later arrangement can clear Redo.
- Run-scoped agent isolation remains a prerequisite for chat persistence. Static inspection found that an awaited tool mutation could cross a project switch; that agent scenario was not runtime-reproduced. Persistent chats, editable website import, project browser restoration, shared tokens, snapping, appearance settings, SVG import, portable projects, linked components, and live browser canvas nodes remain unfinished. Designs and research are recorded separately from shipped features.

The audit records decisions and failed experiments as well as accepted results. There is a clock-record gap between roughly 21:17 and 23:11 UTC; no active implementation is claimed for that interval.
