# Browser viewport presets

Choose **Viewport** above the browser page, or call the shared MCP tool.

```json
{"name":"browser_set_device","arguments":{"device":"phone"}}
```

| Device value | Selector label | CSS viewport |
| --- | --- | --- |
| `responsive` | Responsive | Follows the browser sidebar slot |
| `phone` | Phone | 390 × 844 |
| `tablet` | Tablet | 1180 × 820 |

Fixed viewports scale down to fit the sidebar. They remain centered horizontally and aligned to its top. Dragging the splitter changes the display scale while the CSS viewport stays fixed. Responsive restores the sidebar viewport.

The selector and MCP tool use the same main-process Browser owner. `browser_state` includes `device`. `browser_snapshot` reports the actual CSS viewport. Navigation, back, forward, reload, the start page, and closing the panel retain the choice. Agent browser focus opens the panel with that choice.

Page loading runs outside the metrics and capture queue, so users can navigate away from a stalled load even while a viewport update is pending. Captures and metric updates remain serialized. Chromium can delay a viewport update until navigation commits.

The choice persists in the existing application config. Scale is derived from the current slot and is never saved. Invalid saved choices fall back to Responsive. Runs with `CHALK_PROJECT_DIR` disable config writes and start with Responsive.

Screenshots contain page pixels without the sidebar backdrop or controls. Viewport captures use the selected CSS dimensions. Full-page captures use the document extent, with the existing 10,000-pixel height cap. Element captures use their CSS rectangles. Capture-to-canvas frames inherit the PNG dimensions.

These are viewport presets. They do not change the user agent, emulate touch, or inject viewport metadata. CDP uses `mobile:false` so a phone viewport remains 390 CSS pixels wide on pages with or without viewport metadata. Pages retain their own overflow and layout behavior.

Run `npm run typecheck`, `npm run build`, and `npm run e2e` sequentially. The Electron harness uses temporary projects and profiles. `scripts/browser-devices-e2e.mjs` checks viewport dimensions, media queries, captures, canvas frame dimensions, native bounds, scaled native input, navigation, concurrent capture, and preference restoration. Programmatic native input does not verify physical macOS focus, mouse input, or accelerators.
