# Pen's design workflow

Pen 1.2.21 ships a design workflow that combines visual style references, guides for different screen types, and repeated screenshot inspection. Chalk implements these ideas with its own guidance and HTML renderer.

## What the installed app reveals

The inspected artifact is `/Applications/Pen.app/Contents/Resources/app.asar`. Its SHA-256 is `6020b5d71f5b701ef3a523f7e612a24d3d0ff18f151c5d5e705689ca65a6219a`.

These findings come from files in that artifact. They describe this installed version, not every Pen release.

| Observation | Bundled evidence | Consequence for Chalk |
| --- | --- | --- |
| Pen lists 26 visual archetypes. Its `get_style` tool lists styles, loads one, and supports parameters. | `out/skills/pen-dev/SKILL.md`; `out/editor/assets/index.js` contains the style registry and tool schema. | Provide original style presets with composition, type, palette, density, and imagery guidance. |
| The design skill routes tasks to separate guides for landing pages, web apps, mobile apps, tables, and other formats. | `out/skills/pen-dev/guide/`; the skill's reference table. | Load guidance for the requested screen type instead of applying dashboard rules to every design. |
| The skill asks the agent to verify sections as it builds, inspect clipping and alignment, and update existing objects to repair problems. | `out/skills/pen-dev/SKILL.md`. | Give the agent screenshots and objective layout diagnostics, then ask it to repair the existing frame. |
| The Claude adapter uses the Claude Code preset, app tools, and skills. | `node_modules/@ha/agent/src/claude/index.ts`, especially its `query` options. | Keep design capabilities in Chalk's shared MCP registry so the in-app agent and external Claude clients can use them. |
| Bundled skills can refresh independently of the app. | `out/skills-manager.js` reads a version manifest and stages skill bundles. | Keep Chalk's design knowledge separate from its canvas implementation. No remote skill updater is needed for this change. |
| Pen uses a custom document schema, node operations, components, and a custom renderer. | `out/skills/pen-dev/pen-schema.md`; `execute.md`; editor bundle. | Preserve Chalk's HTML and Tailwind model. Replacing it with Pen's format is a separate project. |

These files support a practical explanation for Pen's design behavior. They do not establish that any one mechanism causes better output. No model weights, training data, or complete server-side prompt were recovered.

## How REA was used

[REA](https://github.com/morluto/rea) 6.7.0 ran locally through its CLI. It extracted the installed archive and built a static JavaScript application graph for selected desktop modules. Pen code was not executed during this analysis.

The initial extraction rejected an integrity mismatch in an unpacked executable. A second extraction used REA's `record-and-continue` policy. It recorded 38 mismatches among unpacked files. Those bytes remain untrusted. This is not proof of tampering or proof that the files match their publisher's originals.

Research files stay in the ignored `.audit/pen-rea/` directory. These evidence files are local-only and are not published with the repository. The extraction Evidence is `ev_f5e51f5f15612bcc685fd4df852bb7eb0ff9c3db6c57657e0bb4ac9fb0d7d47e`.

The local evidence files include:

- `extraction.json`, the archive inventory, extracted file hashes, output directory, and integrity limitations.
- `application.json`, the static graph for selected desktop modules. Its source selection is partial.
- `summary.json`, selected file hashes verified against the extracted bytes, plus the style names listed in the bundled skill.
- `summarize.mjs`, the script that regenerates the summary from the extraction Evidence.

To repeat the archive extraction with the same REA release:

```sh
npm exec --yes --package=rea-agents@6.7.0 -- rea extract-artifact "/Applications/Pen.app/Contents/Resources/app.asar" --integrity-policy record-and-continue --format json
```

The command writes an Evidence record to standard output and extracts files into a temporary directory. It does not register an MCP server or change Pen.

## What Chalk adopts

Chalk uses its own style registry, screen guides, and project design notes. The registry returns concrete Tailwind theme tokens so a style can survive across frames. User instructions, an existing brand, and selected references take precedence over a preset.

Frame review returns a rendered image together with layout and image-loading observations. These observations help find rendering defects. They do not grade taste, prove accessibility, or replace looking at the image.

This is a local implementation of the observed workflow. It does not reproduce Pen's server-side image generation, website import, multiplayer document model, or complete rendering engine. Pen's prose, style definitions, templates, and artwork are not included in Chalk.
