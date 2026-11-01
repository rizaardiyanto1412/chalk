import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { PNG } from 'pngjs'

export async function checkPresence({ app, win, client, call, json, check, artifacts, agentTab }) {
  const evidence = join(artifacts, 'presence')
  mkdirSync(evidence, { recursive: true })
  const observations = []
  const frames = []
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Presence fixture</title>
<style>html,body{margin:0;background:#f8fafc;color:#172554;font-family:system-ui}body{min-height:1500px}main{padding:48px}h1{font-size:36px;margin:0 0 16px}p{color:#64748b}button,input{display:block;margin:24px 0;width:200px;height:44px;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#172554}button{background:#2563eb;color:#fff;border:0}input{padding:0 12px}</style>
<main><h1>A place to begin.</h1><p>The agent is reading this page.</p><button id="target" type="button">Continue</button><input id="email" placeholder="Email address"></main>
<script>window.originalWindowKeys = []; window.originalWindowKeys = Object.getOwnPropertyNames(window)</script>`)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const site = `http://127.0.0.1:${server.address().port}`
  const page = (js) => app.evaluate(({ BrowserWindow }, js) => BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.executeJavaScript(js), js)
  const debug = (method, params = {}) => app.evaluate(({ BrowserWindow }, { method, params }) => BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.debugger.sendCommand(method, params), { method, params })
  const overlay = (selector) => app.evaluate(async ({ BrowserWindow }, selector) => {
    const dbg = BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.debugger
    await dbg.sendCommand('DOM.enable')
    const { root } = await dbg.sendCommand('DOM.getDocument', { depth: -1, pierce: true })
    const findHost = (node) => node.attributes?.includes('data-chalk-presence') ? node : [...(node.children ?? []), ...(node.shadowRoots ?? [])].map(findHost).find(Boolean)
    const host = findHost(root)
    if (!host) return null
    const shadow = host.shadowRoots?.[0]
    const { nodeId } = await dbg.sendCommand('DOM.querySelector', { nodeId: shadow.nodeId, selector })
    if (!nodeId) return null
    const { object } = await dbg.sendCommand('DOM.resolveNode', { nodeId })
    const { result } = await dbg.sendCommand('Runtime.callFunctionOn', { objectId: object.objectId, functionDeclaration: `function() { const r = this.getBoundingClientRect(); const s = getComputedStyle(this); return { text: this.textContent, rect: { x:r.x, y:r.y, width:r.width, height:r.height }, opacity:s.opacity, display:s.display, transition:s.transitionDuration, pointerEvents:s.pointerEvents, animation:s.animationName, animations:this.getAnimations().map(a => ({state:a.playState, time:a.currentTime})), shadowMode:this.getRootNode().mode } }`, returnByValue: true })
    return result.value
  }, selector)
  const nativeShot = async (name) => {
    const png = await app.evaluate(async ({ BrowserWindow }) => (await BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.capturePage()).toPNG().toString('base64'))
    writeFileSync(join(evidence, name), Buffer.from(png, 'base64'))
  }
  const hiddenOverlay = async () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      if ((await overlay('.chalk-presence'))?.display === 'none') return
      await win.waitForTimeout(50)
    }
    assert.fail('The native page overlay did not hide after presence became idle')
  }
  const ref = async (label) => {
    const snapshot = (await call(client, 'browser_snapshot'))[0].text
    return snapshot.split('\n').find((line) => line.includes(`"${label}"`)).match(/\[(e\d+)\]/)[1]
  }
  const pixels = (image) => PNG.sync.read(Buffer.from(image.data, 'base64'))
  try {
    await check('MCP browser click glides the Chalk cursor to the element and plays a ripple', async () => {
      await call(client, 'browser_navigate', { url: site })
      const target = await ref('Continue')
      const center = await page('(() => {const r=document.querySelector("#target").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()')
      const pending = call(client, 'browser_click', { ref: target })
      try {
        await win.waitForTimeout(550)
        const cursor = await overlay('.presence-cursor')
        const ripple = await overlay('.presence-ripple')
        assert.match(cursor.text, /Chalk/)
        assert.ok(Math.abs(cursor.rect.x - center.x) < 3 && Math.abs(cursor.rect.y - center.y) < 3, JSON.stringify({ cursor, center }))
        assert.equal(cursor.pointerEvents, 'none')
        assert.ok(ripple.animations.some((animation) => animation.state === 'running'))
        assert.ok(Number(ripple.opacity) > 0)
        observations.push({ click: { cursor, ripple, center } })
        await nativeShot('browser-click.png')
      } finally { await pending }
      await call(client, 'browser_snapshot')
      await win.waitForTimeout(260)
      const scan = await overlay('.presence-band')
      assert.ok(scan.animations.some((animation) => animation.state === 'running'))
      await nativeShot('browser-cursor-scan.png')
    })

    await check('browser captures have identical pixels with presence present and absent, including elements and canvas capture', async () => {
      const target = await ref('Continue')
      await call(client, 'browser_click', { ref: target })
      assert.ok(await overlay('.presence-cursor'))
      const present = (await call(client, 'browser_screenshot'))[0]
      const elementPresent = (await call(client, 'browser_screenshot', { ref: target }))[0]
      const fullPresent = (await call(client, 'browser_screenshot', { full_page: true }))[0]
      await page('document.querySelector("[data-chalk-presence]").remove()')
      const absent = (await call(client, 'browser_screenshot'))[0]
      const elementAbsent = (await call(client, 'browser_screenshot', { ref: target }))[0]
      const fullAbsent = (await call(client, 'browser_screenshot', { full_page: true }))[0]
      for (const [name, a, b] of [['viewport', present, absent], ['element', elementPresent, elementAbsent], ['full-page', fullPresent, fullAbsent]]) {
        const left = pixels(a), right = pixels(b)
        assert.deepEqual([left.width, left.height], [right.width, right.height])
        assert.ok(left.data.equals(right.data), `${name} pixels changed`)
        observations.push({ capture: name, identicalPixels: true, width: left.width, height: left.height })
      }
      await call(client, 'browser_navigate', { url: site })
      const clean = pixels((await call(client, 'browser_screenshot'))[0])
      const captured = json(await call(client, 'browser_capture_to_canvas', { full_page: false, name: 'Presence capture fixture' })).created
      frames.push(captured.id)
      const image = pixels((await call(client, 'screenshot_frame', { id: captured.id }))[0])
      assert.ok(clean.data.equals(image.data))
      await call(client, 'delete_frame', { id: captured.id })
      frames.splice(frames.indexOf(captured.id), 1)
      writeFileSync(join(evidence, 'capture-comparison.json'), JSON.stringify(observations.filter((item) => item.capture), null, 2))
    })

    await check('closed browser presence exposes no page globals, text, styles, or layout changes', async () => {
      await call(client, 'browser_navigate', { url: site })
      const snapshot = (await call(client, 'browser_snapshot'))[0].text
      const styles = json(await call(client, 'browser_extract_styles'))
      assert.doesNotMatch(snapshot, /Chalk|presence-tag|presence-cursor/)
      const visibility = await page(`(() => {
        const host = document.querySelector('[data-chalk-presence]')
        const r = host.getBoundingClientRect()
        return { shadow: host.shadowRoot, children: host.children.length, text: host.textContent, keys: Object.getOwnPropertyNames(window).filter(key => !window.originalWindowKeys.includes(key)), width: r.width, height: r.height, viewport: [document.documentElement.clientWidth, document.documentElement.clientHeight], heightBefore: document.documentElement.scrollHeight, pointerEvents: getComputedStyle(host).pointerEvents }
      })()`)
      assert.equal(visibility.shadow, null)
      assert.equal(visibility.children, 0)
      assert.equal(visibility.text, '')
      assert.deepEqual(visibility.keys, [])
      assert.equal(visibility.pointerEvents, 'none')
      assert.deepEqual([visibility.width, visibility.height], visibility.viewport)
      assert.equal((await overlay('.presence-cursor')).shadowMode, 'closed')
      await page('document.querySelector("[data-chalk-presence]").remove()')
      assert.equal(await page('document.documentElement.scrollHeight'), visibility.heightBefore)
      assert.equal((await call(client, 'browser_snapshot'))[0].text, snapshot)
      assert.deepEqual(json(await call(client, 'browser_extract_styles')), styles)
      observations.push({ privacy: visibility })
    })

    await check('browser typing targets the input, scrolling targets the viewport center, and inactivity fades presence', async () => {
      await call(client, 'browser_navigate', { url: site })
      const email = await ref('Email address')
      await call(client, 'browser_type', { ref: email, text: 'chalk@example.test' })
      const cursor = await overlay('.presence-cursor')
      const input = await page('(() => {const el=document.querySelector("#email"),r=el.getBoundingClientRect();return {value:el.value,x:r.x+r.width/2,y:r.y+r.height/2}})()')
      assert.equal(input.value, 'chalk@example.test')
      assert.ok(Math.abs(cursor.rect.x - input.x) < 3 && Math.abs(cursor.rect.y - input.y) < 3)
      await call(client, 'browser_scroll', { dy: 100 })
      const scrolled = await overlay('.presence-cursor')
      const center = await page('({x:innerWidth/2,y:innerHeight/2})')
      assert.ok(Math.abs(scrolled.rect.x - center.x) < 3 && Math.abs(scrolled.rect.y - center.y) < 3)
      await win.waitForFunction(() => document.querySelector('.canvas-presence')?.getAttribute('data-phase') === 'idle', null, { timeout: 6000 })
      await hiddenOverlay()
    })

    await check('MCP create_frame shows the canvas cursor and a scaled scan without blocking canvas interaction', async () => {
      const created = json(await call(client, 'create_frame', { name: 'Presence canvas fixture', width: 360, height: 400, x: 0, y: 0, html: '<div style="height:400px;background:#f8fafc;padding:32px"><h1 style="color:#172554">A clear next step.</h1><p style="color:#64748b">Made on the canvas.</p><button style="background:#2563eb;color:white;border:0;padding:12px 20px;border-radius:8px">Get started</button></div>' })).created
      frames.push(created.id)
      await win.waitForFunction((id) => {
        const frame = document.querySelector(`[data-frame-id="${id}"]`)?.getBoundingClientRect()
        const cursor = document.querySelector('.canvas-presence .presence-cursor')?.getBoundingClientRect()
        return !!frame && !!cursor && !!document.querySelector('.canvas-presence .presence-scan') && Math.abs(cursor.x - frame.x - 12) < 3 && Math.abs(cursor.y - frame.y + 16) < 3
      }, created.id, { timeout: 3000 })
      const bounds = await win.evaluate((id) => {
        const frame = document.querySelector(`[data-frame-id="${id}"]`).getBoundingClientRect()
        const scan = document.querySelector('.canvas-presence .presence-scan').getBoundingClientRect()
        const cursor = document.querySelector('.canvas-presence .presence-cursor').getBoundingClientRect()
        const style = getComputedStyle(document.querySelector('.canvas-presence'))
        const animation = document.querySelector('.canvas-presence .presence-band').getAnimations()[0]
        return { frame: frame.toJSON(), scan: scan.toJSON(), cursor: cursor.toJSON(), pointerEvents: style.pointerEvents, animation: animation?.playState }
      }, created.id)
      for (const field of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(bounds.frame[field] - bounds.scan[field]) < 1)
      assert.ok(Math.abs(bounds.cursor.x - bounds.frame.x - 12) < 3)
      assert.ok(Math.abs(bounds.cursor.y - bounds.frame.y + 16) < 3)
      assert.equal(bounds.pointerEvents, 'none')
      assert.equal(bounds.animation, 'running')
      await win.frameLocator(`[data-frame-id="${created.id}"] iframe`).getByRole('heading', { name: 'A clear next step.' }).waitFor()
      await win.locator('.canvas').screenshot({ path: join(evidence, 'canvas-cursor-sweep.png') })
      await win.locator(`[data-frame-id="${created.id}"] .frame-label`).click()
      assert.deepEqual(json(await call(client, 'get_canvas')).selectedFrameIds, [created.id])
      observations.push({ canvas: bounds })
    })

    await check('chat presence shows the agent, model, last tool activity, a ticking timer, and completion', async () => {
      await agentTab()
      await win.evaluate(() => window.chalk.invoke('agent:send', { text: '[presence-fixture] Show the live activity.', model: 'sonnet' }))
      await win.waitForFunction(() => document.querySelector('.agent-presence .presence-activity')?.textContent === 'Reading page')
      assert.equal(await win.locator('.agent-presence strong').innerText(), 'Chalk')
      assert.equal(await win.locator('.presence-model').innerText(), 'fake-local')
      const timer = await win.locator('.presence-elapsed').innerText()
      await win.waitForFunction((previous) => document.querySelector('.presence-elapsed')?.textContent !== previous, timer)
      assert.match(await win.locator('.presence-elapsed').innerText(), /^\d+s$/)
      await win.locator('.chat').screenshot({ path: join(evidence, 'chat-status.png') })
      await call(client, 'browser_snapshot')
      await win.waitForSelector('.agent-presence', { state: 'detached', timeout: 10000 })
      assert.match(await win.locator('.msg-done').last().innerText(), /Done in 6s/)
      await win.waitForFunction(() => document.querySelector('.canvas-presence')?.getAttribute('data-phase') === 'idle')
      await hiddenOverlay()
      await win.evaluate(() => window.chalk.invoke('agent:reset'))
    })

    await check('reduced motion keeps cursors and chat status static and disables sweeps, gliding, ripples, and pulse', async () => {
      await win.emulateMedia({ reducedMotion: 'reduce' })
      await debug('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] })
      await call(client, 'browser_navigate', { url: site })
      assert.equal((await overlay('.presence-band')).display, 'none')
      const target = await ref('Continue')
      const pending = call(client, 'browser_click', { ref: target })
      try {
        await win.waitForTimeout(100)
        const cursor = await overlay('.presence-cursor')
        const ripple = await overlay('.presence-ripple')
        assert.equal(cursor.transition, '0s')
        assert.equal(ripple.display, 'none')
        assert.deepEqual(ripple.animations, [])
      } finally { await pending }
      const created = json(await call(client, 'create_frame', { name: 'Static presence fixture', width: 240, height: 200, html: '<div>Reduced motion</div>' })).created
      frames.push(created.id)
      await win.waitForSelector(`.canvas-presence[data-presence-frame="${created.id}"]`)
      assert.deepEqual(await win.locator('.canvas-presence').evaluate((el) => ({ animations: el.getAnimations({ subtree: true }).length, cursor: getComputedStyle(el.querySelector('.presence-cursor')).transitionDuration, scan: getComputedStyle(el.querySelector('.presence-band')).display })), { animations: 0, cursor: '0s', scan: 'none' })
      await win.evaluate(() => window.chalk.invoke('agent:send', { text: '[presence-fixture] Static status.', model: 'sonnet' }))
      await win.waitForSelector('.agent-presence')
      assert.equal(await win.locator('.presence-dot').evaluate((el) => el.getAnimations().length), 0)
      await win.evaluate(() => window.chalk.invoke('agent:stop'))
      await win.waitForSelector('.agent-presence', { state: 'detached' })
    })
  } finally {
    await win.emulateMedia({ reducedMotion: 'no-preference' })
    await debug('Emulation.setEmulatedMedia', { features: [] }).catch(() => {})
    await win.evaluate(() => window.chalk.invoke('agent:reset'))
    for (const id of frames) await call(client, 'delete_frame', { id })
    await call(client, 'browser_navigate', { url: `${site}/finished` })
    await win.getByLabel('Start page', { exact: true }).click()
    await win.locator('.chat-new').click()
    writeFileSync(join(evidence, 'observations.json'), JSON.stringify(observations, null, 2))
    await new Promise((resolve) => server.close(resolve))
  }
}
