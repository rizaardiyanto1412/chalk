import type { HtmlFrame } from '../shared/model'

export const TAILWIND_CDN = 'https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4'
const ICONIFY_CDN = 'https://cdn.jsdelivr.net/npm/iconify-icon@2.3.0/dist/iconify-icon.min.js'

/** A standalone HTML document for a frame. `tailwindSrc` is local inside the app and the CDN for exports. */
export function frameDocument(frame: Pick<HtmlFrame, 'name' | 'html'>, tailwindSrc = TAILWIND_CDN): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(frame.name)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300..800&display=swap" rel="stylesheet">
<script src="${tailwindSrc}"></script>
<script src="${ICONIFY_CDN}"></script>
<style>html,body{margin:0}body{font-family:Inter,ui-sans-serif,system-ui,sans-serif;-webkit-font-smoothing:antialiased}iconify-icon{display:inline-block;vertical-align:middle}</style>
</head>
<body>
${frame.html}
</body>
</html>`
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
}
