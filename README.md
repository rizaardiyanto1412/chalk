# Easel

Easel is a Mac design app. You describe a screen, and an agent designs it on an infinite canvas. The agent runs on your own Claude Code login, so it needs no extra subscription.

## What it does

- **Canvas.** Each design is a frame of real HTML and Tailwind CSS v4. Pan with the trackpad, zoom with pinch or ⌘ + scroll, and drag frames by their name label. Double-click a frame to click inside the design. ⌘Z undoes canvas changes.
- **Agent.** The right panel sends your prompt to Claude Code. The agent creates frames, takes a screenshot of each one, and refines what it sees. Select frames first to ask for changes to them.
- **Built-in browser.** The Browser tab opens any site, including `localhost`. The agent can navigate, read menus, click, type, take screenshots, and measure a page's fonts and colors. Use **Pick element** to show the agent which part to redesign. Use **Capture** to put a full-page screenshot on the canvas.
- **MCP server for Claude Code.** While Easel is open, Claude Code in any project can read your frames and build them in code.

## Install

```sh
npm install
npm run install-app   # builds, signs ad-hoc, and copies Easel.app to /Applications
```

Easel needs Claude Code installed and signed in (`claude` must run in Terminal).

## Use your designs from Claude Code

Run this once:

```sh
claude mcp add --scope user --transport http easel http://127.0.0.1:7801/mcp
```

Then, in your project, ask Claude something like "Build the selected Easel frame as a React component." Claude calls `get_canvas` to find the selection, `get_frame` and `screenshot_frame` to read the design, and `get_design_guidelines` to match its style.

## Projects

A project is a folder. `easel.json` holds the frames, and `assets/` holds browser captures. The default project is `~/Easel/Untitled`. Use File → New Project or Open Project to switch.

## Development

```sh
npm run dev          # run with hot reload
npm run typecheck
npm run build && npm run e2e             # 21 end-to-end checks against the real app
node scripts/agent-run.mjs runs/x "prompt"   # drive a real agent run and save renders
```

`src/main/tools.ts` holds the one tool registry. The MCP server and the in-app agent both use it. `src/main/prompt.ts` holds the design guide and the agent instructions.

## Security

The server listens on 127.0.0.1 only. It accepts only loopback `Host` headers, so DNS rebinding fails. The `/mcp` endpoint rejects any request with an `Origin` header, so web pages cannot call the tools. The agent can use only Easel's tools plus web fetch and search. It cannot run shell commands or write files.
