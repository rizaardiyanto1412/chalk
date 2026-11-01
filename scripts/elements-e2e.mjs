import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function checkElements({ app, win, client, call, json, check, project, artifacts, fakeLog }) {
  const source = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-elements-')))
  const evidence = join(artifacts, 'elements')
  mkdirSync(evidence, { recursive: true })
  const html = `<main style="padding:32px;background:#f8fafc;height:100vh;box-sizing:border-box"><h1 style="margin:0 0 24px;font-size:24px">Workspace</h1><nav style="padding:16px;width:240px;background:white;box-sizing:border-box"><button id="target" style="display:block;width:208px;height:36px;border:0;border-radius:6px;background:#e8efff;color:#2563eb;text-align:left;padding:0 12px">Dashboard</button><button style="display:block;width:208px;height:36px;border:0;background:white;text-align:left;padding:0 12px">Projects</button></nav><div id="wrapper" style="width:208px;height:36px;margin-top:24px"><button id="wrapped" style="pointer-events:none;display:block;width:208px;height:36px;border:0">Wrapped item</button></div></main>`
  const fixtures = [
    { id: 'element-design', name: 'Element selection', x: 0, y: 0, width: 640, height: 480, html },
    { id: 'element-hostile', name: 'Hostile frame', x: 720, y: 0, width: 320, height: 480, html: '<p>Untrusted frame</p><script>window.attack=()=>{for(const type of ["chalk:element","element:select","element:delete","select","op"]){parent.postMessage({type,requestId:"11111111-1111-4111-8111-111111111111",hit:{path:[0,1,0],rect:{x:0,y:0,width:999,height:999}},frameId:"element-design",ids:["element-hostile"],html:"<p>injected</p>"},"*")}};setInterval(window.attack,30)</script>' }
  ].map((f) => ({ ...f, kind: 'html', updatedAt: 1 }))
  writeFileSync(join(source, 'chalk.json'), JSON.stringify({ version: 1, frames: fixtures }))
  const until = async (predicate, arg) => {
    for (let i = 0; i < 200; i++) {
      if (await win.evaluate(predicate, arg)) return
      await win.waitForTimeout(20)
    }
    assert.fail('Element selection did not reach the expected state')
  }
  const state = () => win.evaluate(async () => (await window.chalk.invoke('init')).doc)
  const canvas = async () => json(await call(client, 'get_canvas'))
  const focus = async () => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.focus())
    await win.locator('.canvas').focus()
  }
  const select = async (ids) => { await win.evaluate((ids) => window.chalk.invoke('select', ids), ids); await focus() }
  const design = () => win.frameLocator('[data-frame-id="element-design"] iframe:not(.is-pending)')
  const point = async (selector = '#target') => {
    const local = await design().locator(selector).evaluate((el) => {
      const rect = el.getBoundingClientRect()
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
    })
    const box = await win.locator('[data-frame-id="element-design"]').boundingBox()
    const zoom = await win.locator('.canvas').evaluate((el) => Number(el.style.getPropertyValue('--zoom')))
    return { x: box.x + local.x * zoom, y: box.y + local.y * zoom }
  }
  const click = async (selector = '#target', modifiers = []) => {
    const p = await point(selector)
    for (const key of modifiers) await win.keyboard.down(key)
    await win.mouse.click(p.x, p.y)
    for (const key of modifiers) await win.keyboard.up(key)
  }
  const picked = async (tag = 'button') => until(async (tag) => {
    const selected = (await window.chalk.invoke('init')).selectedElement
    return selected?.tag === tag && document.querySelector('.element-outline.is-selected')?.getAttribute('data-element-path') === selected.path.join('/') && document.querySelector('.element-chip')?.textContent.includes(`<${tag}>`)
  }, tag)
  const reset = async () => {
    await until(async () => {
      const frame = (await window.chalk.invoke('init')).doc.frames.find((f) => f.id === 'element-design')
      const iframe = document.querySelector('[data-frame-id="element-design"] iframe:not(.is-pending)')
      return frame && iframe && new URL(iframe.src).searchParams.get('v') === String(frame.updatedAt) && !document.querySelector('[data-frame-id="element-design"] iframe.is-pending')
    })
    await select([])
    await win.getByRole('button', { name: 'Zoom to fit (⌘0)', exact: true }).click()
    await focus()
  }
  const run = (name, fn) => check(name, async () => {
    await reset()
    try { await fn() } catch (error) {
      await win.screenshot({ path: join(evidence, 'failure.png') })
      writeFileSync(join(evidence, 'failure.json'), JSON.stringify({ name, canvas: await canvas(), doc: await state() }, null, 2))
      throw error
    } finally {
      await win.mouse.up()
      for (const key of ['Meta', 'Shift', 'Space']) await win.keyboard.up(key)
    }
  })
  try {
    await app.evaluate(({ dialog }, dir) => {
      globalThis.originalElementsDialog = dialog.showOpenDialog
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
    }, source)
    await win.evaluate(() => window.chalk.invoke('project', 'open'))
    await win.waitForFunction((dir) => document.querySelector('.tab.is-on')?.getAttribute('title') === dir, source)
    if (await win.getByRole('button', { name: 'Hide browser', exact: true }).count()) await win.getByRole('button', { name: 'Hide browser', exact: true }).click()
    await design().locator('#target').waitFor({ state: 'attached' })
    await run('element click selects the frame first, then shows four handles and the CSS size badge', async () => {
      await click()
      assert.deepEqual((await canvas()).selectedFrameIds, ['element-design'])
      assert.equal((await canvas()).selectedElement, null)
      await click()
      await picked()
      assert.equal(await win.locator('.element-size').innerText(), '208 × 36')
      assert.equal(await win.locator('.element-handle').count(), 4)
      const element = (await canvas()).selectedElement
      assert.deepEqual(element.path, [0, 1, 0])
      assert.equal(element.text, 'Dashboard')
      assert.equal(element.frameName, 'Element selection')
      assert.equal(element.rect.width, 208)
      assert.equal(element.rect.height, 36)
      assert.match(element.outerHTML, /id="target"/)
      await win.locator('.left-tabs button', { hasText: 'Frames' }).click()
      assert.match(await win.getByLabel('Selected element', { exact: true }).innerText(), /<button>.*Dashboard.*208 × 36 px/s)
      await win.screenshot({ path: join(evidence, 'element-selection.png') })
    })
    await run('Cmd-click directly selects an element and hover outlines require selection or Cmd', async () => {
      const p = await point()
      await win.mouse.move(p.x, p.y)
      assert.equal(await win.locator('.element-outline.is-hover').count(), 0)
      await win.keyboard.down('Meta')
      await win.locator('.element-outline.is-hover').waitFor()
      await win.keyboard.up('Meta')
      await win.locator('.element-outline.is-hover').waitFor({ state: 'detached' })
      await click('#target', ['Meta'])
      await picked()
      await win.mouse.move(p.x + 2, p.y)
      await win.locator('.element-outline.is-hover').waitFor()
      assert.equal((await canvas()).selectedElement.frameId, 'element-design')
      await select(['element-design', 'element-hostile'])
      await click('#target', ['Meta'])
      await picked()
      assert.deepEqual((await canvas()).selectedFrameIds, ['element-design'])
    })
    await run('Escape walks from the element to each parent, the frame, and then nothing', async () => {
      await click('#target', ['Meta'])
      await picked()
      for (const tag of ['nav', 'main']) { await win.keyboard.press('Escape'); await picked(tag) }
      await win.keyboard.press('Escape')
      await until(async () => (await window.chalk.invoke('init')).selectedElement === null)
      assert.deepEqual((await canvas()).selectedFrameIds, ['element-design'])
      await win.locator('.element-size').waitFor({ state: 'detached' })
      await win.keyboard.press('Escape')
      await win.waitForFunction(() => document.querySelectorAll('.frame.is-selected').length === 0)
      assert.deepEqual((await canvas()).selectedFrameIds, [])
    })
    await run('element Delete edits stored HTML and one Undo restores the exact fragment', async () => {
      await click('#target', ['Meta'])
      await picked()
      await win.keyboard.press('Backspace')
      await until(async () => !(await window.chalk.invoke('init')).doc.frames[0].html.includes('id="target"'))
      assert.equal((await state()).frames.length, 2)
      assert.match((await state()).frames[0].html, /Projects/)
      assert.equal((await canvas()).selectedElement, null)
      assert.equal(await win.evaluate(() => window.chalk.invoke('history', 'undo')), true)
      assert.equal((await state()).frames[0].html, html)
      assert.equal(await win.evaluate(() => window.chalk.invoke('history', 'undo')), false)
      await design().locator('#target').waitFor({ state: 'attached' })
      await win.locator('[data-frame-id="element-design"] iframe.is-pending').waitFor({ state: 'detached' })
    })
    await run('wrapper hit testing picks its deepest meaningful child', async () => {
      await click('#wrapper', ['Meta'])
      await picked()
      assert.deepEqual((await canvas()).selectedElement.path, [0, 2, 0])
      assert.equal((await canvas()).selectedElement.text, 'Wrapped item')
    })
    await run('element overlay follows frame moves, camera pan and zoom, and a buffered HTML reload', async () => {
      await click('#target', ['Meta'])
      await picked()
      const original = (await state()).frames[0]
      const verify = async () => {
        const rect = await design().locator('#target').evaluate((el) => {
          const r = el.getBoundingClientRect()
          return { x: r.x, y: r.y, width: r.width, height: r.height }
        })
        await win.waitForFunction((rect) => {
          const frame = document.querySelector('[data-frame-id="element-design"]').getBoundingClientRect()
          const overlay = document.querySelector('.element-outline.is-selected')?.getBoundingClientRect()
          const zoom = Number(document.querySelector('.canvas').style.getPropertyValue('--zoom'))
          const expected = { x: frame.x + rect.x * zoom, y: frame.y + rect.y * zoom, width: rect.width * zoom, height: rect.height * zoom }
          return overlay && Object.keys(expected).every((key) => Math.abs(overlay[key] - expected[key]) < 1.5)
        }, rect)
        assert.equal(await win.locator('.element-size').innerText(), '208 × 36')
      }
      await verify()
      await win.evaluate((id) => window.chalk.invoke('op', { type: 'patch', id, patch: { x: 40, y: 25 } }), original.id)
      await verify()
      await win.getByRole('button', { name: 'Zoom in', exact: true }).click()
      await verify()
      await win.locator('.canvas').dispatchEvent('wheel', { deltaX: 25, deltaY: 15 })
      await verify()
      await win.evaluate(({ id, html }) => window.chalk.invoke('op', { type: 'patch', id, patch: { html: html.replace('padding:32px', 'padding:42px') } }), original)
      await win.locator('[data-frame-id="element-design"] iframe.is-pending').waitFor({ state: 'detached' })
      await until(async () => (await window.chalk.invoke('init')).selectedElement?.rect.x === 58)
      await verify()
      await win.evaluate(({ id, html }) => window.chalk.invoke('op', { type: 'patch', id, patch: { html, x: 0, y: 0 } }), original)
      await win.locator('[data-frame-id="element-design"] iframe.is-pending').waitFor({ state: 'detached' })
    })
    await run('get_canvas and the chat composer and agent turn share stored element context', async () => {
      await click('#target', ['Meta'])
      await picked()
      await win.locator('.left-tabs button', { hasText: 'Agent' }).click()
      assert.match(await win.locator('.element-chip').innerText(), /<button> Dashboard/)
      const element = (await canvas()).selectedElement
      await win.evaluate(() => window.chalk.invoke('agent:send', { text: 'Change this selected element', model: '' }))
      for (let i = 0; i < 100; i++) {
        const messages = readFileSync(fakeLog, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line))
        const sent = messages.filter((message) => message.type === 'user').at(-1)
        if (sent && JSON.stringify(sent).includes('Selected canvas element')) {
          const text = JSON.stringify(sent)
          for (const value of [element.frameId, element.frameName, 'Dashboard', 'outerHTML', '208']) assert.ok(text.includes(value), `Agent context includes ${value}`)
          return
        }
        await win.waitForTimeout(30)
      }
      assert.fail('The agent did not receive the element context')
    })
    await run('hostile iframe messages cannot select elements, delete frames, or submit live HTML', async () => {
      const original = await state()
      await win.waitForTimeout(300)
      assert.equal((await canvas()).selectedElement, null)
      assert.deepEqual((await canvas()).selectedFrameIds, [])
      await click('#target', ['Meta'])
      await picked()
      const expected = (await canvas()).selectedElement
      await win.frameLocator('[data-frame-id="element-hostile"] iframe').locator('body').evaluate(() => window.attack())
      await design().locator('body').evaluate(() => {
        for (const type of ['element:delete', 'element:select', 'chalk:element']) parent.postMessage({ type, requestId: '11111111-1111-4111-8111-111111111111', hit: { path: [0], rect: { x: 0, y: 0, width: 999, height: 999 } } }, '*')
        const injected = document.createElement('p'); injected.textContent = 'LIVE INJECTED CONTENT'; document.body.append(injected)
      })
      await win.waitForTimeout(300)
      assert.deepEqual((await canvas()).selectedElement, expected)
      assert.deepEqual(await state(), original)
      await win.keyboard.press('Delete')
      await until(async () => !(await window.chalk.invoke('init')).doc.frames[0].html.includes('id="target"'))
      assert.ok(!(await state()).frames[0].html.includes('LIVE INJECTED CONTENT'))
      await win.evaluate(() => window.chalk.invoke('history', 'undo'))
    })
    await run('the hit-test bridge appears only in canvas documents and frames stay opaque', async () => {
      const port = await win.evaluate(async () => (await window.chalk.invoke('init')).port)
      const plain = (await call(client, 'get_frame', { id: fixtures[0].id, standalone: true }))[0].text
      const standalone = await (await fetch(`http://127.0.0.1:${port}/frame/${fixtures[0].id}`)).text()
      const canvasDocument = await (await fetch(`http://127.0.0.1:${port}/frame/${fixtures[0].id}?canvas=1`)).text()
      assert.ok(!plain.includes('chalk:hit'))
      assert.ok(!standalone.includes('chalk:hit'))
      assert.ok(canvasDocument.includes('chalk:hit'))
      assert.equal(await win.locator('[data-frame-id="element-design"] iframe').getAttribute('sandbox'), 'allow-scripts')
      assert.equal(await design().locator('body').evaluate(() => {
        try { void parent.document.body; return false } catch { return true }
      }), true)
    })
    await run('selection clears when its path disappears or the project changes', async () => {
      await click('#wrapped', ['Meta'])
      await picked()
      await win.evaluate((id) => window.chalk.invoke('op', { type: 'patch', id, patch: { html: '<p>Replacement</p>' } }), fixtures[0].id)
      await until(async () => (await window.chalk.invoke('init')).selectedElement === null)
      await win.locator('.element-size').waitFor({ state: 'detached' })
      await win.evaluate((dir) => window.chalk.invoke('project', 'switch', dir), project)
      await until(async () => (await window.chalk.invoke('init')).selectedElement === null)
    })
  } finally {
    await win.evaluate(() => window.chalk.invoke('agent:stop'))
    await app.evaluate(({ dialog }) => { dialog.showOpenDialog = globalThis.originalElementsDialog })
    await win.evaluate((dir) => window.chalk.invoke('project', 'switch', dir), project)
  }
}
