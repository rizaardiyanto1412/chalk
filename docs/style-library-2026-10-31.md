# Chalk style library delivery

Chalk now includes 32 original style recipes. The six earlier presets keep their complete previous responses. The 26 new recipes cover every direction advertised in the inspected Pen skill, with two curated variants each. Direction names resolve to original Chalk recipes through the shared `get_style` tool.

## Behavior

The Chat composer has a Style choice and a Variant choice when a recipe has alternatives. The choice attaches to the next message and clears on send, New chat, or project change. Project changes preserve the typed draft. Main validates the canonical choice and places the complete resolved recipe into the actual agent prompt.

Current written instructions, references, and project brand rules take priority. A style choice does not restyle existing frames by itself. External MCP clients use the same catalog and resolver. Unsupported parameters return errors rather than silently selecting a default.

New recipes include original composition and mobile guidance, supported font roles, semantic colors, responsive display sizes and spacing, imagery guidance, radii, and elevation. Alternate variants change a non-color treatment. Heading scales, gutters, and alternate edges are tuned to the direction rather than shared across the entire catalog.

See [Guide Chalk's design taste](design-taste.md) for the controls, MCP arguments, and theme utilities.

## Verification

Parent verification after review fixes passed 173 checks, failed none, and recorded two skips. Typecheck, build, and `git diff --check` passed. The build retains the existing ineffective dynamic-import warning for `tools.ts`.

The real Electron suite checks the HTTP MCP schema, all 32 recipes, explicit mappings for all 26 directions, and every existing field of the six frozen baseline payloads. It renders 26 original composition examples at desktop and mobile widths, plus each alternate at mobile width, for 78 cases. Checks cover geometry, semantic colors, contrast arithmetic, responsive sizes, spacing, radii, shadows, and actual loaded font faces. All 52 variant font cases passed with no font-network skip.

Chat checks drive the real controls and inspect the prompt received by a local executable through the actual Claude Agent SDK. They cover the full resolved recipe, reference priority, reset behavior, preserved drafts, hidden single-option variants, and invalid sends.

Independent review found six weak desktop assertions and an incomplete color-band example. Those assertions now check horizontal relationships or band proportions, and the example contains three solid fields and an original diagram. Review also led to the single-option Variant fix and a stronger invalid-IPC check.

Temporary defects verified that checks detect a dropped recipe at the SDK boundary, an unreadable accent foreground through contrast arithmetic, and broken mobile stacking through frame geometry. Six deliberate desktop regressions also fail the strengthened checks, and the restored examples pass. A later review caught a color-only alternate whose shadow differed only in color. The test now ignores shadow color when comparing shape, rejects that case, and verifies the corrected flat alternate.

Local command logs, measurements, screenshots, review reports, and installation records are under `.audit/styles-expansion/`. They are excluded from the repository. The reusable tests and original fixtures are committed with the source.

## Limits

The examples are authored test fixtures. They establish recipe rendering and delivery, not live AI design quality. Live quality remains unmeasured because the local Claude login retry failed with expired OAuth. Physical macOS input remains unverified while the desktop is locked; programmatic input and menu checks pass.

These recipes cover the observed directions. They do not reproduce Pen's proprietary server prompt, artwork, presets, or generated results. An independent comparison found no shared five-word sequence or exact hex color between the new recipe text and the inspected Pen direction text. That check does not prove the absence of close paraphrase.

Some examples reuse small test components and diagrams. Chat uses the recipe's first imagery mode, which can be changed explicitly through MCP. The transcript does not retain a separate style badge after a message is sent. The app continues to use the local Claude CLI; this change does not switch it to CLI Proxy.
