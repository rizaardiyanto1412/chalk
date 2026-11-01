import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function checkBrowserDevices({ app, win, client, call, json, check, artifacts }) {
  const evidence = join(artifacts, 'browser-devices')
  mkdirSync(evidence, { recursive: true })
  const measurements = []
  let slowResponse
  let signalSlow
  const slowRequest = new Promise((resolve) => { signalSlow = resolve })
  const deadline = async (promise, stage) => {
    let timer
    try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Browser operation blocked behind a stalled load: ${stage}`)), 3000) })]) }
    finally { clearTimeout(timer) }
  }
  const originalBounds = await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0]
    const bounds = window.getBounds()
    window.setSize(bounds.width, 720)
    return bounds
  })
  await win.waitForTimeout(150)
  const server = createServer((req, res) => {
    if (req.url === '/slow') { slowResponse = res; signalSlow(); return }
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><title>${req.url}</title>${req.url === '/no-meta' ? '' : '<meta name="viewport" content="width=device-width,initial-scale=1">'}
<style>html,body{margin:0;padding:0}body{height:1400px;background:white}#narrow{display:none}@media(max-width:600px){#narrow{display:block}}#target{position:absolute;left:20px;top:40px;width:100px;height:40px;border:0;padding:0}</style>
<div id="narrow">Narrow layout</div><button id="target">Target</button><a style="position:absolute;top:100px" href="/next">Next page</a>`)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const site = `http://127.0.0.1:${server.address().port}`
  const page = (js) => app.evaluate(({ BrowserWindow }, js) => BrowserWindow.getAllWindows()[0].contentView.children[0].webContents.executeJavaScript(js), js)
  const geometry = async () => {
    await call(client, 'browser_snapshot')
    const slot = await win.locator('.browser-slot').boundingBox()
    const view = await app.evaluate(({ BrowserWindow }) => {
      const view = BrowserWindow.getAllWindows()[0].contentView.children[0]
      return { bounds: view.getBounds(), visible: view.getVisible() }
    })
    const css = await page('({width:innerWidth,height:innerHeight,narrow:matchMedia("(max-width:600px)").matches,meta:document.querySelector("meta[name=viewport]")?.content ?? null})')
    measurements.push({ at: new Date().toISOString(), slot, ...view, css })
    return { slot, ...view, css }
  }
  const contained = ({ slot, bounds }) => {
    assert.ok(bounds.x >= slot.x - 0.01 && bounds.y >= slot.y - 0.01, 'native origin stays inside slot')
    assert.ok(bounds.x + bounds.width <= slot.x + slot.width + 0.01, 'native right edge stays inside slot')
    assert.ok(bounds.y + bounds.height <= slot.y + slot.height + 0.01, 'native bottom edge stays inside slot')
    assert.ok(Math.abs(bounds.x + bounds.width / 2 - slot.x - slot.width / 2) <= 1, 'native viewport horizontally centered')
  }
  const dimensions = async (args, expected, name) => {
    const content = await call(client, 'browser_screenshot', args)
    const png = Buffer.from(content.find((item) => item.type === 'image').data, 'base64')
    writeFileSync(join(evidence, `${name}.png`), png)
    const actual = [png.readUInt32BE(16), png.readUInt32BE(20)]
    measurements.push({ capture: name, dimensions: actual })
    assert.deepEqual(actual, expected)
  }
  const set = (device) => call(client, 'browser_set_device', { device })
  try {
    await check('physical macOS focus, mouse input and accelerators for viewport presets', async () => ({ skip: 'The macOS desktop is locked. Only programmatic native input and menu routing are verified.' }))
    await check('viewport presets validate MCP input and synchronize the UI', async () => {
      const invalid = await client.callTool({ name: 'browser_set_device', arguments: { device: 'watch' } })
      assert.equal(invalid.isError, true)
      await call(client, 'browser_navigate', { url: `${site}/meta` })
      await set('phone')
      await win.waitForFunction(() => document.querySelector('#browser-device')?.value === 'phone')
      assert.match(await win.locator('.browser-device-bar').innerText(), /390 × 844/)
      await win.getByLabel('Browser viewport').selectOption('tablet')
      await win.waitForFunction(async () => (await window.chalk.invoke('init')).browser.device === 'tablet')
      assert.equal(json(await call(client, 'browser_state')).device, 'tablet')
    })
    await check('phone viewport and media query are 390x844 with and without viewport metadata', async () => {
      for (const path of ['/meta', '/no-meta']) {
        await set('phone')
        await call(client, 'browser_navigate', { url: `${site}${path}` })
        const g = await geometry()
        contained(g)
        assert.deepEqual([g.css.width, g.css.height, g.css.narrow], [390, 844, true])
        assert.equal(g.css.meta, path === '/meta' ? 'width=device-width,initial-scale=1' : null)
        await dimensions({}, [390, 844], `phone${path.replace('/', '-')}`)
        assert.match((await call(client, 'browser_snapshot'))[0].text, /Viewport: 390x844/)
      }
    })
    await check('tablet keeps 1180x820 CSS pixels as the splitter changes native fit scale', async () => {
      await set('tablet')
      const before = await geometry()
      assert.deepEqual([before.css.width, before.css.height, before.css.narrow], [1180, 820, false])
      contained(before)
      await dimensions({}, [1180, 820], 'tablet')
      const splitter = await win.locator('.splitter').boundingBox()
      await win.mouse.move(splitter.x + splitter.width / 2, splitter.y + 30)
      await win.mouse.down()
      await win.mouse.move(splitter.x + 80, splitter.y + 30, { steps: 5 })
      await win.mouse.up()
      await win.waitForTimeout(200)
      const after = await geometry()
      contained(after)
      assert.ok(after.bounds.width < before.bounds.width, 'splitter shrinks native view')
      assert.deepEqual([after.css.width, after.css.height], [1180, 820])
      await set('responsive')
      const responsive = await geometry()
      assert.equal(responsive.css.width, responsive.bounds.width)
      assert.equal(responsive.css.height, responsive.bounds.height)
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(responsive.slot[key] - responsive.bounds[key]) <= 1)
    })
    await check('phone viewport, full-page, element captures and canvas frames retain CSS dimensions', async () => {
      await set('phone')
      await call(client, 'browser_navigate', { url: `${site}/no-meta` })
      await dimensions({}, [390, 844], 'viewport')
      await dimensions({ full_page: true }, [390, 1400], 'full-page')
      const snapshot = (await call(client, 'browser_snapshot'))[0].text
      const ref = snapshot.match(/\[(e\d+)\] button "Target"/)[1]
      await dimensions({ ref }, [100, 40], 'element')
      for (const [args, expected] of [[{ full_page: false }, [390, 844]], [{ full_page: true }, [390, 1400]], [{ ref }, [100, 40]]]) {
        const captured = json(await call(client, 'browser_capture_to_canvas', { ...args, name: 'Viewport test' })).created
        measurements.push({ frame: captured.id, width: captured.width, height: captured.height })
        assert.deepEqual([captured.width, captured.height], expected)
      }
      assert.match((await call(client, 'browser_snapshot'))[0].text, /Viewport: 390x844/)
    })
    await check('scaled native input picks the target and reports its CSS rectangle', async () => {
      await win.evaluate(() => window.chalk.invoke('browser', 'clearPick'))
      await win.getByLabel('Pick element', { exact: true }).click()
      const g = await geometry()
      assert.ok(g.bounds.width / 390 < 1, 'pick runs below scale one')
      await app.evaluate(({ BrowserWindow }) => {
        const view = BrowserWindow.getAllWindows()[0].contentView.children[0]
        const scale = view.getBounds().width / 390
        const point = { x: Math.round(70 * scale), y: Math.round(60 * scale) }
        view.webContents.sendInputEvent({ type: 'mouseMove', ...point })
        for (const type of ['mouseDown', 'mouseUp']) view.webContents.sendInputEvent({ type, ...point, button: 'left', clickCount: 1 })
      })
      await win.waitForFunction(() => document.querySelector('.chip.is-pick')?.textContent.includes('Target'))
      const pick = json(await call(client, 'get_canvas')).browserPick
      assert.equal(pick.selector, 'button#target')
      assert.deepEqual(pick.rect, { x: 20, y: 40, width: 100, height: 40 })
      measurements.push({ pick })
    })
    await check('navigation, back, forward, reload, home, hide and MCP focus retain the preset', async () => {
      await call(client, 'browser_navigate', { url: `${site}/next` })
      await call(client, 'browser_back')
      assert.match(json(await call(client, 'browser_state')).url, /\/no-meta$/)
      assert.deepEqual(await page('[innerWidth, innerHeight]'), [390, 844])
      await win.evaluate(() => window.chalk.invoke('browser', 'forward'))
      assert.match(json(await call(client, 'browser_state')).url, /\/next$/)
      assert.deepEqual(await page('[innerWidth, innerHeight]'), [390, 844])
      await win.evaluate(() => window.chalk.invoke('browser', 'reload'))
      assert.deepEqual(await page('[innerWidth, innerHeight]'), [390, 844])
      await win.getByLabel('Start page', { exact: true }).click()
      assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children[0].getVisible()), false)
      await win.getByLabel('Start page', { exact: true }).click()
      await win.getByLabel('Close browser', { exact: true }).click()
      await win.waitForSelector('.browser-panel', { state: 'detached' })
      await call(client, 'browser_snapshot')
      await win.waitForSelector('#browser-device')
      assert.equal(await win.getByLabel('Browser viewport').inputValue(), 'phone')
      assert.equal(json(await call(client, 'browser_state')).device, 'phone')
      const current = await geometry()
      assert.deepEqual([current.css.width, current.css.height], [390, 844])
    })
    await check('overlapping captures and preset changes finish with the current viewport', async () => {
      await Promise.all([call(client, 'browser_screenshot', { full_page: true }), set('tablet'), set('phone')])
      assert.equal(json(await call(client, 'browser_state')).device, 'phone')
      const current = await geometry()
      assert.deepEqual([current.css.width, current.css.height], [390, 844])
      await dimensions({}, [390, 844], 'after-concurrent-capture')
      await win.screenshot({ path: join(evidence, 'phone-ui.png') })
    })
    await check('navigation leaves a stalled load even with a pending viewport update', async () => {
      const pending = call(client, 'browser_navigate', { url: `${site}/slow` })
      try {
        await deadline(slowRequest, 'fixture request')
        const change = set('tablet')
        await deadline(call(client, 'browser_navigate', { url: `${site}/recovered` }), 'navigation away')
        await deadline(change, 'viewport after recovery')
        await deadline(pending, 'aborted navigation settlement')
        assert.match(json(await call(client, 'browser_state')).url, /\/recovered$/)
        assert.deepEqual(await page('[innerWidth, innerHeight]'), [1180, 820])
      } finally {
        slowResponse?.end('<title>Released stalled fixture</title>')
        await pending.catch(() => {})
      }
    })
  } finally {
    await win.mouse.up()
    await set('responsive')
    await app.evaluate(({ BrowserWindow }, bounds) => BrowserWindow.getAllWindows()[0].setBounds(bounds), originalBounds)
    writeFileSync(join(evidence, 'measurements.json'), JSON.stringify({ recordedAt: new Date().toISOString(), measurements, limits: ['Native input was programmatic. Physical macOS focus, mouse and accelerators were not tested.'] }, null, 2))
    await new Promise((resolve) => server.close(resolve))
  }
}

export async function checkBrowserDevicePreference({ electron, root, project, artifacts, check }) {
  await check('viewport preference parses invalid saved values and restores the latest choice after restart', async () => {
    const profile = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-device-preference-')))
    writeFileSync(join(profile, 'config.json'), JSON.stringify({ projectDir: project, projects: [project], recentUrls: [], browserViewport: 'unknown-device' }))
    const launch = () => electron.launch({ args: [root, `--user-data-dir=${profile}`], cwd: root, env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !['ELECTRON_RUN_AS_NODE', 'CHALK_PROJECT_DIR'].includes(key))), CHALK_PORT: String((Number(process.env.CHALK_PORT) || 7911) + 2), ELECTRON_RENDERER_URL: '' } })
    let instance
    const init = async () => {
      instance = await launch()
      assert.equal(realpathSync(await instance.evaluate(({ app }) => app.getPath('userData'))), profile)
      const window = await instance.firstWindow()
      await window.waitForSelector('#browser-device')
      return window
    }
    try {
      let window = await init()
      assert.equal(await window.getByLabel('Browser viewport').inputValue(), 'desktop')
      await window.evaluate(() => window.chalk.invoke('browser', 'device', 'phone'))
      assert.equal(JSON.parse(readFileSync(join(profile, 'config.json'), 'utf8')).browserViewport, 'phone')
      await instance.close()
      instance = undefined
      window = await init()
      assert.equal(await window.getByLabel('Browser viewport').inputValue(), 'phone')
      writeFileSync(join(artifacts, 'browser-devices', 'preference.json'), JSON.stringify({ profile, restored: 'phone', invalidFallback: 'desktop' }, null, 2))
    } finally {
      await instance?.close()
    }
  })
}
