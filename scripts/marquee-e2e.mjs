import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function checkMarquee({ app, win, client, call, json, check, project, artifacts, fakeLog }) {
  const source = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-marquee-')))
  const evidence = join(artifacts, 'marquee')
  mkdirSync(evidence, { recursive: true })
  const html = `<main style="position:relative;width:640px;height:480px;background:#f8fafc"><div id="wrapper" style="position:absolute;left:40px;top:40px;width:200px;height:40px"><button id="alpha" style="display:block;width:200px;height:40px;border:0;background:#dbeafe">Alpha</button></div><button id="beta" style="position:absolute;left:260px;top:40px;width:160px;height:40px;border:0;background:#dcfce7">Beta</button><button id="gamma" style="position:absolute;left:40px;top:160px;width:200px;height:40px;border:0;background:#ffedd5">Gamma</button><section id="nested" style="position:absolute;left:300px;top:160px;width:240px;height:160px;background:#e2e8f0"><button id="child" style="width:120px;height:40px;border:0">Child</button></section><script>window.marqueeMarker=true</script></main>`
  const hostile = `<p>Untrusted frame</p><script>window.attack=(requestId)=>parent.postMessage({type:'chalk:element',requestId,hits:[{path:[0,1],rect:{x:0,y:0,width:999,height:999}}]},'*');setInterval(()=>window.attack('11111111-1111-4111-8111-111111111111'),20)</script>`
  const fixtures = [
    { id: 'marquee-design', name: 'Marquee selection', x: 0, y: 0, width: 640, height: 480, html },
    { id: 'marquee-hostile', name: 'Hostile frame', x: 720, y: 0, width: 320, height: 480, html: hostile }
  ].map((frame) => ({ ...frame, kind: 'html', updatedAt: 1 }))
  writeFileSync(join(source, 'chalk.json'), JSON.stringify({ version: 1, frames: fixtures }))
  const state = () => win.evaluate(() => window.chalk.invoke('init'))
  const canvas = async () => json(await call(client, 'get_canvas'))
  const focus = async () => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.focus())
    await win.locator('.canvas').focus()
  }
  const until = async (predicate, arg) => {
    for (let i = 0; i < 200; i++) {
      if (await win.evaluate(predicate, arg)) return
      await win.waitForTimeout(20)
    }
    assert.fail('Marquee selection did not reach the expected state')
  }
  const selected = async (paths) => until(async (paths) => {
    const { selectedElements } = await window.chalk.invoke('init')
    const chip = document.querySelector('.element-chip')?.textContent
    const label = selectedElements.length > 1 ? `${selectedElements.length} elements` : selectedElements[0] && `<${selectedElements[0].tag}> ${selectedElements[0].text.slice(0, 28)}`
    return JSON.stringify(selectedElements.map((hit) => hit.path)) === JSON.stringify(paths) && document.querySelectorAll('.element-outline.is-selected').length === paths.length && !document.querySelector('.canvas-marquee') && (label ? chip?.includes(label) : !chip)
  }, paths)
  const design = () => win.frameLocator('[data-frame-id="marquee-design"] iframe:not(.is-pending)')
  const geometry = async () => ({
    box: await win.locator('[data-frame-id="marquee-design"]').boundingBox(),
    zoom: await win.locator('.canvas').evaluate((el) => Number(el.style.getPropertyValue('--zoom')))
  })
  const point = async (x, y) => {
    const { box, zoom } = await geometry()
    return { x: box.x + x * zoom, y: box.y + y * zoom }
  }
  const click = async (selector, modifiers = []) => {
    const rect = await design().locator(selector).evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })
    const p = await point(rect.x, rect.y)
    for (const key of modifiers) await win.keyboard.down(key)
    await win.mouse.click(p.x, p.y)
    for (const key of modifiers) await win.keyboard.up(key)
  }
  const drag = async (start, end, during) => {
    await win.mouse.move(start.x, start.y)
    await win.mouse.down()
    await win.mouse.move(end.x, end.y, { steps: 8 })
    if (during) await during()
    await win.mouse.up()
  }
  const partial = async (during) => drag(await point(-20, 10), await point(430, 100), during)
  const reset = async () => {
    await win.evaluate(() => window.chalk.invoke('select', []))
    await win.getByLabel('Select (V)', { exact: true }).click()
    await win.getByRole('button', { name: 'Zoom to fit (⌘0)', exact: true }).click()
    await focus()
    await win.locator('[data-frame-id="marquee-design"] iframe.is-pending').waitFor({ state: 'detached' })
  }
  const run = (name, fn) => check(name, async () => {
    await reset()
    try { await fn() } catch (error) {
      await win.screenshot({ path: join(evidence, 'failure.png') })
      writeFileSync(join(evidence, 'failure.json'), JSON.stringify({ name, selectedElements: (await state()).selectedElements, doc: (await state()).doc, ui: await win.evaluate(() => ({ chip: document.querySelector('.element-chip')?.textContent, outlines: [...document.querySelectorAll('.element-outline')].map((el) => [el.className, el.dataset.elementPath, el.textContent]), badge: document.querySelector('.element-size')?.textContent })) }, null, 2))
      throw error
    } finally {
      await win.mouse.up()
      for (const key of ['Meta', 'Shift', 'Space']) await win.keyboard.up(key)
    }
  })
  try {
    await app.evaluate(({ dialog }, dir) => {
      globalThis.originalMarqueeDialog = dialog.showOpenDialog
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
    }, source)
    await win.evaluate(() => window.chalk.invoke('project', 'open'))
    await win.waitForFunction((dir) => document.querySelector('.tab.is-on')?.getAttribute('title') === dir, source)
    if (await win.getByRole('button', { name: 'Hide browser', exact: true }).count()) await win.getByRole('button', { name: 'Hide browser', exact: true }).click()
    await design().locator('#alpha').waitFor({ state: 'attached' })
    await run('marquee enclosing two frames previews and selects both without panning', async () => {
      const before = await geometry()
      await drag(await point(-20, -55), await point(1060, 500), async () => {
        await win.locator('.canvas-marquee').waitFor()
        assert.equal(await win.locator('.frame.is-marquee-preview').count(), 2)
        assert.deepEqual((await canvas()).selectedFrameIds, [])
      })
      await win.waitForFunction(() => document.querySelectorAll('.frame.is-selected').length === 2)
      assert.deepEqual((await canvas()).selectedFrameIds, fixtures.map((frame) => frame.id))
      assert.deepEqual((await canvas()).selectedElements, [])
      assert.deepEqual(await geometry(), before)
    })
    await run('partial marquee selects meaningful children and shows the 380 by 40 CSS union', async () => {
      await partial(async () => {
        await win.waitForFunction(() => document.querySelectorAll('.element-outline.is-selected').length === 2)
        assert.equal(await win.locator('.element-size').innerText(), '380 × 40')
        assert.deepEqual((await canvas()).selectedElements, [])
        await win.screenshot({ path: join(evidence, 'marquee-in-progress.png') })
      })
      await selected([[0, 0, 0], [0, 1]])
      assert.deepEqual((await canvas()).selectedElements.map((hit) => hit.text), ['Alpha', 'Beta'])
      assert.equal(await win.locator('.element-outline.is-union').count(), 1)
      assert.equal(await win.locator('.element-handle').count(), 4)
      assert.equal(await win.locator('.element-size').innerText(), '380 × 40')
      await win.locator('.left-tabs button', { hasText: 'Frames' }).click()
      assert.match(await win.getByLabel('Selected element', { exact: true }).innerText(), /2 elements.*380 × 40 px/s)
      await win.screenshot({ path: join(evidence, 'multi-element-selection.png') })
      await win.getByRole('button', { name: 'Zoom in', exact: true }).click()
      assert.equal(await win.locator('.element-size').innerText(), '380 × 40')
    })
    await run('Shift-click adds and removes an element in the same frame', async () => {
      await click('#alpha', ['Meta'])
      await selected([[0, 0, 0]])
      await click('#beta', ['Shift'])
      await selected([[0, 0, 0], [0, 1]])
      await click('#alpha', ['Shift'])
      await selected([[0, 1]])
      assert.equal(await win.locator('.element-size').innerText(), '160 × 40')
      await click('#beta', ['Shift'])
      await selected([])
      assert.deepEqual((await canvas()).selectedFrameIds, ['marquee-design'])
    })
    await run('Delete removes multiple stored elements and one Undo restores the exact HTML', async () => {
      await partial()
      await selected([[0, 0, 0], [0, 1]])
      await win.keyboard.press('Delete')
      await until(async () => !(await window.chalk.invoke('init')).doc.frames[0].html.includes('id="alpha"'))
      const edited = (await state()).doc.frames[0].html
      assert.ok(!edited.includes('id="beta"'))
      assert.ok(edited.includes('id="gamma"'))
      assert.deepEqual((await canvas()).selectedElements, [])
      assert.equal(await win.evaluate(() => window.chalk.invoke('history', 'undo')), true)
      assert.equal((await state()).doc.frames[0].html, html)
      assert.equal(await win.evaluate(() => window.chalk.invoke('history', 'undo')), false)
    })
    await run('nested selections delete the ancestor once and preserve later source offsets', async () => {
      await click('#nested', ['Meta'])
      await selected([[0, 3]])
      await click('#child', ['Shift'])
      await selected([[0, 3], [0, 3, 0]])
      await click('#alpha', ['Shift'])
      await selected([[0, 3], [0, 3, 0], [0, 0, 0]])
      await win.keyboard.press('Backspace')
      await until(async () => !(await window.chalk.invoke('init')).doc.frames[0].html.includes('id="nested"'))
      const edited = (await state()).doc.frames[0].html
      assert.ok(!edited.includes('id="child"') && !edited.includes('id="alpha"'))
      assert.ok(edited.includes('id="beta"') && edited.includes('id="gamma"') && edited.includes('window.marqueeMarker=true'))
      assert.equal(await win.evaluate(() => window.chalk.invoke('history', 'undo')), true)
      assert.equal((await state()).doc.frames[0].html, html)
    })
    await run('Escape promotes multiple elements to their frame and an empty click clears selection', async () => {
      await partial()
      await selected([[0, 0, 0], [0, 1]])
      await win.keyboard.press('Escape')
      await selected([])
      assert.deepEqual((await canvas()).selectedFrameIds, ['marquee-design'])
      const p = await point(-20, 100)
      await win.mouse.click(p.x, p.y)
      await win.waitForFunction(() => document.querySelectorAll('.frame.is-selected').length === 0)
      assert.deepEqual((await canvas()).selectedFrameIds, [])
      await click('#alpha', ['Meta'])
      await selected([[0, 0, 0]])
      await win.mouse.click(p.x, p.y)
      await selected([])
      assert.deepEqual((await canvas()).selectedFrameIds, [])
    })
    await run('Space-drag, Hand tool, and middle mouse pan without marquee selection', async () => {
      for (const mode of ['Space', 'Hand', 'middle']) {
        await reset()
        const before = await geometry()
        const original = (await state()).doc
        if (mode === 'Space') await win.keyboard.down('Space')
        if (mode === 'Hand') await win.getByLabel('Hand (H)', { exact: true }).click()
        const start = await point(-20, 120)
        await win.mouse.move(start.x, start.y)
        await win.mouse.down({ button: mode === 'middle' ? 'middle' : 'left' })
        await win.mouse.move(start.x + 60, start.y + 30, { steps: 5 })
        assert.equal(await win.locator('.canvas-marquee').count(), 0)
        await win.mouse.up({ button: mode === 'middle' ? 'middle' : 'left' })
        if (mode === 'Space') await win.keyboard.up('Space')
        const after = await geometry()
        assert.ok(Math.abs(after.box.x - before.box.x - 60) < 1.5)
        assert.ok(Math.abs(after.box.y - before.box.y - 30) < 1.5)
        assert.deepEqual((await state()).doc, original)
        assert.deepEqual((await canvas()).selectedFrameIds, [])
      }
    })
    await run('Shift at release adds frames and same-frame elements and partial overlap selects several frames', async () => {
      await win.evaluate(() => window.chalk.invoke('select', ['marquee-hostile']))
      await focus()
      await drag(await point(-20, -55), await point(660, 500), async () => win.keyboard.down('Shift'))
      await win.keyboard.up('Shift')
      assert.deepEqual((await canvas()).selectedFrameIds, ['marquee-hostile', 'marquee-design'])
      await reset()
      await drag(await point(-20, 100), await point(800, 250))
      assert.deepEqual((await canvas()).selectedFrameIds, ['marquee-design', 'marquee-hostile'])
      await reset()
      await click('#gamma', ['Meta'])
      await selected([[0, 2]])
      await partial(async () => win.keyboard.down('Shift'))
      await win.keyboard.up('Shift')
      await selected([[0, 2], [0, 0, 0], [0, 1]])
      assert.equal(await win.locator('.element-size').innerText(), '380 × 160')
    })
    await run('multi-element chat chip and agent context match the get_canvas array', async () => {
      await partial()
      await selected([[0, 0, 0], [0, 1]])
      await win.locator('.left-tabs button', { hasText: 'Agent' }).click()
      assert.equal((await win.locator('.element-chip').innerText()).trim(), '2 elements')
      const expected = (await canvas()).selectedElements
      assert.ok(!('selectedElement' in await canvas()))
      await win.evaluate(() => window.chalk.invoke('agent:send', { text: 'Change these two selected elements', model: '' }))
      for (let i = 0; i < 100; i++) {
        const sent = readFileSync(fakeLog, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)).filter((message) => message.type === 'user').at(-1)
        if (sent && JSON.stringify(sent).includes('Change these two selected elements')) {
          const text = JSON.stringify(sent)
          assert.ok(text.includes('Selected canvas elements'))
          for (const hit of expected) assert.ok(text.includes(hit.text) && text.includes(hit.frameId))
          return
        }
        await win.waitForTimeout(30)
      }
      assert.fail('The agent did not receive multi-element context')
    })
    await run('a hostile iframe cannot forge a marquee reply with the real pending request id', async () => {
      await win.evaluate(() => {
        globalThis.originalMarqueeRandomUUID = crypto.randomUUID.bind(crypto)
        globalThis.marqueeForgeries = 0
        crypto.randomUUID = () => {
          const requestId = globalThis.originalMarqueeRandomUUID()
          queueMicrotask(() => {
            const hostile = document.querySelector('[data-frame-id="marquee-hostile"] iframe').contentWindow
            const design = document.querySelector('[data-frame-id="marquee-design"] iframe').contentWindow
            window.dispatchEvent(new MessageEvent('message', { source: hostile, data: { type: 'chalk:element', requestId, hits: [{ path: [0, 1], rect: { x: 0, y: 0, width: 999, height: 999 } }] } }))
            for (const hits of [
              [{ path: [-1], rect: { x: 0, y: 0, width: 40, height: 40 } }],
              [{ path: [0, 1], rect: { x: 0, y: 0, width: Infinity, height: 40 } }],
              [{ path: [0, 1], rect: { x: 0, y: 0, width: 40, height: 40 }, outerHTML: '<p>forged</p>' }]
            ]) window.dispatchEvent(new MessageEvent('message', { source: design, data: { type: 'chalk:element', requestId, hits } }))
            globalThis.marqueeForgeries++
          })
          return requestId
        }
      })
      try {
        await partial(async () => {
          await win.waitForFunction(() => document.querySelectorAll('.element-outline.is-selected').length === 2)
          assert.equal(await win.locator('.element-size').innerText(), '380 × 40')
          assert.deepEqual((await canvas()).selectedElements, [])
        })
        await selected([[0, 0, 0], [0, 1]])
        assert.ok(await win.evaluate(() => globalThis.marqueeForgeries > 0))
        assert.deepEqual((await state()).doc.frames, fixtures)
      } finally {
        await win.evaluate(() => { crypto.randomUUID = globalThis.originalMarqueeRandomUUID })
      }
    })
    await run('Escape and pointer cancellation discard a marquee preview', async () => {
      const start = await point(-20, 10)
      const end = await point(430, 100)
      for (const cancel of ['Escape', 'pointercancel']) {
        await win.mouse.move(start.x, start.y)
        await win.mouse.down()
        await win.mouse.move(end.x, end.y, { steps: 5 })
        await win.locator('.canvas-marquee').waitFor()
        if (cancel === 'Escape') await win.keyboard.press('Escape')
        else await win.locator('.canvas').dispatchEvent('pointercancel', { pointerId: 1 })
        await win.locator('.canvas-marquee').waitFor({ state: 'detached' })
        await win.mouse.up()
        assert.deepEqual((await canvas()).selectedElements, [])
        assert.deepEqual((await canvas()).selectedFrameIds, [])
      }
    })
  } finally {
    await win.evaluate(() => window.chalk.invoke('agent:stop'))
    await app.evaluate(({ dialog }) => { dialog.showOpenDialog = globalThis.originalMarqueeDialog })
    await win.evaluate((dir) => window.chalk.invoke('project', 'switch', dir), project)
  }
}
