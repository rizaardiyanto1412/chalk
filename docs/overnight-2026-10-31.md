# Chalk overnight report, 31 October 2026

Work is in progress. The run closes at 07:00 Asia/Jakarta. This file will contain the final verified features, tests, installation result, and remaining gaps.

The baseline is commit `15e49c6` on `feature/pen-parity-overnight-20261031`, with 34 passing Electron checks. No changes are published remotely during this run.

The feature inventory is in [the parity checklist](pen-feature-parity.md). The append-only decision log is local at `.audit/decisions.tsv`, and continuation state is `.audit/overnight/state.json`.

Claude Code's expired OAuth session prevents generated-design comparisons. Work on canvas, browser, export, persistence, and MCP behavior continues independently.

## Accepted slices

Frame exports now support PNG, JPEG, HTML, and single-page PDF from the canvas toolbar, File menu, and shared MCP. Copy as PNG works for HTML and image frames. Local asset snapshots survive frame edits and project switches. The parent fixed the independent review findings on URL-context rewriting and loopback requests, plus overlapping UI exports and validation messages. HTML and CSS URL parsing use parse5 and postcss-value-parser.

The final export source passed typecheck, build, and 48/48 real Electron checks. Evidence is local under `.audit/overnight/slice-exports/`, with `*-parent.log` logs and `artifacts-parent/`. A separate PDFKit thumbnail check confirms red content in the HTML fixture PDF. It does not establish exact PDF color matching. The initial exact-color check failed due to a thumbnail color difference and remains in the audit. Image-frame JPEG and PDF checks currently verify signatures, not pixel content. Native save dialogs are stubbed and File menu commands are invoked through Electron. HTML frames reflow at browser width and remote resources still require the network.

Manual frames and group clipboard now work. Desktop and Mobile buttons create exact-size frames. Duplicate, Cut, Paste, and multidelete use one Undo per action. Cross-project image paste uses captured bytes and fresh destination assets. Review corrections clear stale transcript selection on canvas click, echo authoritative selection, run queued commands against their current selection while retaining the requested project epoch, and separate frame errors from export progress. A new Electron test reproduced the transcript-selection bug before the fix. Final typecheck, build, diff check, and 63 Electron checks pass. One native browser OS-focus check remains skipped because macOS is locked. Menu tests use Electron command invocation; physical accelerators are not verified. Evidence is `.audit/overnight/slice-frames/*-parent-final.log`.
