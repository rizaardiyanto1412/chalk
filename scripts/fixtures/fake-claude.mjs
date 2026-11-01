#!/usr/bin/env node
import { createInterface } from 'node:readline'
import { appendFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
const resume = process.argv.find(arg => arg.startsWith('--resume='))?.slice('--resume='.length)
const session = resume || randomUUID()
const write = value => process.stdout.write(JSON.stringify(value) + '\n')
const log = value => { if (process.env.CHALK_FAKE_LOG) appendFileSync(process.env.CHALK_FAKE_LOG, JSON.stringify(value) + '\n') }
log({ type: 'spawn', argv: process.argv.slice(2), session, cwd: process.cwd() })
for await (const line of createInterface({ input: process.stdin })) {
  const message = JSON.parse(line)
  log(message)
  if (message.type === 'control_request') {
    write({ type: 'control_response', response: { subtype: 'success', request_id: message.request_id, response: message.request.subtype === 'initialize' ? { commands: [], output_style: 'default', available_output_styles: ['default'], models: [], account: {} } : {} } })
  } else if (message.type === 'user') {
    await new Promise(resolve => setTimeout(resolve, 350))
    const request = JSON.stringify(message)
    if (resume && /\[history-(?:missing-result|auth-error)\]/.test(request)) {
      const error = request.includes('[history-auth-error]') ? 'Authentication session expired. Sign in again.' : `Session ${resume} not found.`
      write({ type: 'result', subtype: 'error_during_execution', is_error: true, errors: [error], duration_ms: 1, duration_api_ms: 0, num_turns: 0, total_cost_usd: 0, session_id: session, uuid: randomUUID(), usage: { input_tokens: 0, output_tokens: 0 }, modelUsage: {}, permission_denials: [] })
      continue
    }
    if (resume && request.includes('[history-expired]')) {
      process.stderr.write(`No conversation found with session ID: ${resume}\n`)
      process.exit(1)
    }
    write({ type: 'system', subtype: 'init', session_id: session, tools: [], mcp_servers: [], model: 'fake-local', permissionMode: 'dontAsk', cwd: process.cwd(), uuid: randomUUID(), apiKeySource: 'none' })
    if (process.env.CHALK_FAKE_HISTORY === '1') {
      if (JSON.stringify(message).includes('[history-slow]')) await new Promise(resolve => setTimeout(resolve, 1400))
      write({ type: 'assistant', session_id: session, parent_tool_use_id: null, uuid: randomUUID(), message: { id: randomUUID(), type: 'message', role: 'assistant', model: 'fake-local', content: [{ type: 'text', text: 'Saved design conversation.' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } })
      write({ type: 'result', subtype: 'success', is_error: false, result: 'Saved design conversation.', duration_ms: 400, duration_api_ms: 0, num_turns: 1, total_cost_usd: 0, session_id: session, uuid: randomUUID(), usage: { input_tokens: 0, output_tokens: 0 }, modelUsage: {}, permission_denials: [] })
      continue
    }
    const presence = JSON.stringify(message).includes('[presence-fixture]')
    if (presence) {
      write({ type: 'assistant', session_id: session, parent_tool_use_id: null, uuid: randomUUID(), message: { id: randomUUID(), type: 'message', role: 'assistant', model: 'fake-local', content: [{ type: 'tool_use', id: randomUUID(), name: 'mcp__chalk__browser_snapshot', input: {} }], stop_reason: 'tool_use', stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } } })
      await new Promise(resolve => setTimeout(resolve, 5200))
    }
    write({ type: 'result', subtype: 'error_during_execution', is_error: true, errors: ['Local transport fixture. No AI request was made.'], duration_ms: presence ? 5550 : 1, duration_api_ms: 0, num_turns: 1, total_cost_usd: 0, session_id: session, uuid: randomUUID(), usage: { input_tokens: 0, output_tokens: 0 }, modelUsage: {}, permission_denials: [] })
  }
}
