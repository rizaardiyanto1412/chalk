# Guide Chalk's design taste

Chalk uses your references and project rules to guide the agent. Its style presets provide a starting point when you have no specific direction. These instructions do not train or fine-tune the model.

## Design from a reference

1. Drop a PNG or JPG onto the canvas, or capture a page from Chalk's browser.
2. Select the reference frame.
3. Describe the new screen and name what to preserve. For example, "Use this reference's typography and spacious layout for a train booking page. Keep the warm background, but use our own copy."

The agent is instructed to view the selected reference before it designs. For an existing HTML frame, it can also read the markup. Your request and references take precedence over the presets.

## Choose a starting style

Describe what you want in Chat. The agent chooses a direction from your request, references, and project rules; there are no Style or Variant controls to configure. To request a specific style, name it in your message.

Chalk includes 32 recipes. Six preserve the original presets. The other 26 cover editorial, technical, illustrated, product, graphic and photographic compositions with two curated variants each. These are original Chalk definitions, not imported templates or artwork. Variants replace complete palettes and change type, edge or elevation treatment. Imagery choices are local to each recipe. Omitting `imagery` uses the first listed mode. Use supplied or verified media, original diagrams, or explicit placeholders.

Visual priority follows this order:

1. Your current written instruction.
2. Selected image or browser references.
3. Project brand and `DESIGN.md`.
4. The chosen style.
5. The agent's own choice.

A small edit preserves the existing direction unless you request a restyle.

Through MCP, call `get_style()` for the compact catalog. Load an ID, Chalk display name or exact direction, for example `get_style({name: "Aerial Gravitas", variant: "atlas", imagery: "survey-lines"})`. The result includes composition, mobile behavior, supported font roles, semantic colors, font links and Tailwind v4 theme utilities. `name`, `variant` and `imagery` are the only accepted keys. Unknown fields, orphan choices and choices outside that recipe return errors.

Place `fontLinks` and `theme` before the fragment and apply `font-sans` to its root. New recipes supply `text-display`, `py-section`, `px-gutter`, `rounded-control`, `rounded-panel`, `shadow-raised`, `font-caption` and `font-mono` alongside semantic color utilities. The six original recipes retain their exact earlier payloads and themes.

The in-app agent and external MCP clients load the same registry through `get_style`.

## Save your project rules

Create a file named `DESIGN.md` in the project folder next to `chalk.json`. Open the project folder from Chalk's File menu.

Start with a few specific decisions:

```md
# Northline design direction

Use warm ivory backgrounds and deep forest green for primary actions.
Use Instrument Serif for large headings and Inter for controls and body copy.
Use route tables instead of a grid of destination cards.
Use clear prices in euros, including the fare basis.
Keep generous space between sections and compact spacing within each route row.
Avoid decorative gradients and floating badges.
```

Ask for the next screen. The `get_design_guidelines` tool reads the file each time it is called, so a new chat or app rebuild is unnecessary. Keep the file short. The tool reads up to 16 KB and marks longer content as truncated. Symbolic links and special files are rejected.

After feedback, update the file with the decision you want to keep. For example, replace "make it less busy" with "show at most four route rows before the secondary link." Chalk reads these notes but does not automatically write your feedback into them.

## Review a frame

Ask the agent to review the frame and repair the problems it finds. `review_frame` returns the rendered image and observations about horizontal overflow, content taller than the frame, failed image loads, and images still loading.

The agent still needs to inspect the screenshot for typography, hierarchy, spacing, and visual balance. A report without layout findings does not establish that the design looks good or meets accessibility requirements.

For Claude Code outside Chalk, use the same MCP tools. Call `get_canvas`, read the selected frame, and use its screenshot as the implementation reference. Existing design tokens and markup take precedence over choosing a new style.

## Verify style delivery

Run `npm run typecheck`, `npm run build`, then `npm run e2e`. The suite launches real Electron with temporary projects and a temporary profile. It checks the shared HTTP MCP catalog, frozen legacy payloads, 26 original composition fixtures at desktop and mobile sizes, alternate treatments, actual font loading and Chat prompt transport. Screenshots, computed measurements and a contact sheet go to the e2e artifact directory. Set `CHALK_E2E_ARTIFACTS` to choose that directory.

`CHALK_CLAUDE_PATH` is an explicit local executable override. Tests point it at `scripts/fixtures/fake-claude.mjs`, which answers the SDK control protocol and records outgoing prompts through `CHALK_FAKE_LOG`. The tests never execute your Claude CLI or access credentials. The fake does not evaluate live AI design quality. Font network failures are reported as named skips, separately from loaded font-face assertions.
