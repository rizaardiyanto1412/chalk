import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { findFrame } from '../shared/model'
import { TOOLS, type ToolContext } from './tools'
import { frameDocument } from './frameHtml'

export const DEFAULT_PORT = 7801

/** HTML waiting to be measured before it lands on the canvas, keyed by a one-time token. */
export const previews = new Map<string, string>()
const TAILWIND_JS = readFileSync(createRequire(import.meta.url).resolve('@tailwindcss/browser'), 'utf8')

function buildMcp(ctx: ToolContext): McpServer {
  const server = new McpServer(
    { name: 'chalk', version: '0.1.0' },
    {
      instructions:
        'Chalk is a canvas design app on this Mac. Use get_canvas to see frames and what the user selected, get_frame (standalone=true for a full HTML document) and screenshot_frame to read a design, and get_design_guidelines to match its style. When asked to build a design in code, reproduce the frame exactly in the project\'s own stack.'
    }
  )
  for (const t of TOOLS) {
    server.registerTool(
      t.name,
      { description: t.description, inputSchema: t.input, annotations: { readOnlyHint: !!t.readOnly } },
      async (args: Record<string, unknown>) => {
        try {
          return { content: await t.run(args as never, ctx) }
        } catch (err) {
          return { content: [{ type: 'text' as const, text: `Error: ${(err as Error).message}` }], isError: true }
        }
      }
    )
  }
  return server
}

const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/

function send(res: ServerResponse, status: number, type: string, body: string | Buffer): void {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(body)
}

/**
 * One local HTTP server: the MCP endpoint for Claude Code and the in-app agent, plus frame pages and
 * assets for the canvas and the renderer. Only loopback Host headers are accepted, and /mcp refuses
 * browser requests (they carry an Origin header) so a web page cannot drive the tools.
 */
export function startServer(ctx: ToolContext, port: number): Promise<Server> {
  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (!LOCAL_HOST.test(req.headers.host ?? '')) return send(res, 403, 'text/plain', 'forbidden host')
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')

    if (url.pathname === '/mcp') {
      if (req.headers.origin) return send(res, 403, 'text/plain', 'browser requests are not allowed')
      const server = buildMcp(ctx)
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
      res.on('close', () => {
        void transport.close()
        void server.close()
      })
      await server.connect(transport)
      await transport.handleRequest(req, res)
      return
    }
    const previewMatch = url.pathname.match(/^\/preview\/([\w-]+)$/)
    if (previewMatch) {
      const html = previews.get(previewMatch[1])
      if (html === undefined) return send(res, 404, 'text/plain', 'no such preview')
      return send(res, 200, 'text/html; charset=utf-8', frameDocument({ name: 'Preview', html }, '/vendor/tailwind.js'))
    }
    if (url.pathname === '/vendor/tailwind.js') return send(res, 200, 'text/javascript', TAILWIND_JS)
    const frameMatch = url.pathname.match(/^\/frame\/([\w-]+)$/)
    if (frameMatch) {
      const f = findFrame(ctx.store.doc, frameMatch[1])
      if (!f) return send(res, 404, 'text/plain', 'no such frame')
      if (f.kind === 'image') return send(res, 200, 'text/html', `<!doctype html><body style="margin:0"><img src="/assets/${f.asset}" style="display:block;width:100%">`)
      return send(res, 200, 'text/html; charset=utf-8', frameDocument(f, '/vendor/tailwind.js'))
    }
    const assetMatch = url.pathname.match(/^\/assets\/([\w.-]+)$/)
    if (assetMatch) {
      const file = ctx.store.assetPath(basename(assetMatch[1]))
      if (!existsSync(file)) return send(res, 404, 'text/plain', 'no such asset')
      res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'max-age=31536000, immutable' })
      createReadStream(file).pipe(res)
      return
    }
    if (url.pathname === '/health') return send(res, 200, 'application/json', JSON.stringify({ ok: true, project: ctx.store.dir, frames: ctx.store.doc.frames.length }))
    send(res, 404, 'text/plain', 'not found')
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (!res.headersSent) send(res, 500, 'text/plain', String(err))
    })
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => resolve(server))
  })
}
