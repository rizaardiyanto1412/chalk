#!/usr/bin/env node
import { createInterface } from 'node:readline'
import { appendFileSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { randomUUID } from 'node:crypto'
const resume = process.argv.find(arg => arg.startsWith('--resume='))?.slice('--resume='.length)
const session = resume || randomUUID()
const write = value => process.stdout.write(JSON.stringify(value) + '\n')
const log = value => { if (process.env.CHALK_FAKE_LOG) appendFileSync(process.env.CHALK_FAKE_LOG, JSON.stringify(value) + '\n') }
const parallelFixture = process.env.CHALK_FAKE_PARALLEL === '1'
const flag = name => process.argv.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1) ?? process.argv[process.argv.indexOf(name) + 1]
const planner = process.argv.includes('--json-schema') || process.argv.some(arg => arg.startsWith('--json-schema='))
const mcpConfig = flag('--mcp-config')
const config = mcpConfig?.startsWith('{') ? JSON.parse(mcpConfig) : null
const worker = !!config?.mcpServers?.chalk?.url?.endsWith('/mcp/worker')
const safeArgv = parallelFixture && worker ? process.argv.slice(2).map(arg => arg.replace(/Bearer [\w-]{43}/g, 'Bearer [redacted]')) : process.argv.slice(2)
log({ type: 'spawn', argv: safeArgv, session, cwd: process.cwd(), ...(parallelFixture ? { pid: process.pid, role: planner ? 'planner' : worker ? 'worker' : 'ordinary' } : {}) })
const result = (success, extra = {}) => write({ type: 'result', subtype: success ? 'success' : 'error_during_execution', is_error: !success, result: 'Fixture finished.', errors: success ? undefined : ['Fake worker failure.'], duration_ms: 10, duration_api_ms: 0, num_turns: 1, total_cost_usd: planner ? 0.001 : 0.01, session_id: session, uuid: randomUUID(), usage: { input_tokens: 0, output_tokens: 0 }, modelUsage: {}, permission_denials: [], ...extra })
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function managed(request) {
  const prompt = typeof request.message?.content === 'string' ? request.message.content : request.message.content.map(b => b.text ?? '').join('')
  if (planner) {
    const schema = JSON.parse(flag('--json-schema'))
    if (schema.$schema !== 'http://json-schema.org/draft-07/schema#') throw new Error('The installed CLI supports JSON Schema draft-07, not the supplied schema dialect.')
    const settings = JSON.parse(prompt.match(/Settings: ([^\n]+)/)[1])
    const catalog = JSON.parse(prompt.match(/Catalog: ([^\n]+)/)[1])
    const count = settings.variations.axis === 'off' ? settings.mode === 'side' ? settings.agents : 1 : settings.variations.count
    const marker = prompt.match(/\[plan:(page|screens):(\d+)\]/)
    const kind = marker?.[1] ?? 'page'
    const units = settings.agents > 1 && settings.mode === 'split' ? Math.min(6, Number(marker?.[2] ?? 2)) : 1
    const screens = kind === 'screens' ? Array.from({ length: Number(marker?.[2] ?? 2) }, (_, i) => `Screen ${i + 1}`) : []
    const plan = { kind, contract: { identity: 'catalog', width: 640, visual: 'Warm paper, navy type, serif headings, 24px rhythm.', content: 'Keep all requested content.' }, screens,
      directions: Array.from({ length: count }, (_, i) => ({ title: `Direction ${i + 1}`, brief: `Visual direction ${i + 1}.`, style: { id: catalog[settings.variations.axis === 'layout' ? 0 : i].id, variant: catalog[settings.variations.axis === 'layout' ? 0 : i].variants[0].id } })),
      units: Array.from({ length: units }, (_, i) => ({ title: `Part ${i + 1}`, brief: `Build complementary part ${i + 1}.`, ...(kind === 'screens' && settings.mode === 'split' && settings.agents > 1 ? { screens: screens.slice(i * 2, i * 2 + 2) } : {}) })) }
    if (kind === 'screens' && settings.mode === 'split' && settings.agents > 1) plan.units = Array.from({ length: Math.ceil(screens.length / 2) }, (_, i) => ({ title: `Screens ${i + 1}`, brief: 'Build only assigned screens.', screens: screens.slice(i * 2, i * 2 + 2) }))
    if (prompt.includes('[plan:bad]')) plan.directions.forEach(d => { d.style = plan.directions[0].style })
    log({ type: 'plan', pid: process.pid, plan })
    if (prompt.includes('[plan:no-schema]')) result(true)
    else result(true, { structured_output: plan })
    return
  }
  const job = JSON.parse(prompt.match(/<job>([\s\S]*?)<\/job>/)[1])
  const dir = process.env.CHALK_FAKE_DIR
  for (const name of ['held', 'release', 'calls']) mkdirSync(join(dir, name), { recursive: true })
  const endpoint = config.mcpServers.chalk
  const client = new Client({ name: `fake-${process.pid}`, version: '1' })
  await client.connect(new StreamableHTTPClientTransport(new URL(endpoint.url), { requestInit: { headers: endpoint.headers } }))
  const call = async (name, args = {}) => {
    const response = await client.callTool({ name, arguments: args })
    log({ type: 'worker-tool', pid: process.pid, job: job.id, name, isError: !!response.isError })
    return response
  }
  const json = response => JSON.parse(response.content[0].text)
  const record = { pid: process.pid, job, endpoint }
  writeFileSync(join(dir, 'calls', String(process.pid)), JSON.stringify(record))
  if (prompt.includes('[await-measure]')) {
    log({ type: 'measure-start', pid: process.pid, job: job.id })
    const mutation = call('create_frame', { name: job.label, html: `<div style="height:140px">Awaited ${job.id}</div>`, width: 640 })
    const response = await mutation
    log({ type: 'measure-result', pid: process.pid, isError: !!response.isError })
  } else if (job.role === 'integrate') {
    if (prompt.includes('[integrator:cleanup]')) await call('browser_navigate', { url: 'https://chalk-cleanup.test/' })
    const canvas = json(await call('get_canvas'))
    const draft = canvas.frames.find(f => f.html !== undefined)
    if (prompt.includes('[integrator:bad]')) await call('edit_frame', { id: draft.id, edits: [{ find: 'data-chalk-part="1"', replace: 'data-chalk-lost="1"' }] })
  } else {
    if (job.role === 'section' && prompt.includes('[section:script]')) {
      const bad = await call('create_frame', { name: 'Rejected script', html: '<script>1</script><div>Bad</div>', width: 640, height: 140 })
      log({ type: 'script-rejected', pid: process.pid, isError: !!bad.isError })
    }
    let picture = ''
    if (prompt.includes('[generate-image]') && job.role !== 'integrate') {
      const unused = await call('generate_image', { prompt: `A discarded attempt for ${job.label}` })
      if (unused.isError) throw new Error(unused.content[0].text)
      const made = await call('generate_image', { prompt: `A ceramic lamp for ${job.label}` })
      if (made.isError) throw new Error(made.content[0].text)
      for (let i = 0; i < 2; i++) {
        const extra = await call('generate_image', { prompt: `One more image for ${job.label}` })
        log({ type: 'image-cap', pid: process.pid, i, isError: !!extra.isError })
      }
      picture = `<img src="${json({ content: [made.content[1]] }).src}" style="width:100%;height:60px;object-fit:cover">`
    }
    for (let i = 0; i < job.maxDrafts; i++) {
      const response = await call('create_frame', { name: `${job.label} ${i + 1}`, html: `${picture}${prompt.includes('[section:style]') ? '<style>.brand { font-family: Georgia, serif }</style>' : ''}<div class="brand [&>span]:text-[#123456]" style="height:140px;background:#f5e8d5;color:#123456">Variant ${job.group + 1} ${job.label} screen ${i + 1}</div>`, width: 640, height: 140 })
      if (response.isError) throw new Error(response.content[0].text)
      record.draftId = json(response).created.id
    }
  }
  writeFileSync(join(dir, 'held', String(process.pid)), JSON.stringify(record))
  log({ type: 'held', pid: process.pid, job: job.id, role: job.role })
  while (!existsSync(join(dir, 'release', String(process.pid)))) await delay(20)
  await client.close()
  log({ type: 'worker-end', pid: process.pid, job: job.id })
  if (job.role === 'integrate' && prompt.includes('[integrator:fail]')) result(false, { errors: ['Integrator failed intentionally.'] })
  else if (prompt.includes('[fail-token]')) result(false, { errors: [`Fixture transport failure ${endpoint.headers.authorization}`] })
  else if (prompt.includes(`[fail:${job.id}]`)) result(false, { errors: [`Fake job ${job.id} failed intentionally.`] })
  else result(true)
}

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
    if (parallelFixture && (planner || worker)) {
      try { await managed(message) } catch (error) { result(false, { errors: [error.stack ?? String(error)] }) }
      continue
    }
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
