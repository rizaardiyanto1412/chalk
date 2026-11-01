#!/usr/bin/env node
import { createInterface } from 'node:readline'
import { appendFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
const session = randomUUID()
const write = value => process.stdout.write(JSON.stringify(value) + '\n')
const log = value => { if (process.env.CHALK_FAKE_LOG) appendFileSync(process.env.CHALK_FAKE_LOG, JSON.stringify(value) + '\n') }
log({ type: 'spawn', argv: process.argv.slice(2) })
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line)
  log(message)
  if (message.type === 'control_request') {
    write({ type: 'control_response', response: { subtype: 'success', request_id: message.request_id, response: message.request.subtype === 'initialize' ? { commands: [], output_style: 'default', available_output_styles: ['default'], models: [], account: {} } : {} } })
  } else if (message.type === 'user') {
    await new Promise(resolve => setTimeout(resolve, 350))
    write({ type: 'system', subtype: 'init', session_id: session, tools: [], mcp_servers: [], model: 'fake-local', permissionMode: 'dontAsk', cwd: process.cwd(), uuid: randomUUID(), apiKeySource: 'none' })
    const presence = JSON.stringify(message).includes('[presence-fixture]')
    if (presence) {
      write({ type: 'assistant', session_id: session, parent_tool_use_id: null, uuid: randomUUID(), message: { id: randomUUID(), type: 'message', role: 'assistant', model: 'fake-local', content: [{ type: 'tool_use', id: randomUUID(), name: 'mcp__chalk__browser_snapshot', input: {} }], stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } })
      await new Promise(resolve => setTimeout(resolve, 5200))
    }
    write({ type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['Local transport fixture. No AI request was made.'], duration_ms: presence ? 5550 : 1, duration_api_ms: 0, num_turns: 1, total_cost_usd: 0, session_id: session, uuid: randomUUID(), usage: { input_tokens: 0, output_tokens: 0 }, modelUsage: {}, permission_denials: [] })
  }
}
