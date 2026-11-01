import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright-core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync, realpathSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const alive = pid => { try { process.kill(pid, 0); return true } catch { return false } }
const pause = ms => new Promise(r => setTimeout(r, ms))
async function until(read, accept, label, timeout = 20000) {
  const start = Date.now()
  let value
  while (Date.now() - start < timeout) {
    value = await read()
    if (accept(value)) return value
    await pause(25)
  }
  throw new Error(`Timed out waiting for ${label}. Last value ${JSON.stringify(value)}`)
}
const settings = (count = 6, agents = 2, mode = 'side', axis = 'layout') => ({ variations: axis === 'off' ? { axis } : { axis, count }, agents, mode })
const ordinary = settings(0, 1, 'split', 'off')
const overlap = frames => frames.some((a, i) => frames.slice(i + 1).some(b => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y))

export async function checkParallel({ root, artifacts, check }) {
  const evidence = join(artifacts, 'parallel')
  mkdirSync(evidence, { recursive: true })
  let port = (Number(process.env.CHALK_PORT) || 8300) + 40
  async function fixture() {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-parallel-')))
    const project = join(dir, 'project')
    const profile = join(dir, 'profile')
    mkdirSync(project); mkdirSync(profile)
    mkdirSync(join(dir, 'held')); mkdirSync(join(dir, 'release')); mkdirSync(join(dir, 'calls'))
    const log = join(dir, 'transport.jsonl')
    writeFileSync(log, '')
    const chosenPort = ++port
    let instance, win
    const start = async () => {
      instance = await electron.launch({ args: [root, `--user-data-dir=${profile}`], cwd: root,
        env: { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'ELECTRON_RUN_AS_NODE')), CHALK_PROJECT_DIR: project, CHALK_CLAUDE_PATH: join(root, 'scripts/fixtures/fake-claude.mjs'), CHALK_FAKE_PARALLEL: '1', CHALK_FAKE_HISTORY: '1', CHALK_FAKE_LOG: log, CHALK_FAKE_DIR: dir, CHALK_PORT: String(chosenPort), ELECTRON_RENDERER_URL: '' } })
      assert.equal(realpathSync(await instance.evaluate(({ app }) => app.getPath('userData'))), profile)
      win = await instance.firstWindow()
      await win.waitForSelector('.chat textarea')
    }
    await start()
    const invoke = (channel, ...args) => win.evaluate(({ channel, args }) => window.chalk.invoke(channel, ...args), { channel, args })
    const logs = () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l))
    const held = () => readdirSync(join(dir, 'held')).map(pid => JSON.parse(readFileSync(join(dir, 'held', pid), 'utf8'))).filter(h => alive(h.pid) && !existsSync(join(dir, 'release', String(h.pid))))
    const release = h => writeFileSync(join(dir, 'release', String(h.pid)), '')
    const init = () => invoke('init')
    const history = async () => (await invoke('chats:list')).current
    const idle = () => win.waitForSelector('.chat-new:not(:disabled)', { timeout: 30000 })
    const send = (parallel, text = 'Design the requested page.') => invoke('agent:send', { text, model: '', style: null, parallel })
    const waitHeld = n => until(held, h => h.length === n, `${n} held workers`)
    const drain = async (cap = 6) => {
      let peak = 0
      await until(async () => {
        const current = held()
        peak = Math.max(peak, current.length)
        assert.ok(current.length <= cap, `held ${current.length} exceeds cap ${cap}`)
        current.forEach(release)
        return (await init()).agentStatus
      }, status => status === 'idle', 'run drain', 60000)
      return peak
    }
    const scoped = async h => {
      const client = new Client({ name: 'parallel-test', version: '1' })
      await client.connect(new StreamableHTTPClientTransport(new URL(h.endpoint.url), { requestInit: { headers: h.endpoint.headers } }))
      return client
    }
    const call = (client, name, args = {}) => client.callTool({ name, arguments: args })
    const close = async () => {
      if (instance) {
        await invoke('agent:stop').catch(() => {})
        held().forEach(release)
        await idle().catch(() => {})
        await instance.close()
      }
      for (const row of logs().filter(l => l.type === 'spawn' && l.role === 'worker')) assert.equal(alive(row.pid), false, `worker ${row.pid} leaked`)
    }
    return { dir, project, profile, get app() { return instance }, get win() { return win }, port: chosenPort, start, invoke, logs, held, release, init, history, idle, send, waitHeld, drain, scoped, call, close, restart: async () => { await instance.close(); await start() } }
  }
  async function test(name, run) {
    if (process.env.CHALK_PARALLEL_CASES && !new RegExp(process.env.CHALK_PARALLEL_CASES).test(name)) return
    await check(name, async () => {
      const f = await fixture()
      try { await run(f) }
      finally {
        await f.close()
        writeFileSync(join(evidence, `${name.match(/^T\d+/)?.[0] ?? 'extra'}.json`), JSON.stringify({ project: f.project, profile: f.profile, logs: f.logs() }, null, 2))
      }
    })
  }
  const finished = async f => (await f.history()).events.filter(e => e.type === 'notice' && e.run?.kind === 'finished').at(-1)?.run
  const addOriginal = async f => {
    const frame = { id: 'abcdef01', kind: 'html', name: 'Original', html: '<div style="height:100px">Original captured content</div>', x: 0, y: 0, width: 640, height: 100, updatedAt: 1 }
    await f.invoke('op', { type: 'add', frame })
    await f.invoke('select', [frame.id])
    return frame
  }
  await test('T1 ordinary path keeps one CLI, legacy MCP and resume', async f => {
    await f.win.locator('.chat textarea').fill('Ordinary first send.')
    await f.win.locator('.chat textarea').press('Enter')
    await until(f.history, h => h.events.some(e => e.type === 'done'), 'first ordinary result')
    await f.idle()
    const id = (await f.history()).sessionId
    await f.send(ordinary, 'Ordinary second send.')
    await until(f.history, h => h.events.filter(e => e.type === 'done').length === 2, 'second ordinary result')
    await f.idle()
    const spawns = f.logs().filter(l => l.type === 'spawn')
    assert.equal(spawns.length, 2)
    assert.equal(spawns[0].argv.some(a => a.includes('json-schema')), false)
    assert.match(spawns[0].argv.find(a => a.includes('mcpServers')), /\/mcp"/)
    assert.ok(spawns[1].argv.includes(`--resume=${id}`))
    assert.equal((await f.history()).events.some(e => e.run), false)
  })
  await test('T2 six variations hold exactly two live scoped mutations', async f => {
    const original = await addOriginal(f)
    await f.send(settings())
    const held = await f.waitHeld(2)
    assert.equal(new Set(held.map(h => h.pid)).size, 2)
    assert.ok(held.every(h => alive(h.pid) && h.draftId))
    const planner = f.logs().find(l => l.type === 'spawn' && l.role === 'planner')
    assert.equal(alive(planner.pid), false, 'planner has exited before capped workers hold')
    assert.equal(f.logs().filter(l => l.type === 'spawn' && l.role === 'worker').length, 2)
    await pause(250)
    assert.equal(f.logs().filter(l => l.type === 'spawn' && l.role === 'worker').length, 2)
    f.release(held[0])
    await until(f.logs, rows => rows.filter(l => l.type === 'spawn' && l.role === 'worker').length === 3, 'third worker after release')
    assert.equal(alive(held[0].pid), false, 'slot retained until released process exited')
    assert.ok(alive(held[1].pid))
    await f.drain(2)
    const spawns = f.logs().filter(l => l.type === 'spawn')
    assert.equal(spawns.filter(l => l.role === 'planner').length, 1)
    assert.equal(spawns.filter(l => l.role === 'worker').length, 6)
    const doc = (await f.init()).doc
    assert.equal(doc.frames.length, 7)
    assert.deepEqual(doc.frames[0], original)
    assert.equal(overlap(doc.frames), false)
    assert.equal((await f.history()).events.filter(e => e.type === 'done').length, 1)
    assert.deepEqual((await finished(f)).frameIds.length, 6)
    assert.equal((await finished(f)).costComplete, true)
    assert.ok(Math.abs((await finished(f)).costUsd - .061) < .000001)
  })
  await test('T3 cap six reaches six processes and cap one stays sequential', async f => {
    await f.send(settings(6, 6))
    const six = await f.waitHeld(6)
    assert.equal(new Set(six.map(h => h.pid)).size, 6)
    assert.ok(six.every(h => h.draftId && alive(h.pid)))
    await f.drain(6)
    const before = f.logs().filter(l => l.type === 'spawn' && l.role === 'worker').length
    await f.send(settings(3, 1))
    for (let i = 0; i < 3; i++) {
      const one = await f.waitHeld(1)
      assert.equal(f.logs().filter(l => l.type === 'spawn' && l.role === 'worker').length, before + i + 1)
      f.release(one[0])
      await until(() => alive(one[0].pid), live => !live, 'sequential process exit')
    }
    await f.idle()
    assert.equal((await f.init()).doc.frames.length, 9)
  })
  await test('T4 Stop drains processes revokes tokens and rejects late writes', async f => {
    await addOriginal(f)
    await pause(350)
    const before = readFileSync(join(f.project, 'chalk.json'), 'utf8')
    await f.send(settings())
    const held = await f.waitHeld(2)
    await f.invoke('agent:stop')
    await f.invoke('agent:stop')
    const response = await fetch(held[0].endpoint.url, { method: 'POST', headers: { ...held[0].endpoint.headers, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'create_frame', arguments: { name: 'Late', html: '<div>late</div>', height: 100 } } }) })
    assert.equal(response.status, 401)
    await f.idle()
    held.forEach(h => assert.equal(alive(h.pid), false))
    assert.equal(f.logs().filter(l => l.type === 'spawn' && l.role === 'worker').length, 2)
    assert.equal((await f.init()).doc.frames.length, 1)
    assert.equal((await finished(f)).outcome, 'stopped')
    assert.equal((await finished(f)).costComplete, false)
    assert.equal((await f.history()).events.filter(e => e.run?.kind === 'job' && e.run.state === 'canceled').length, 6)
    await pause(2000)
    assert.equal(readFileSync(join(f.project, 'chalk.json'), 'utf8'), before)
  })
  await test('T5 Stop during awaited measurement seals writes and stays busy through tool cleanup', async f => {
    await f.send(settings(2, 2))
    const [h] = await f.waitHeld(2)
    await f.app.evaluate(({ session }) => {
      globalThis.parallelMeasureHeld = false
      session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
        if (new URL(details.url).pathname.startsWith('/preview/')) { globalThis.parallelMeasureHeld = true; globalThis.parallelReleaseMeasure = () => callback({ cancel: false }) }
        else callback({ cancel: false })
      })
    })
    const client = await f.scoped(h)
    const write = f.call(client, 'create_frame', { name: 'Awaiting', html: '<div>Awaited write</div>', width: 640 })
    await until(() => f.app.evaluate(() => globalThis.parallelMeasureHeld), Boolean, 'held real preview measurement')
    await f.invoke('agent:stop')
    assert.equal((await f.init()).agentStatus, 'running')
    assert.match(await f.win.locator('.run-card-head').innerText(), /Stopping/)
    await f.app.evaluate(() => globalThis.parallelReleaseMeasure())
    const result = await write
    assert.equal(result.isError, true)
    assert.match(result.content[0].text, /stopped|finished/)
    await client.close()
    await f.idle()
    assert.equal((await f.init()).doc.frames.length, 0)
    await f.app.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest(null))
  })
  await test('T6 forged ownership and bearer requests cannot reach originals siblings or publishing tools', async f => {
    const original = await addOriginal(f)
    await f.send(settings(2, 2), 'Design [fail-token]')
    const [a, b] = await f.waitHeld(2)
    const client = await f.scoped(a)
    const listed = (await client.listTools()).tools.map(t => t.name)
    for (const name of ['export_frame', 'copy_frame_image', 'browser_capture_to_canvas']) assert.equal(listed.includes(name), false)
    for (const id of [original.id, b.draftId]) for (const [name, args] of [ ['update_frame', { id, baseRevision: 1, html: '<div>Forged</div>', height: 100 }], ['edit_frame', { id, edits: [{ find: 'Variant', replace: 'Forged' }] }], ['delete_frame', { id }] ]) assert.equal((await f.call(client, name, args)).isError, true)
    for (const header of [{}, { authorization: 'Bearer ' + 'x'.repeat(43) }]) {
      const response = await fetch(a.endpoint.url, { method: 'POST', headers: header })
      assert.equal(response.status, 401)
    }
    assert.equal((await fetch(a.endpoint.url, { method: 'POST', headers: { ...a.endpoint.headers, origin: 'https://example.com' } })).status, 403)
    const own = await f.call(client, 'get_frame', { id: a.draftId })
    const d = JSON.parse(own.content[0].text)
    assert.equal((await f.call(client, 'update_frame', { id: a.draftId, baseRevision: d.revision + 1, html: '<div>Stale</div>', height: 100 })).isError, true)
    for (const html of ['<img src="/assets/uncaptured.png">', '<iframe src="/frame/abcdef01"></iframe>']) {
      assert.equal((await f.call(client, 'create_frame', { name: 'Invalid local reference', html, height: 100 })).isError, true)
      assert.equal((await f.call(client, 'create_frame', { name: 'Invalid measured reference', html })).isError, true)
      assert.equal((await f.call(client, 'update_frame', { id: a.draftId, baseRevision: d.revision, html, height: 100 })).isError, true)
    }
    assert.equal(JSON.parse((await f.call(client, 'get_frame', { id: a.draftId })).content[0].text).revision, d.revision)
    const sibling = await f.scoped(b)
    assert.match(JSON.parse((await f.call(sibling, 'get_frame', { id: b.draftId })).content[0].text).html, /Variant/)
    await sibling.close(); await client.close()
    await f.drain(2)
    assert.deepEqual((await f.init()).doc.frames.find(x => x.id === original.id), original)
    const saved = JSON.stringify(await f.history())
    for (const h of [a, b]) assert.equal(saved.includes(h.endpoint.headers.authorization.slice(7)), false, 'CLI errors cannot persist bearer capabilities')
    assert.ok(saved.includes('[redacted]'))
  })
  await test('T7 one failed complete job drains remaining work and reports partial cost', async f => {
    await f.send(settings(4, 2), 'Design [fail:2]')
    await f.drain(2)
    const events = (await f.history()).events
    assert.ok(events.some(e => e.run?.kind === 'job' && e.run.jobId === '2' && e.run.state === 'failed' && e.run.error.includes('Fake job 2 failed intentionally.')))
    for (const id of ['1', '3', '4']) assert.ok(events.some(e => e.run?.kind === 'job' && e.run.jobId === id && e.run.state === 'done'))
    assert.equal((await f.init()).doc.frames.length, 3)
    assert.equal((await finished(f)).outcome, 'partial')
    assert.ok(Math.abs((await finished(f)).costUsd - .041) < .000001)
  })
  await test('T8 split page integrates ordered sections rejects scripts and preserves partial fallback', async f => {
    await f.send(settings(0, 3, 'split', 'off'), 'Design [plan:page:3] [section:script] [section:style]')
    const parts = await f.waitHeld(3)
    assert.ok(parts.every(h => h.job.role === 'section'))
    assert.equal(f.logs().some(l => l.type === 'held' && l.role === 'integrate'), false)
    parts.forEach(f.release)
    const [integrator] = await f.waitHeld(1)
    assert.equal(integrator.job.role, 'integrate')
    parts.forEach(p => assert.equal(alive(p.pid), false))
    f.release(integrator)
    await f.idle()
    const [frame] = (await f.init()).doc.frames
    assert.deepEqual([...frame.html.matchAll(/data-chalk-part="(\d+)"/g)].map(m => m[1]), ['1', '2', '3'])
    assert.ok(frame.html.includes('<style>') && frame.html.includes('[&>span]:text-[#123456]'), 'split retains expressive CSS and arbitrary Tailwind classes')
    assert.ok(f.logs().filter(l => l.type === 'script-rejected').every(l => l.isError))
    await f.send(settings(0, 3, 'split', 'off'), 'Design [plan:page:3] [fail:2]')
    await f.drain(3)
    const partial = (await f.init()).doc.frames.slice(1)
    assert.equal(partial.length, 2)
    assert.ok(partial.every(p => p.name.includes('(partial)')))
    await f.send(settings(0, 3, 'split', 'off'), 'Design [plan:page:3] [integrator:bad]')
    await f.drain(3)
    const fallback = (await f.init()).doc.frames.at(-1)
    assert.match(fallback.name, /not integrated/)
    assert.deepEqual([...fallback.html.matchAll(/data-chalk-part="(\d+)"/g)].map(m => m[1]), ['1', '2', '3'])
    await f.send(settings(0, 3, 'split', 'off'), 'Design [plan:page:3] [integrator:fail]')
    await f.drain(3)
    const failedFallback = (await f.init()).doc.frames.at(-1)
    assert.match(failedFallback.name, /not integrated/)
    assert.deepEqual([...failedFallback.html.matchAll(/data-chalk-part="(\d+)"/g)].map(m => m[1]), ['1', '2', '3'])
    assert.equal((await finished(f)).outcome, 'partial')
    await f.app.evaluate(({ app }) => {
      app.on('session-created', s => {
        if (s.isPersistent()) return
        s.protocol.handle('https', () => new Response('<h1>Cleanup fixture</h1>', { headers: { 'content-type': 'text/html' } }))
        s.clearStorageData = async () => { throw new Error('Intentional private storage cleanup failure.') }
      })
    })
    const beforeCleanup = (await f.init()).doc.frames.length
    await f.send(settings(0, 3, 'split', 'off'), 'Design [plan:page:3] [integrator:cleanup]')
    await f.drain(3)
    assert.equal((await f.init()).doc.frames.length, beforeCleanup + 1, 'cleanup failure does not discard the completed page')
    assert.ok((await f.history()).events.some(e => e.type === 'error' && /Intentional private storage cleanup failure/.test(e.text)))
    assert.equal((await finished(f)).outcome, 'partial')
  })
  await test('T9 combined style split produces two pages without crossing variants', async f => {
    await f.send(settings(2, 2, 'split', 'style'), 'Design [plan:page:2]')
    await f.waitHeld(2)
    await f.drain(2)
    const spawns = f.logs().filter(l => l.type === 'held')
    assert.equal(spawns.filter(l => l.role === 'section').length, 4)
    assert.equal(spawns.filter(l => l.role === 'integrate').length, 2)
    const frames = (await f.init()).doc.frames
    assert.equal(frames.length, 2)
    for (const frame of frames) {
      const groups = new Set([...frame.html.matchAll(/Variant (\d+)/g)].map(m => m[1]))
      assert.equal(groups.size, 1)
      assert.equal((frame.html.match(/data-chalk-part=/g) ?? []).length, 2)
    }
  })
  await test('T10 invalid duplicate styles and oversized screen plans fail before workers', async f => {
    for (const text of ['Design [plan:bad]', 'Design [plan:screens:13]', 'Design [plan:no-schema]']) {
      await f.send(settings(2, 2, 'side', 'style'), text)
      await f.idle()
      assert.equal((await finished(f)).outcome, 'failed')
    }
    assert.equal(f.logs().some(l => l.type === 'spawn' && l.role === 'worker'), false)
    assert.equal((await f.init()).doc.frames.length, 0)
    assert.ok((await f.history()).events.some(e => e.type === 'error' && /invalid plan/.test(e.text)))
    assert.ok((await f.history()).events.some(e => e.type === 'error' && /structured|Structured/.test(e.text)))
  })
  await test('T11 private browsers isolate workflows cookies refs and deny loopback', async f => {
    await f.app.evaluate(async ({ session, app }) => {
      const install = s => {
        s.protocol.handle('https', request => {
          const page = new URL(request.url).pathname.slice(1) || 'visible'
          return new Response(`<!doctype html><title>${page}</title><body style="margin:0;background:#c6412f;color:white"><h1>${page}</h1><button style="background:#145c3b;color:white;width:200px;height:100px" onclick="document.title='${page} clicked'">Click ${page}</button><p id="cookie"></p><script>document.querySelector('#cookie').textContent=document.cookie</script></body>`, { headers: { 'content-type': 'text/html' } })
        })
      }
      install(session.fromPartition('persist:chalk-browser'))
      app.on('session-created', s => { if (!s.isPersistent()) install(s) })
      await session.fromPartition('persist:chalk-browser').cookies.set({ url: 'https://chalk-fixture.test', name: 'authenticated', value: 'visible-only', secure: true })
    })
    await f.invoke('browser', 'navigate', 'https://chalk-fixture.test/visible')
    const visible = (await f.init()).browser
    const visibleDetails = await f.app.evaluate(({ webContents }) => {
      const wc = webContents.getAllWebContents().find(w => w.getURL() === 'https://chalk-fixture.test/visible')
      wc.focus()
      return { id: wc.id, history: wc.navigationHistory.getAllEntries(), focused: wc.isFocused() }
    })
    const phases = []
    const traceFocus = async label => {
      phases.push({ label, views: await f.app.evaluate(({ webContents }) => webContents.getAllWebContents().map(w => ({ id: w.id, url: w.getURL(), focused: w.isFocused() }))) })
      writeFileSync(join(evidence, 'focus-phases.json'), JSON.stringify(phases, null, 2))
    }
    await f.app.evaluate(({ app }) => {
      globalThis.parallelPrivateFocus = []
      app.on('web-contents-created', (_event, wc) => wc.on('focus', () => globalThis.parallelPrivateFocus.push({ id: wc.id, url: wc.getURL() })))
    })
    await traceFocus('before-send')
    await f.send(settings(2, 2))
    const held = await f.waitHeld(2)
    await traceFocus('workers-held')
    const a = await f.scoped(held[0]), b = await f.scoped(held[1])
    const json = r => JSON.parse(r.content[0].text)
    assert.equal((await f.call(a, 'browser_navigate', { url: 'https://chalk-fixture.test/a' })).isError, undefined)
    await traceFocus('private-a-navigation')
    const snapA = json(await f.call(a, 'browser_snapshot'))
    const refA = snapA.tree.match(/\[([\w-]+)\]/)[1]
    await f.call(b, 'browser_navigate', { url: 'https://chalk-fixture.test/b' })
    await traceFocus('private-b-navigation')
    const refB = json(await f.call(b, 'browser_snapshot')).tree.match(/\[([\w-]+)\]/)[1]
    assert.equal((await f.call(b, 'browser_click', { ref: refB })).isError, undefined)
    await traceFocus('private-b-click')
    assert.equal((await f.call(a, 'browser_click', { ref: refA })).isError, undefined)
    await traceFocus('private-a-click')
    assert.equal(json(await f.call(a, 'browser_state')).title, 'a clicked')
    assert.equal(json(await f.call(b, 'browser_state')).title, 'b clicked')
    assert.equal((await f.call(a, 'browser_click', { ref: refB })).isError, true)
    const shot = await f.call(a, 'browser_screenshot', { full_page: true })
    assert.equal(shot.isError, undefined)
    const png = PNG.sync.read(Buffer.from(shot.content[0].data, 'base64'))
    const colors = new Set()
    for (let i = 0; i < png.data.length; i += 400) colors.add(png.data.subarray(i, i + 3).toString('hex'))
    assert.ok(colors.size > 3, 'hidden private page paints a non-blank screenshot')
    writeFileSync(join(evidence, 'private-browser.png'), Buffer.from(shot.content[0].data, 'base64'))
    const privateDetails = await f.app.evaluate(async ({ webContents }) => {
      const views = webContents.getAllWebContents().filter(w => /chalk-fixture.test\/(a|b)$/.test(w.getURL()))
      return Promise.all(views.map(async w => ({ id: w.id, persistent: w.session.isPersistent(), cookies: await w.session.cookies.get({ url: w.getURL() }) })))
    })
    assert.equal(await f.app.evaluate(({ webContents }) => {
      const views = webContents.getAllWebContents().filter(w => /chalk-fixture.test\/(a|b)$/.test(w.getURL()))
      return views[0].session === views[1].session
    }), false, 'workers have separate sessions')
    assert.equal(privateDetails.length, 2)
    assert.equal(new Set(privateDetails.map(w => w.id)).size, 2)
    assert.ok(privateDetails.every(w => !w.persistent && w.cookies.length === 0))
    assert.equal((await f.call(a, 'browser_navigate', { url: `http://127.0.0.1:${f.port}/mcp` })).isError, true)
    assert.equal((await f.call(a, 'browser_navigate', { url: 'file:///etc/hosts' })).isError, true)
    const after = (await f.init()).browser
    assert.equal(after.url, visible.url)
    assert.equal(after.device, visible.device)
    assert.equal(after.canGoBack, visible.canGoBack)
    assert.deepEqual(await f.app.evaluate(({ webContents }, id) => {
      const wc = webContents.fromId(id)
      return { id: wc.id, history: wc.navigationHistory.getAllEntries() }
    }, visibleDetails.id), { id: visibleDetails.id, history: visibleDetails.history })
    const focusIsolation = await f.app.evaluate(({ BrowserWindow }, ids) => ({
      events: globalThis.parallelPrivateFocus.filter(e => ids.includes(e.id)),
      hosts: BrowserWindow.getAllWindows().filter(w => w.contentView.children.some(v => v.webContents && ids.includes(v.webContents.id))).map(w => ({ focusable: w.isFocusable(), focused: w.isFocused(), visible: w.isVisible() }))
    }), privateDetails.map(w => w.id))
    assert.deepEqual(focusIsolation.events, [], 'private pages never receive native webContents focus')
    assert.equal(focusIsolation.hosts.length, 2)
    assert.ok(focusIsolation.hosts.every(w => !w.focusable && !w.focused && !w.visible), 'private hosts cannot take user focus')
    await a.close(); await b.close()
    await f.drain(2)
    assert.equal(await f.app.evaluate(({ webContents }, ids) => ids.filter(id => webContents.fromId(id)).length, privateDetails.map(w => w.id)), 0)
  })
  await test('T12 references DESIGN.md and local asset renders stay frozen after user edits and deletion', async f => {
    const original = await addOriginal(f)
    const red = new PNG({ width: 20, height: 20 })
    const blue = new PNG({ width: 20, height: 20 })
    for (let i = 0; i < red.data.length; i += 4) { red.data.set([210, 20, 20, 255], i); blue.data.set([20, 20, 210, 255], i) }
    mkdirSync(join(f.project, 'assets'), { recursive: true })
    const asset = join(f.project, 'assets', 'frozen.png')
    writeFileSync(asset, PNG.sync.write(red))
    const html = '<img src="/assets/frozen.png" style="width:640px;height:100px;display:block">'
    await f.invoke('op', { type: 'patch', id: original.id, patch: { html } })
    writeFileSync(join(f.project, 'DESIGN.md'), 'Frozen brand instructions.')
    await f.send(settings(2, 2))
    const held = await f.waitHeld(2)
    await f.invoke('op', { type: 'patch', id: original.id, patch: { x: 3000, y: 1500, html: '<div>Later edit</div>' } })
    await f.invoke('op', { type: 'delete', id: original.id })
    writeFileSync(asset, PNG.sync.write(blue))
    writeFileSync(join(f.project, 'DESIGN.md'), 'Later brand instructions.')
    for (const h of held) {
      const client = await f.scoped(h)
      const frame = JSON.parse((await f.call(client, 'get_frame', { id: original.id })).content[0].text)
      assert.equal(frame.html, html)
      const notes = (await f.call(client, 'get_design_guidelines')).content[0].text
      assert.match(notes, /Frozen brand instructions/)
      assert.doesNotMatch(notes, /Later brand instructions/)
      const response = await f.call(client, 'screenshot_frame', { id: original.id })
      assert.equal(response.isError, undefined)
      const pixels = PNG.sync.read(Buffer.from(response.content[0].data, 'base64'))
      const at = (Math.floor(pixels.height / 2) * pixels.width + Math.floor(pixels.width / 2)) * 4
      assert.ok(pixels.data[at] > 150 && pixels.data[at + 2] < 80, 'render embeds Send-time red bytes instead of later blue asset')
      await client.close()
    }
    await f.drain(2)
    assert.equal((await f.init()).doc.frames.some(x => x.id === original.id), false)
    const remoteHtml = '<p>https://cdn.example.com/assets/logo.png //cdn.example.com/assets/hero.png https://cdn.example.com/frame/photo.jpg</p>'
    await f.invoke('op', { type: 'add', frame: { ...original, html: remoteHtml } })
    await f.invoke('select', [original.id])
    await f.send(settings(2, 2))
    const [remote] = await f.waitHeld(2)
    const remoteClient = await f.scoped(remote)
    const standalone = JSON.parse((await f.call(remoteClient, 'get_frame', { id: original.id, standalone: true })).content[0].text).html
    assert.ok(standalone.includes(remoteHtml), 'remote asset and frame paths remain unchanged')
    await remoteClient.close()
    await f.drain(2)
  })
  await test('T13 live drag add history selection and user camera survive independent commits', async f => {
    const original = await addOriginal(f)
    await f.send(settings(3, 2))
    const held = await f.waitHeld(2)
    const label = f.win.locator(`[data-frame-id="${original.id}"] .frame-label`)
    await label.waitFor()
    const bounds = await label.boundingBox()
    await f.win.mouse.move(bounds.x + 16, bounds.y + bounds.height / 2)
    await f.win.mouse.down()
    await f.win.mouse.move(bounds.x + 66, bounds.y + bounds.height / 2 + 30, { steps: 5 })
    await f.win.mouse.up()
    await until(async () => (await f.init()).doc.frames[0], frame => frame.x !== original.x || frame.y !== original.y, 'user drag')
    const user = { ...original, id: 'abcdef02', name: 'User addition', x: 8000, y: 0 }
    await f.invoke('op', { type: 'add', frame: user })
    await f.invoke('select', [original.id])
    const canvas = await f.win.locator('.canvas').boundingBox()
    await f.win.mouse.move(canvas.x + canvas.width / 2, canvas.y + canvas.height / 2)
    await f.win.mouse.wheel(0, 200)
    await pause(400)
    const camera = await f.win.locator('.world').evaluate(el => el.style.transform)
    f.release(held[0])
    await until(async () => (await f.init()).doc.frames.length, count => count === 3, 'first publication')
    const one = (await f.init()).doc.frames.at(-1)
    await f.invoke('op', { type: 'patch', id: one.id, patch: { html: '<div>User owns published result</div>' } })
    await f.drain(2)
    const doc = (await f.init()).doc
    assert.equal(doc.frames.length, 5)
    assert.equal(overlap(doc.frames), false)
    assert.equal(doc.frames.find(x => x.id === one.id).html, '<div>User owns published result</div>')
    assert.deepEqual(doc.frames.find(x => x.id === user.id), user)
    assert.equal(await f.win.locator('.world').evaluate(el => el.style.transform), camera)
    assert.deepEqual(await f.win.locator('[data-frame-id].is-selected').evaluateAll(nodes => nodes.map(n => n.dataset.frameId)), [original.id])
    await f.invoke('history', 'undo')
    assert.equal((await f.init()).doc.frames.length, 4)
    assert.equal((await f.init()).doc.frames.find(x => x.id === one.id).html, '<div>User owns published result</div>')
    assert.deepEqual((await f.init()).doc.frames.find(x => x.id === user.id), user)
  })
  await test('T14 project chat locks and direct changed epoch prevent cross-project publication', async f => {
    const other = join(f.dir, 'other')
    mkdirSync(other)
    await f.app.evaluate(({ dialog }, other) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [other] }) }, other)
    await f.send(settings(2, 2))
    await f.waitHeld(2)
    const chat = (await f.history()).id
    await f.invoke('project', 'open')
    await f.invoke('chats:new')
    assert.equal((await f.init()).project.dir, f.project)
    assert.equal((await f.history()).id, chat)
    await f.invoke('agent:stop'); await f.idle()
    await f.invoke('chats:new')
    assert.notEqual((await f.history()).id, chat)
    await f.invoke('project', 'open')
    assert.equal((await f.init()).project.dir, other)
    const { build } = await import('vite')
    const audit = f.dir
    symlinkSync(join(root, 'node_modules'), join(audit, 'node_modules'), 'dir')
    const entry = join(audit, 'epoch-harness.ts')
    writeFileSync(entry, `import { Store } from ${JSON.stringify(join(root, 'src/main/store'))}
import { Run } from ${JSON.stringify(join(root, 'src/main/run'))}
import { WorkerRegistry } from ${JSON.stringify(join(root, 'src/main/worker'))}
export function verify(dir) {
const store = new Store(); store.open(dir); const refs = { frames: [], assets: new Map(), selectedElements: [], browserPick: null, page: null, designNotes: '', style: null };
const run = new Run({ store, registry: new WorkerRegistry(), emit: () => {}, progress: () => {}, focus: () => {}, capturePage: async () => null, measure: async () => 100, origin: () => 'http://127.0.0.1:7999', photoKeys: () => ({}) }, { variations: { axis: 'layout', count: 2 }, agents: 2, mode: 'side' }, 'epoch fixture', { selectedFrames: [], selectedElements: [], browserPick: null, browserUrl: '', style: null }, '');
store.projectEpoch++; const result = Reflect.get(run, 'commit').call(run, { label: 'Epoch' }, [{ id: 'deadbeef', name: 'Forbidden', html: '<div>Forbidden</div>', width: 640, height: 100 }], refs); return { result, frames: store.doc.frames };
}`)
    await build({ configFile: false, logLevel: 'error', build: { ssr: entry, outDir: audit, emptyOutDir: false, rollupOptions: { output: { entryFileNames: 'epoch-harness.mjs' } } } })
    const result = await f.app.evaluate((_electron, { file, dir }) => process.getBuiltinModule('module').createRequire(file)(file).verify(dir), { file: join(audit, 'epoch-harness.mjs'), dir: join(f.dir, 'epoch-project') })
    assert.deepEqual(result, { result: [], frames: [] })
  })
  await test('T15 saved notices rebuild cards preserve ordinary session and supply prior-run references', async f => {
    await f.send(ordinary, 'Ordinary before a run.')
    await until(f.history, h => h.events.some(e => e.type === 'done'), 'ordinary session')
    await f.idle()
    const sessionId = (await f.history()).sessionId
    await f.send(settings(2, 2))
    await f.drain(2)
    const saved = await f.history()
    assert.equal(saved.sessionId, sessionId)
    const frames = (await f.init()).doc.frames
    const texts = saved.events.filter(e => e.type === 'notice').map(e => e.text)
    const { z } = await import('zod')
    const oldEvent = z.discriminatedUnion('type', [
      z.object({ type: z.literal('start'), model: z.string().nullable() }),
      z.object({ type: z.literal('model'), model: z.string() }),
      z.object({ type: z.literal('user'), text: z.string() }),
      z.object({ type: z.literal('text'), text: z.string() }),
      z.object({ type: z.literal('tool'), name: z.string(), summary: z.string() }),
      z.object({ type: z.literal('error'), text: z.string() }),
      z.object({ type: z.literal('notice'), text: z.string() }),
      z.object({ type: z.literal('done'), costUsd: z.number().nonnegative().optional(), durationMs: z.number().nonnegative().optional() })
    ])
    const oldChat = z.object({ id: z.uuid(), title: z.string(), createdAt: z.number(), updatedAt: z.number(), sessionId: z.uuid().optional(), model: z.string().optional(), events: z.array(oldEvent) })
    const parsedOldChat = oldChat.parse(saved)
    assert.equal(parsedOldChat.events.length, saved.events.length)
    assert.deepEqual(parsedOldChat.events.filter(e => e.type === 'notice').map(e => e.text), texts)
    assert.equal(parsedOldChat.events.some(e => 'run' in e), false)
    const savedFile = readFileSync(join(f.project, '.chalk/chats', `${saved.id}.json`), 'utf8')
    assert.doesNotMatch(savedFile, /Bearer|authorization/)
    await f.restart()
    assert.equal(await f.win.getByRole('group', { name: 'Parallel run', exact: true }).count(), 1)
    assert.match(await f.win.locator('.run-card-head').innerText(), /complete/)
    assert.equal((await f.history()).sessionId, sessionId)
    await f.send(ordinary, 'Continue the second variation.')
    await until(f.history, h => h.events.filter(e => e.type === 'done').length === 3, 'ordinary continuation')
    await f.idle()
    const spawn = f.logs().filter(l => l.type === 'spawn').at(-1)
    assert.ok(spawn.argv.includes(`--resume=${sessionId}`))
    const prompt = JSON.stringify(f.logs().filter(l => l.type === 'user').at(-1))
    assert.match(prompt, /Prior design runs produced these editable frames/)
    frames.forEach(frame => { assert.ok(prompt.includes(frame.id)); assert.ok(prompt.includes(frame.name)) })
    assert.equal((await f.history()).sessionId, sessionId)
    await f.send(settings(2, 2), 'Interrupted fixture')
    await f.waitHeld(2)
    const current = await f.history()
    await f.invoke('agent:stop'); await f.idle()
    const path = join(f.project, '.chalk/chats', `${current.id}.json`)
    writeFileSync(path, JSON.stringify(current))
    await f.restart()
    assert.match(await f.win.locator('.run-card').last().innerText(), /Interrupted|interrupted/)
    assert.equal(f.held().length, 0)
    await f.send(ordinary, 'Ordinary after an interrupted run.')
    assert.match(await f.win.locator('.run-card').last().innerText(), /Interrupted|interrupted/)
    await f.idle()
  })
  await test('T16 popovers support keyboard named inputs disabled modes and one count announcement', async f => {
    const variations = f.win.getByRole('button', { name: 'Variations', exact: true })
    await variations.focus(); await f.win.keyboard.press('Enter')
    const variationDialog = f.win.getByRole('dialog', { name: 'Variations', exact: true })
    await variationDialog.waitFor()
    await f.win.getByRole('radio', { name: 'Layout Different compositions, one visual identity.' }).check()
    await f.win.getByRole('spinbutton', { name: 'Number of variations' }).fill('6')
    await f.win.keyboard.press('Escape')
    assert.equal(await variations.evaluate(el => el === document.activeElement), true)
    const agents = f.win.getByRole('button', { name: 'Parallel agents', exact: true })
    await agents.focus(); await f.win.keyboard.press('Enter')
    await f.win.getByRole('dialog', { name: 'Parallel agents' }).waitFor()
    assert.equal(await f.win.getByRole('radio', { name: /Split Work/ }).isDisabled(), true)
    await f.win.getByRole('spinbutton', { name: 'Agents at once' }).fill('2')
    await f.win.getByRole('radio', { name: /Side by Side/ }).check()
    await f.win.keyboard.press('Escape')
    assert.equal(await agents.evaluate(el => el === document.activeElement), true)
    assert.equal(await f.win.locator('.run-estimate').innerText(), '6 results · up to 6 tasks · 2 at a time')
    await f.win.locator('.chat textarea').fill('Accessible real run')
    await f.win.locator('.chat textarea').press('Enter')
    await f.waitHeld(2)
    assert.equal(await variations.isDisabled(), true)
    assert.equal(await f.win.locator('.chat [role="status"]').count(), 1)
    const card = f.win.getByRole('group', { name: 'Parallel run' })
    assert.match(await card.innerText(), /running/)
    assert.match(await card.innerText(), /queued/)
    await f.win.screenshot({ path: join(evidence, 'run-controls-and-progress.png') })
    await f.win.getByRole('button', { name: 'Stop', exact: true }).click()
    await f.idle()
    assert.equal(await variations.isDisabled(), false)
  })
  await test('T17 screen plans cover whole outputs and every accepted control combination', async f => {
    const scenarios = [
      { value: settings(0, 2, 'side', 'off'), count: 2, screens: 2 },
      { value: settings(0, 2, 'split', 'off'), count: 1, screens: 3 },
      { value: settings(2, 1, 'split'), count: 2, screens: 2 },
      { value: settings(2, 2, 'side'), count: 2, screens: 3 },
      { value: settings(2, 2, 'split'), count: 2, screens: 3 },
      { value: settings(0, 6, 'split', 'off'), count: 1, screens: 12 }
    ]
    let before = 0
    for (const scenario of scenarios) {
      await f.send(scenario.value, `Design [plan:screens:${scenario.screens}]`)
      await f.drain(scenario.value.agents)
      const frames = (await f.init()).doc.frames
      assert.equal(frames.length - before, scenario.count * scenario.screens)
      assert.equal((await finished(f)).outcome, 'complete')
      before = frames.length
    }
  })

}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..')
  const artifacts = process.env.CHALK_E2E_ARTIFACTS || join(root, '.audit/parallel-agents/implementation/e2e')
  const results = []
  const check = async (name, run) => {
    const start = Date.now()
    try { await run(); results.push({ name, passed: true, durationMs: Date.now() - start }); console.log(`PASS ${name}`) }
    catch (error) { results.push({ name, passed: false, error: error.stack, durationMs: Date.now() - start }); console.error(`FAIL ${name}\n${error.stack}`) }
  }
  await checkParallel({ root, artifacts, check })
  mkdirSync(artifacts, { recursive: true })
  writeFileSync(join(artifacts, 'parallel-verification.json'), JSON.stringify(results, null, 2))
  process.exit(results.some(r => !r.passed) ? 1 : 0)
}
