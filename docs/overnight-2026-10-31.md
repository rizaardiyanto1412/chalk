# Chalk overnight report, 31 October 2026

Work is in progress. The run closes at 07:00 Asia/Jakarta. This file will contain the final verified features, tests, installation result, and remaining gaps.

The baseline is commit `15e49c6` on `feature/pen-parity-overnight-20261031`, with 34 passing Electron checks. No changes are published remotely during this run.

The feature inventory is in [the parity checklist](pen-feature-parity.md). The append-only decision log is local at `.audit/decisions.tsv`, and continuation state is `.audit/overnight/state.json`.

Claude Code's expired OAuth session prevents generated-design comparisons. Work on canvas, browser, export, persistence, and MCP behavior continues independently.

## Accepted slices

Frame exports now support PNG, JPEG, HTML, and single-page PDF from the canvas toolbar, File menu, and shared MCP. Copy as PNG works for HTML and image frames. Local asset snapshots survive frame edits and project switches. The parent fixed the independent review findings on URL-context rewriting and loopback requests, plus overlapping UI exports and validation messages. HTML and CSS URL parsing use parse5 and postcss-value-parser.

The final export source passed typecheck, build, and 48/48 real Electron checks. Evidence is local under `.audit/overnight/slice-exports/`, with `*-parent.log` logs and `artifacts-parent/`. A separate PDFKit thumbnail check confirms red content in the HTML fixture PDF. It does not establish exact PDF color matching. The initial exact-color check failed due to a thumbnail color difference and remains in the audit. Image-frame JPEG and PDF checks currently verify signatures, not pixel content. Native save dialogs are stubbed and File menu commands are invoked through Electron. HTML frames reflow at browser width and remote resources still require the network.

Manual frames and group clipboard now work. Desktop and Mobile buttons create exact-size frames. Duplicate, Cut, Paste, and multidelete use one Undo per action. Cross-project image paste uses captured bytes and fresh destination assets. Review corrections clear stale transcript selection on canvas click, echo authoritative selection, run queued commands against their current selection while retaining the requested project epoch, and separate frame errors from export progress. A new Electron test reproduced the transcript-selection bug before the fix. Final typecheck, build, diff check, and 63 Electron checks pass. One native browser OS-focus check remains skipped because macOS is locked. Menu tests use Electron command invocation; physical accelerators are not verified. Evidence is `.audit/overnight/slice-frames/*-parent-final.log`.

Installed checkpoint `345677f` at `/Applications/Chalk.app` after packaging and ad-hoc signature verification. No existing Chalk session was running. The previous bundle is preserved at the path in `.audit/overnight/install-checkpoint.json`. The installed binary created and selected a 390×844 Mobile frame and exported a correctly sized PNG through MCP. Its 22 tools were listed successfully. The first Playwright Electron-launch smoke attempt stalled; the successful test launched the binary directly and attached to its own renderer through CDP. No AI generation was attempted.

Selection editing now includes group movement, held-arrow nudging with one Undo, exact and mixed geometry fields, six alignments, equal-gap distribution, and stacking. Independent review found no blocking defects. The parent enabled the iframe pointer shield on pointerdown and preserved live iframe state through resizing as well as movement. Final Electron checks cover immediate shielding, resize state, Undo cancellation, synthetic window blur, native editing focus, target removal, pointer cancellation, and project switches. Typecheck, build, diff check, and 74 checks pass; one native browser OS-focus check remains skipped. Evidence is `.audit/overnight/slice-arrangement/*-parent-final.log`. Undo can run before an arrangement queued behind a slow clipboard operation; this ordering limitation remains documented.
