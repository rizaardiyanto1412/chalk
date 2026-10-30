# Guide Chalk's design taste

Chalk uses your references and project rules to guide the agent. Its style presets provide a starting point when you have no specific direction. These instructions do not train or fine-tune the model.

## Design from a reference

1. Drop a PNG or JPG onto the canvas, or capture a page from Chalk's browser.
2. Select the reference frame.
3. Describe the new screen and name what to preserve. For example, "Use this reference's typography and spacious layout for a train booking page. Keep the warm background, but use our own copy."

The agent is instructed to view the selected reference before it designs. For an existing HTML frame, it can also read the markup. Your request and references take precedence over the presets.

## Choose a starting style

Ask the agent to list the styles, choose one by name, or let it choose a direction for a new project. For example, "Design a coffee subscription landing page in the Field Notes style."

The styles cover precise product UI, warm editorial layouts, dark developer products, product photography, dense data views, and expressive consumer products. Each returns composition and imagery guidance, fonts, semantic colors, and a Tailwind v4 theme snippet.

To inspect the presets through MCP, call `get_style` without arguments. Pass a listed name to load its full definition.

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
