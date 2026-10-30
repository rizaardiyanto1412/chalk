import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function checkArrangement({ app, win, client, call, json, check, project, artifacts }) {
  const source = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-arrangement-')))
  const other = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-arrangement-other-')))
  const evidence = join(artifacts, 'arrangement')
  const browserInitiallyOpen = await win.getByRole('button', { name: 'Hide browser', exact: true }).count() > 0
  mkdirSync(evidence, { recursive: true })
  const fixtures = [
    { id: 'arrange-a', name: 'Arrangement A', x: 0, y: 0, width: 300, height: 150 },
    { id: 'arrange-b', name: 'Arrangement B', x: 450, y: 200, width: 400, height: 200 },
    { id: 'arrange-c', name: 'Arrangement C', x: 1100, y: 600, width: 200, height: 300 },
    { id: 'arrange-d', name: 'Arrangement D', x: 1600, y: 900, width: 250, height: 100 }
  ].map((f) => ({ ...f, kind: 'html', html: '<textarea aria-label="Live notes">initial</textarea><button onclick="this.textContent=Number(this.textContent)+1">0</button>', updatedAt: 1 }))
  const ids = fixtures.map((f) => f.id)
  const state = () => win.evaluate(async () => (await window.chalk.invoke('init')).doc)
  const canvas = async () => json(await call(client, 'get_canvas'))
  const until = async (predicate) => {
    for (let i = 0; i < 150; i++) {
      const doc = await state()
      if (predicate(doc)) return doc
      await win.waitForTimeout(20)
    }
    assert.fail(`Arrangement state did not settle. ${JSON.stringify(await state())}`)
  }
  const focus = async () => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.focus())
    await win.locator('.canvas').focus()
  }
  const menu = (label) => app.evaluate(({ Menu, BrowserWindow }, label) => {
    Menu.getApplicationMenu().items.find((i) => i.label === 'Edit').submenu.items.find((i) => i.label === label).click(undefined, BrowserWindow.getAllWindows()[0])
  }, label)
  const open = async (dir) => {
    await app.evaluate(({ dialog }, dir) => {
      globalThis.originalArrangementDialog ??= dialog.showOpenDialog
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
    }, dir)
    await win.evaluate(() => window.chalk.invoke('project', 'open'))
    await win.waitForFunction((dir) => document.querySelector('.tab.is-on')?.getAttribute('title') === dir, dir)
  }
  const switchTo = async (dir) => {
    await win.evaluate((dir) => window.chalk.invoke('project', 'switch', dir), dir)
    await win.waitForFunction((dir) => document.querySelector('.tab.is-on')?.getAttribute('title') === dir, dir)
  }
  const fit = async () => {
    await win.getByRole('button', { name: 'Zoom to fit (⌘0)', exact: true }).click()
    await focus()
  }
  const select = async (picked) => {
    await win.evaluate((ids) => window.chalk.invoke('select', ids), picked)
    await win.waitForFunction((ids) => {
      const selected = [...document.querySelectorAll('.frame.is-selected')].map((el) => el.dataset.frameId)
      return selected.length === ids.length && ids.every((id) => selected.includes(id))
    }, picked)
    await focus()
  }
  const geometry = (doc) => doc.frames.map(({ id, x, y, width, height }) => ({ id, x, y, width, height }))
  const original = geometry({ frames: fixtures })
  const undo = async (expected = original) => {
    await focus()
    await menu('Undo')
    await until((doc) => JSON.stringify(geometry(doc)) === JSON.stringify(expected))
    assert.deepEqual(geometry(await state()), expected)
  }
  const noMoreUndo = async () => assert.equal(await win.evaluate(() => window.chalk.invoke('history', 'undo')), false, 'No hidden history entry remains')
  const beginDrag = async (id, dx = 45, dy = 30) => {
    const { x, y } = await win.locator(`[data-frame-id="${id}"] .frame-label`).evaluate((el) => {
      const r = el.getBoundingClientRect()
      for (const y of [r.bottom - 2, r.y + r.height / 2]) {
        for (const x of [r.x + 12, r.right - 8, r.x + r.width / 2]) {
          if (document.elementFromPoint(x, y)?.closest('[data-label]') === el) return { x, y }
        }
      }
      throw new Error('Frame label has no exposed drag point.')
    })
    const zoom = await win.locator('.canvas').evaluate((el) => Number(el.style.getPropertyValue('--zoom')))
    await win.mouse.move(x, y)
    await win.mouse.down()
    await win.waitForFunction(() => document.querySelector('.canvas').classList.contains('is-gesturing'))
    assert.equal(await win.locator(`[data-frame-id="${id}"] iframe`).first().evaluate((el) => getComputedStyle(el).pointerEvents), 'none', 'Iframe shield is active before the first move')
    await win.mouse.move(x + dx, y + dy, { steps: 5 })
    return { dx: Math.round(dx / zoom), dy: Math.round(dy / zoom) }
  }
  const input = (field) => win.getByRole('spinbutton', { name: `Frame ${field}`, exact: true })
  const enter = async (field, value) => { await input(field).fill(String(value)); await input(field).press('Enter') }
  const reset = async () => {
    await switchTo(other)
    writeFileSync(join(source, 'chalk.json'), JSON.stringify({ version: 1, frames: fixtures }))
    await switchTo(source)
    await win.locator('.left-tabs button', { hasText: 'Frames' }).click()
    if (await win.getByRole('button', { name: 'Dismiss frame notice', exact: true }).count()) await win.getByRole('button', { name: 'Dismiss frame notice', exact: true }).click()
    await until((doc) => doc.frames.length === 4)
    await select([])
    await fit()
  }
  const run = async (name, fn) => check(name, async () => {
    await reset()
    try { await fn() } catch (err) {
      writeFileSync(join(evidence, 'failure-state.json'), JSON.stringify({ name, doc: await state(), canvas: await canvas() }, null, 2))
      await win.screenshot({ path: join(evidence, 'failure.png') })
      throw err
    } finally {
      await win.mouse.up()
      for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Shift']) await win.keyboard.up(key)
    }
  })
  try {
    await open(other)
    await open(source)
    if (await win.getByRole('button', { name: 'Hide browser', exact: true }).count()) await win.getByRole('button', { name: 'Hide browser', exact: true }).click()
    await run('arrangement drag preserves two and three selected frames, relative layout, and one Undo', async () => {
      for (const picked of [ids.slice(0, 2), ids.slice(0, 3)]) {
        await select(picked)
        const delta = await beginDrag(ids[0])
        assert.deepEqual((await canvas()).selectedFrameIds, picked, 'Pointerdown retains an existing selection')
        await win.mouse.up()
        await until((doc) => doc.frames[0].x === delta.dx)
        const expected = original.map((f) => picked.includes(f.id) ? { ...f, x: f.x + delta.dx, y: f.y + delta.dy } : f)
        assert.deepEqual(geometry(await state()), expected)
        assert.deepEqual((await canvas()).selectedFrameIds, picked)
        await undo()
        await noMoreUndo()
      }
    })
    await run('unmodified clicks collapse only on release without movement and Shift-click toggles on canvas and rows', async () => {
      await select(ids.slice(0, 3))
      const label = win.locator(`[data-frame-id="${ids[0]}"] .frame-label`)
      const box = await label.boundingBox()
      await win.mouse.move(box.x + 12, box.y + box.height / 2)
      await win.mouse.down()
      assert.deepEqual((await canvas()).selectedFrameIds, ids.slice(0, 3))
      await win.mouse.up()
      await win.waitForFunction(() => document.querySelectorAll('.frame.is-selected').length === 1)
      assert.deepEqual((await canvas()).selectedFrameIds, [ids[0]])
      await win.keyboard.down('Shift')
      await win.locator(`[data-frame-id="${ids[1]}"] .frame-label`).click()
      await win.keyboard.up('Shift')
      assert.deepEqual((await canvas()).selectedFrameIds, ids.slice(0, 2))
      await win.keyboard.down('Shift')
      await label.click()
      await win.keyboard.up('Shift')
      assert.deepEqual((await canvas()).selectedFrameIds, [ids[1]])
      await win.locator('.layer').nth(2).click({ modifiers: ['Shift'] })
      assert.deepEqual((await canvas()).selectedFrameIds, [ids[1], ids[2]])
      await win.locator('.layer').nth(1).click({ modifiers: ['Shift'] })
      assert.deepEqual((await canvas()).selectedFrameIds, [ids[2]])
      await noMoreUndo()
    })
    await run('arrow nudge uses 1 or Shift 10 and key repeats form one Undo gesture', async () => {
      await select(ids.slice(0, 3))
      for (const [key, dx, dy] of [['ArrowRight', 1, 0], ['ArrowLeft', -1, 0], ['ArrowUp', 0, -1], ['ArrowDown', 0, 1], ['Shift+ArrowDown', 0, 10], ['Shift+ArrowLeft', -10, 0]]) {
        await win.keyboard.press(key)
        await until((doc) => doc.frames[0].x === dx && doc.frames[0].y === dy)
        assert.deepEqual(geometry(await state()), original.map((f, i) => i < 3 ? { ...f, x: f.x + dx, y: f.y + dy } : f))
        await undo()
        await noMoreUndo()
      }
      await win.keyboard.down('ArrowRight')
      await win.keyboard.down('ArrowRight')
      await win.keyboard.down('ArrowRight')
      assert.deepEqual(geometry(await state()), original, 'Repeat previews do not write partial history')
      await win.keyboard.up('ArrowRight')
      await until((doc) => doc.frames[0].x === 3)
      assert.deepEqual(geometry(await state()), original.map((f, i) => i < 3 ? { ...f, x: f.x + 3 } : f))
      await undo()
      await noMoreUndo()
    })
    await run('single-frame inspector commits exact coordinates and sizes once across Enter and blur', async () => {
      await select([ids[0]])
      for (const [field, property, value] of [['X', 'x', -123.5], ['Y', 'y', 78.25], ['W', 'width', 777], ['H', 'height', 555]]) {
        await enter(field, value)
        await until((doc) => doc.frames[0][property] === value)
        await input(field).focus()
        await input(field).press('Enter')
        await input(field).focus()
        await input(field).fill(String(value))
        await input(field).press('Enter')
        await undo()
        await noMoreUndo()
      }
      await input('X').fill('99')
      await input('X').press('Escape')
      assert.deepEqual(geometry(await state()), original)
      await noMoreUndo()
    })
    await run('mixed inspector translates group bounds, sets every size, and clamps shared limits', async () => {
      await select(ids.slice(0, 3))
      assert.equal(await input('W').inputValue(), '')
      assert.equal(await input('W').getAttribute('placeholder'), 'Mixed')
      assert.equal(await input('H').inputValue(), '')
      for (const [field, property, value] of [['X', 'x', -72.5], ['Y', 'y', 81.25]]) {
        await enter(field, value)
        await until((doc) => doc.frames[0][property] === value)
        assert.deepEqual(geometry(await state()), original.map((f, i) => i < 3 ? { ...f, [property]: f[property] + value } : f))
        await undo()
        await noMoreUndo()
      }
      for (const [field, property, value, expected] of [['W', 'width', 612, 612], ['H', 'height', 455, 455], ['W', 'width', 3, 200], ['W', 'width', 9000, 3840], ['H', 'height', 3, 100], ['H', 'height', 20000, 12000]]) {
        await enter(field, value)
        await until((doc) => doc.frames.slice(0, 3).every((f) => f[property] === expected))
        assert.equal((await state()).frames[3][property], fixtures[3][property])
        await undo()
        await noMoreUndo()
      }
    })
    await run('all six alignments use group bounds and equal-gap distribution handles unequal sizes on both axes', async () => {
      await select(ids.slice(0, 3))
      const expected = [
        ['Align left', 'x', [0, 0, 0]], ['Align horizontal centers', 'x', [500, 450, 550]], ['Align right', 'x', [1000, 900, 1100]],
        ['Align top', 'y', [0, 0, 0]], ['Align vertical centers', 'y', [375, 350, 300]], ['Align bottom', 'y', [750, 700, 600]],
        ['Distribute horizontally', 'x', [0, 500, 1100]], ['Distribute vertically', 'y', [0, 275, 600]]
      ]
      for (const [label, axis, values] of expected) {
        await win.getByRole('button', { name: label, exact: true }).click()
        await until((doc) => doc.frames.slice(0, 3).every((f, i) => f[axis] === values[i]))
        assert.deepEqual(geometry(await state()), original.map((f, i) => i < 3 ? { ...f, [axis]: values[i] } : f))
        await undo()
        await noMoreUndo()
      }
      await win.screenshot({ path: join(evidence, 'inspector-multiple.png') })
    })
    await run('invalid selections disable arrangement controls and no-op commands preserve empty history', async () => {
      for (const count of [0, 1, 2]) {
        await select(ids.slice(0, count))
        for (const label of ['Align left', 'Align horizontal centers', 'Align right', 'Align top', 'Align vertical centers', 'Align bottom']) assert.equal(await win.getByRole('button', { name: label, exact: true }).isDisabled(), count < 2)
        for (const label of ['Distribute horizontally', 'Distribute vertically']) assert.equal(await win.getByRole('button', { name: label, exact: true }).isDisabled(), true)
        for (const label of ['Bring to front', 'Send to back', 'Bring forward', 'Send backward']) assert.equal(await win.getByRole('button', { name: label, exact: true }).isDisabled(), count === 0)
        assert.equal(await input('X').isDisabled(), count === 0)
      }
      await select([ids[0]])
      await win.getByRole('button', { name: 'Send to back', exact: true }).click()
      await enter('X', 0)
      await win.evaluate(async ({ ids }) => {
        const { project } = await window.chalk.invoke('init')
        for (const operation of [{ kind: 'align', alignment: 'left' }, { kind: 'distribute', axis: 'x' }, { kind: 'translate', dx: 0, dy: 0 }]) await window.chalk.invoke('frames:command', { type: 'arrange', ids: ids.slice(0, 1), projectEpoch: project.epoch, operation })
      }, { ids })
      await noMoreUndo()
    })
    await run('four stacking actions preserve selected order and match the DOM and get_canvas', async () => {
      await select([ids[0], ids[2]])
      for (const [label, order] of [
        ['Bring to front', [ids[1], ids[3], ids[0], ids[2]]], ['Send to back', [ids[0], ids[2], ids[1], ids[3]]],
        ['Bring forward', [ids[1], ids[0], ids[3], ids[2]]], ['Send backward', [ids[0], ids[2], ids[1], ids[3]]]
      ]) {
        await win.getByRole('button', { name: label, exact: true }).click()
        await until((doc) => JSON.stringify(doc.frames.map((f) => f.id)) === JSON.stringify(order))
        await win.waitForFunction((ids) => JSON.stringify([...document.querySelectorAll('.world > .frame')].map((el) => el.dataset.frameId)) === JSON.stringify(ids), order)
        assert.deepEqual((await canvas()).frames.map((f) => f.id), order)
        await undo()
        await noMoreUndo()
      }
    })
    await run('textarea, contenteditable, select, chat selected text, and live iframe keep arrow shortcuts native', async () => {
      await select(ids.slice(0, 2))
      await win.locator('.left-tabs button', { hasText: 'Agent' }).click()
      const textarea = win.locator('.chat textarea')
      await textarea.fill('native text')
      await textarea.press('ArrowLeft')
      await textarea.press('Shift+ArrowLeft')
      await win.locator('.chat select').focus()
      await win.keyboard.press('ArrowDown')
      await win.evaluate(() => {
        const el = document.createElement('div')
        el.id = 'arrangement-editable'; el.contentEditable = 'true'; el.textContent = 'Native editable'; document.body.append(el); el.focus()
      })
      await win.keyboard.press('ArrowRight')
      await win.evaluate(() => document.getElementById('arrangement-editable').remove())
      await win.evaluate(() => {
        document.querySelector('.canvas').focus()
        const range = document.createRange(); range.selectNodeContents(document.querySelector('.agent-empty h4'))
        window.getSelection().removeAllRanges(); window.getSelection().addRange(range)
      })
      await win.keyboard.press('ArrowRight')
      assert.deepEqual(geometry(await state()), original)
      await win.evaluate(() => window.getSelection().removeAllRanges())
      await select([ids[0]])
      await win.locator(`[data-frame-id="${ids[0]}"] .frame-shield`).dblclick()
      await win.locator(`[data-frame-id="${ids[0]}"].is-live`).waitFor()
      const live = win.frameLocator(`[data-frame-id="${ids[0]}"] iframe:not(.is-pending)`).getByRole('textbox', { name: 'Live notes' })
      await live.fill('live editing')
      await live.press('ArrowLeft')
      await live.press('Shift+ArrowRight')
      await menu('Duplicate')
      assert.deepEqual(geometry(await state()), original)
      assert.equal(await live.inputValue(), 'live editing')
      await noMoreUndo()
    })
    await run('live interactive iframe state and DOM survive resize, position edits, nudges, drag, and Undo', async () => {
      await select([ids[0]])
      await win.locator(`[data-frame-id="${ids[0]}"] .frame-shield`).dblclick()
      await win.locator(`[data-frame-id="${ids[0]}"].is-live`).waitFor()
      const frame = win.frameLocator(`[data-frame-id="${ids[0]}"] iframe:not(.is-pending)`)
      const live = frame.getByRole('textbox', { name: 'Live notes' })
      await live.fill('persistent live state')
      const counter = frame.getByRole('button', { name: '0', exact: true })
      const localPoint = await counter.evaluate((el) => {
        const r = el.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      })
      const iframeBox = await win.locator(`[data-frame-id="${ids[0]}"] iframe:not(.is-pending)`).evaluate((el) => {
        const r = el.getBoundingClientRect()
        return { x: r.x, y: r.y, scaleX: r.width / el.clientWidth, scaleY: r.height / el.clientHeight }
      })
      await win.mouse.click(iframeBox.x + localPoint.x * iframeBox.scaleX, iframeBox.y + localPoint.y * iframeBox.scaleY)
      await frame.getByRole('button', { name: '1', exact: true }).waitFor()
      assert.deepEqual((await canvas()).selectedFrameIds, [ids[0]])
      const node = await win.locator(`[data-frame-id="${ids[0]}"] iframe`).elementHandle()
      const src = await node.getAttribute('src')
      const timestamp = (await state()).frames[0].updatedAt
      await win.locator('.left-tabs button', { hasText: 'Frames' }).click()
      await enter('W', 340)
      await until((doc) => doc.frames[0].width === 340)
      await enter('H', 170)
      await until((doc) => doc.frames[0].height === 170)
      await undo(original.map((f, i) => i === 0 ? { ...f, width: 340 } : f))
      await undo()
      await enter('X', 42)
      await until((doc) => doc.frames[0].x === 42)
      assert.ok((await state()).frames[0].updatedAt > timestamp, 'updatedAt still describes any actual frame patch')
      await focus()
      await win.keyboard.press('ArrowRight')
      await until((doc) => doc.frames[0].x === 43)
      const delta = await beginDrag(ids[0])
      await win.mouse.up()
      await until((doc) => doc.frames[0].x === 43 + delta.dx)
      await undo(original.map((f, i) => i === 0 ? { ...f, x: 43 } : f))
      await win.waitForTimeout(400)
      assert.equal(await node.evaluate((el) => el.isConnected && el === document.querySelector('[data-frame-id="arrange-a"] iframe')), true)
      assert.equal(await node.getAttribute('src'), src)
      assert.equal(await win.locator(`[data-frame-id="${ids[0]}"] iframe`).count(), 1)
      assert.equal(await live.inputValue(), 'persistent live state')
      assert.equal(await frame.getByRole('button', { name: '1', exact: true }).count(), 1)
      await win.screenshot({ path: join(evidence, 'live-state-after-move.png') })
    })
    await run('Undo, window blur, native focus, project switches, target removal, and pointer cancellation discard active gestures', async () => {
      for (const cancel of [() => menu('Undo'), () => win.evaluate(() => window.dispatchEvent(new Event('blur'))), () => input('X').focus()]) {
        await select(ids.slice(0, 2))
        await win.keyboard.down('ArrowRight')
        await cancel()
        await win.keyboard.up('ArrowRight')
        assert.deepEqual(geometry(await state()), original)
        await noMoreUndo()
      }
      await select(ids.slice(0, 2))
      await win.keyboard.down('ArrowRight')
      await win.evaluate(() => window.chalk.invoke('select', []))
      await win.waitForFunction(() => document.querySelectorAll('.frame.is-selected').length === 0)
      await win.keyboard.up('ArrowRight')
      assert.deepEqual(geometry(await state()), original)
      await noMoreUndo()
      await select(ids.slice(0, 2))
      await win.keyboard.down('ArrowRight')
      await win.evaluate((id) => window.chalk.invoke('op', { type: 'delete', id }), ids[1])
      await until((doc) => doc.frames.length === 3)
      await win.waitForFunction(() => document.querySelectorAll('.frame.is-selected').length === 1)
      await win.keyboard.down('ArrowRight')
      await win.keyboard.up('ArrowRight')
      assert.equal((await state()).frames[0].x, 0, 'A held repeat cannot restart a cancelled gesture')
      await undo()
      await noMoreUndo()
      await select(ids.slice(0, 2))
      await beginDrag(ids[0])
      await win.locator('.canvas').dispatchEvent('pointercancel')
      await win.mouse.up()
      assert.deepEqual(geometry(await state()), original)
      await noMoreUndo()
      await select(ids.slice(0, 2))
      await beginDrag(ids[0])
      await win.evaluate((id) => window.chalk.invoke('op', { type: 'delete', id }), ids[1])
      await until((doc) => doc.frames.length === 3)
      await win.mouse.up()
      assert.equal((await state()).frames[0].x, 0)
      await undo()
      await noMoreUndo()
      await select(ids.slice(0, 2))
      await win.keyboard.down('ArrowDown')
      const epoch = await win.evaluate(async () => (await window.chalk.invoke('init')).project.epoch)
      await switchTo(other)
      await win.keyboard.up('ArrowDown')
      assert.equal((await state()).frames.length, 0)
      await noMoreUndo()
      await switchTo(source)
      await win.evaluate(async ({ ids, epoch }) => window.chalk.invoke('frames:command', { type: 'arrange', ids, projectEpoch: epoch, operation: { kind: 'translate', dx: 999, dy: 999 } }), { ids, epoch })
      assert.deepEqual(geometry(await state()), original)
      await noMoreUndo()
      await select(ids.slice(0, 2))
      await fit()
      await beginDrag(ids[0])
      await switchTo(other)
      await win.mouse.up()
      assert.equal((await state()).frames.length, 0)
      await switchTo(source)
      assert.deepEqual(geometry(await state()), original)
      assert.deepEqual((await canvas()).selectedFrameIds, [])
      await noMoreUndo()
    })
  } finally {
    await win.mouse.up()
    await app.evaluate(({ dialog }) => { if (globalThis.originalArrangementDialog) dialog.showOpenDialog = globalThis.originalArrangementDialog })
    await switchTo(project)
    if (browserInitiallyOpen && await win.getByRole('button', { name: 'Show browser', exact: true }).count()) await win.getByRole('button', { name: 'Show browser', exact: true }).click()
    writeFileSync(join(evidence, 'projects.json'), JSON.stringify({ source, other, original: project }, null, 2))
  }
}
