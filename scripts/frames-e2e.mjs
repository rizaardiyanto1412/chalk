import assert from 'node:assert/strict'
import { mkdtempSync, realpathSync, readFileSync, writeFileSync, existsSync, renameSync, symlinkSync, unlinkSync, mkdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'

export async function checkFrames({ app, win, client, call, json, check, project, artifacts }) {
  const source = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-frames-source-')))
  const destination = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-frames-destination-')))
  const originalCheck = check
  check = async (name, fn) => {
    return originalCheck(name, async () => {
      try { return await fn() } catch (err) {
        console.log('CLIPBOARD DIAGNOSTIC', await app.evaluate(async ({ clipboard }) => { const items = await clipboard.read(); return { types: items.map((i) => i.types), text: await clipboard.readText() } }))
        console.log('FRAME DIAGNOSTIC', await win.evaluate(() => ({ active: document.activeElement?.outerHTML.slice(0, 300), selection: window.getSelection()?.toString(), alert: document.querySelector('[role="alert"]')?.textContent })))
        throw err
      }
    })
  }
  const state = () => win.evaluate(async () => (await window.chalk.invoke('init')).doc)
  const canvas = async () => json(await call(client, 'get_canvas'))
  const until = async (predicate) => {
    for (let i = 0; i < 150; i++) {
      const value = await canvas()
      if (predicate(value)) return value
      await win.waitForTimeout(40)
    }
    assert.fail(`Timed out waiting for frame state. ${JSON.stringify(await canvas())}`)
  }
  const menu = (label) => app.evaluate(({ Menu, BrowserWindow }, label) => {
    const window = BrowserWindow.getAllWindows()[0]
    Menu.getApplicationMenu().items.find((i) => i.label === 'Edit').submenu.items.find((i) => i.label === label).click(undefined, window)
  }, label)
  const focusCanvas = async () => {
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.focus())
    await win.locator('.canvas').focus()
  }
  const switchProject = async (dir) => {
    await win.evaluate((dir) => window.chalk.invoke('project', 'switch', dir), dir)
    await until((s) => s.project === dir)
    await focusCanvas()
  }
  const open = async (dir) => {
    await app.evaluate(({ dialog }, dir) => {
      globalThis.originalFramesOpenDialog ??= dialog.showOpenDialog
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
    }, dir)
    await win.evaluate(() => window.chalk.invoke('project', 'open'))
    await until((s) => s.project === dir)
  }
  const select = async (ids) => {
    await win.locator('.left-tabs button', { hasText: 'Frames' }).click()
    const frames = (await canvas()).frames
    for (let i = 0; i < ids.length; i++) {
      const row = win.locator('.layer').nth(frames.findIndex((f) => f.id === ids[i]))
      if (i === 0) await row.click()
      else {
        await win.keyboard.down('Shift')
        const frame = win.locator(`[data-frame-id="${ids[i]}"] .frame-label`)
        await win.locator('[aria-label="Zoom to fit (⌘0)"]').click()
        await frame.click()
        await win.keyboard.up('Shift')
      }
    }
    await focusCanvas()
    await until((s) => ids.every((id) => s.selectedFrameIds.includes(id)) && s.selectedFrameIds.length === ids.length)
  }
  const undo = async (count) => {
    await focusCanvas()
    await menu('Undo')
    return until((s) => s.frames.length === count)
  }
  const clipboardToken = () => app.evaluate(async ({ clipboard }) => {
    const items = await clipboard.read()
    const formats = ['application/x-chalk-frames', 'electron application/osclipboard;format="application/x-chalk-frames"']
    for (const item of items) {
      const format = formats.find((type) => item.types.includes(type))
      if (format) return (await item.getType(format)).text()
    }
    return null
  })
  const copy = async () => {
    const before = await clipboardToken()
    await menu('Copy')
    for (let i = 0; i < 100; i++) {
      const token = await clipboardToken()
      if (token && token !== before) return
      await win.waitForTimeout(20)
    }
    assert.fail('Copy did not replace the native clipboard token')
  }
  const nativeText = async (text) => {
    await app.evaluate(({ clipboard }, text) => clipboard.writeText(text), text)
  }
  let html, image, imageBytes
  try {
    await open(source)
    await check('manual Desktop and Mobile buttons create exact sizes, select frames, and undo individually', async () => {
      for (const [label, width, height] of [['Desktop', 1440, 900], ['Mobile', 390, 844]]) {
        await win.getByRole('button', { name: `Add ${label} frame (${width} × ${height})`, exact: true }).click()
        const s = await until((s) => s.frames.length === 1 && s.selectedFrameIds.length === 1)
        assert.deepEqual([s.frames[0].name, s.frames[0].width, s.frames[0].height], [label, width, height])
        assert.deepEqual(s.selectedFrameIds, [s.frames[0].id])
        const element = win.locator(`[data-frame-id="${s.frames[0].id}"].is-selected`)
        await element.waitFor()
        assert.equal(await element.locator('.frame-size').innerText(), `${width} × ${height}`)
        assert.deepEqual(await element.evaluate((el) => [Number.parseFloat(el.style.width), Number.parseFloat(el.style.height)]), [width, height])
        await win.screenshot({ path: join(artifacts, `frames-manual-${label.toLowerCase()}.png`) })
        assert.equal((await undo(0)).selectedFrameIds.length, 0)
      }
      await win.screenshot({ path: join(artifacts, 'frames-manual-undo.png') })
    })
    await check('mixed duplication preserves layout, HTML, source URL, and shared asset with one Undo', async () => {
      html = json(await call(client, 'create_frame', { name: 'Mixed HTML', width: 400, height: 200, x: 10, y: 20, html: '<textarea>Live editable text</textarea><p>Original HTML</p>' })).created
      const png = new PNG({ width: 200, height: 100 })
      png.data.fill(123)
      const bytes = PNG.sync.write(png)
      const imageId = await win.evaluate((bytes) => window.chalk.invoke('image:add', { name: 'Mixed image.png', bytes: new Uint8Array(bytes), x: 610, y: 170 }), [...bytes])
      image = { ...(await state()).frames.find((f) => f.id === imageId), sourceUrl: 'https://example.test/reference' }
      await win.evaluate((frame) => window.chalk.invoke('op', [{ type: 'delete', id: frame.id }, { type: 'add', frame }]), image)
      imageBytes = readFileSync(join(source, 'assets', image.asset))
      await select([html.id, image.id])
      await menu('Duplicate')
      const s = await until((s) => s.frames.length === 4 && s.selectedFrameIds.length === 2)
      const copies = (await state()).frames.filter((f) => s.selectedFrameIds.includes(f.id))
      const copiedHtml = copies.find((f) => f.kind === 'html')
      const copiedImage = copies.find((f) => f.kind === 'image')
      assert.equal(copiedHtml.html, (await state()).frames.find((f) => f.id === html.id).html)
      assert.equal(copiedImage.asset, image.asset)
      assert.equal(copiedImage.sourceUrl, image.sourceUrl)
      assert.deepEqual([copiedImage.x - copiedHtml.x, copiedImage.y - copiedHtml.y], [600, 150])
      assert.deepEqual([copiedHtml.x - html.x, copiedHtml.y - html.y], [880, 0])
      await win.waitForFunction((ids) => ids.every((id) => document.querySelector(`[data-frame-id="${id}"].is-selected`)), s.selectedFrameIds)
      await win.screenshot({ path: join(artifacts, 'frames-mixed-duplicate.png') })
      assert.deepEqual((await undo(2)).selectedFrameIds, [])
      await menu('Redo')
      await until((s) => s.frames.length === 4)
      assert.deepEqual((await canvas()).selectedFrameIds, [])
      await undo(2)
    })
    await check('clicking a frame clears stale transcript text selection and restores Delete', async () => {
      await win.locator('.left-tabs button', { hasText: 'Agent' }).click()
      await win.locator('[aria-label="Zoom to fit (⌘0)"]').click()
      await win.evaluate(() => {
        const range = document.createRange()
        range.selectNodeContents(document.querySelector('.messages h4'))
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
      })
      assert.ok(await win.evaluate(() => window.getSelection().toString().length > 0))
      await win.locator(`[data-frame-id="${html.id}"] .frame-label`).click()
      assert.equal(await win.evaluate(() => window.getSelection().toString()), '')
      await win.keyboard.press('Backspace')
      await until((s) => s.frames.length === 1)
      await undo(2)
    })
    await check('Select All and batch Delete remove a mixed selection in one history entry', async () => {
      await win.getByRole('button', { name: 'Add Mobile frame (390 × 844)', exact: true }).click()
      await until((s) => s.frames.length === 3)
      await focusCanvas()
      await menu('Select All')
      await until((s) => s.selectedFrameIds.length === 3)
      await win.keyboard.press('Backspace')
      const deleted = await until((s) => s.frames.length === 0)
      assert.deepEqual(deleted.selectedFrameIds, [])
      await undo(3)
      await menu('Select All')
      await until((s) => s.selectedFrameIds.length === 3)
      await menu('Cut')
      await until((s) => s.frames.length === 0)
      assert.deepEqual(readFileSync(join(source, 'assets', image.asset)), imageBytes, 'Cut retains the source asset')
      assert.match(await app.evaluate(({ clipboard }) => clipboard.readText()), /Mixed HTML\nMixed image\nMobile/)
      assert.equal((await undo(3)).selectedFrameIds.length, 0)
      const mobile = (await state()).frames.find((f) => f.name === 'Mobile')
      await win.evaluate((id) => window.chalk.invoke('op', { type: 'delete', id }), mobile.id)
    })
    await check('Copy then immediate Paste is ordered and one Undo removes all pasted frames', async () => {
      await select([html.id, image.id])
      await app.evaluate(({ Menu, BrowserWindow }) => {
        const menu = Menu.getApplicationMenu().items.find((i) => i.label === 'Edit').submenu
        for (const label of ['Copy', 'Paste']) menu.items.find((i) => i.label === label).click(undefined, BrowserWindow.getAllWindows()[0])
      })
      await until((s) => s.frames.length === 4 && s.selectedFrameIds.length === 2)
      await undo(2)
    })
    await check('a queued Cut uses the selection produced by the preceding Paste', async () => {
      await select([html.id, image.id])
      await copy()
      await win.evaluate(async () => {
        await Promise.all([
          window.chalk.invoke('frames:command', { type: 'paste', anchor: { x: 500, y: 500 } }),
          window.chalk.invoke('frames:command', { type: 'cut' })
        ])
      })
      const result = await until((s) => s.frames.length === 2 && s.selectedFrameIds.length === 0)
      assert.deepEqual(result.frames.map((frame) => frame.id).sort(), [html.id, image.id].sort())
      await undo(4)
      await undo(2)
    })
    await check('cross-project Paste uses captured image bytes, fresh assets, relative geometry, and one Undo', async () => {
      await select([html.id, image.id])
      await copy()
      await open(destination)
      writeFileSync(join(source, 'assets', image.asset), Buffer.from('changed after copy'))
      await focusCanvas()
      await menu('Paste')
      const s = await until((s) => s.frames.length === 2 && s.selectedFrameIds.length === 2)
      const pasted = (await state()).frames
      const pastedHtml = pasted.find((f) => f.kind === 'html')
      const pastedImage = pasted.find((f) => f.kind === 'image')
      assert.deepEqual([pastedImage.x - pastedHtml.x, pastedImage.y - pastedHtml.y], [600, 150])
      assert.notEqual(pastedImage.asset, image.asset)
      assert.deepEqual(readFileSync(join(destination, 'assets', pastedImage.asset)), imageBytes)
      assert.deepEqual(s.selectedFrameIds, pasted.map((f) => f.id))
      const center = await win.evaluate(() => {
        const host = document.querySelector('.canvas').getBoundingClientRect()
        const boxes = [...document.querySelectorAll('.frame')].map((el) => el.getBoundingClientRect())
        return {
          actual: [(Math.min(...boxes.map((r) => r.left)) + Math.max(...boxes.map((r) => r.right))) / 2, (Math.min(...boxes.map((r) => r.top)) + Math.max(...boxes.map((r) => r.bottom))) / 2],
          expected: [host.left + host.width / 2, host.top + host.height / 2]
        }
      })
      for (let i = 0; i < 2; i++) assert.ok(Math.abs(center.actual[i] - center.expected[i]) < 1, 'Pasted group is centered in the viewport')
      await win.waitForFunction((ids) => ids.every((id) => document.querySelector(`[data-frame-id="${id}"].is-selected`)), s.selectedFrameIds)
      await win.screenshot({ path: join(artifacts, 'frames-cross-project.png') })
      assert.deepEqual((await undo(0)).selectedFrameIds, [])
      assert.ok(existsSync(join(destination, 'assets', pastedImage.asset)), 'Undo keeps assets')
      writeFileSync(join(source, 'assets', image.asset), imageBytes)
      await switchProject(source)
      assert.deepEqual((await canvas()).selectedFrameIds, [])
    })
    await check('native textarea Copy, Paste, Cut, Select All, and Duplicate preserve frame history', async () => {
      await select([html.id, image.id])
      await menu('Copy')
      await win.locator('.left-tabs button', { hasText: 'Agent' }).click()
      const input = win.locator('.chat textarea')
      await input.fill('Native selected text')
      await input.evaluate((el) => el.setSelectionRange(7, 15))
      await menu('Copy')
      for (let i = 0; i < 100 && await app.evaluate(({ clipboard }) => clipboard.readText()) !== 'selected'; i++) await win.waitForTimeout(20)
      assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'selected')
      await input.fill('')
      await menu('Paste')
      await win.waitForFunction(() => document.querySelector('.chat textarea').value === 'selected')
      await menu('Select All')
      assert.deepEqual(await input.evaluate((el) => [el.selectionStart, el.selectionEnd]), [0, 8])
      await menu('Duplicate')
      await menu('Cut')
      await win.waitForFunction(() => document.querySelector('.chat textarea').value === '')
      assert.equal((await canvas()).frames.length, 2)
      await focusCanvas()
      await menu('Paste')
      await win.waitForTimeout(200)
      assert.equal((await canvas()).frames.length, 2, 'Native text copy invalidates the frame clipboard token')
    })
    await check('external text and image clipboard replacement prevent stale frame Paste', async () => {
      for (const kind of ['text', 'image']) {
        await select([html.id, image.id])
        await copy()
        if (kind === 'text') await nativeText('external clipboard')
        else await call(client, 'copy_frame_image', { id: html.id })
        await focusCanvas()
        await menu('Paste')
        await win.waitForTimeout(150)
        assert.equal((await canvas()).frames.length, 2)
      }
    })
    await check('native browser focus keeps Select All, Copy, Paste, and Duplicate away from frames', async () => {
      await select([html.id, image.id])
      await call(client, 'browser_navigate', { url: 'http://127.0.0.1:7912' })
      await nativeText('browser text')
      await win.waitForSelector('.browser-slot')
      await win.waitForTimeout(200)
      await app.evaluate(async ({ app, BrowserWindow }) => {
        app.focus({ steal: true })
        await new Promise((resolve) => setTimeout(resolve, 100))
        const window = BrowserWindow.getAllWindows()[0]
        window.focus()
        await new Promise((resolve) => setTimeout(resolve, 100))
        const wc = window.contentView.children[0].webContents
        await wc.executeJavaScript("document.querySelector('input').focus()")
        wc.focus()
      })
      const focus = await app.evaluate(({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0]
        return { window: window.isFocused(), browser: window.contentView.children[0].webContents.isFocused() }
      })
      if (!focus.window) {
        const skip = 'Electron cannot gain OS focus. Rerun in an unlocked desktop session to verify native browser menu routing.'
        writeFileSync(join(artifacts, 'frames-browser-focus-unavailable.json'), JSON.stringify({ ...focus, skip }, null, 2))
        await focusCanvas()
        return { skip }
      }
      assert.equal(focus.browser, true, 'Native browser webContents has focus')
      await menu('Paste')
      await win.waitForTimeout(100)
      await menu('Select All')
      await menu('Copy')
      await menu('Duplicate')
      await win.waitForTimeout(100)
      assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'browser text')
      assert.equal((await canvas()).frames.length, 2)
      await focusCanvas()
    })
    await check('live iframe focus keeps native text shortcuts and Duplicate away from frames', async () => {
      await select([html.id])
      await win.locator(`[data-frame-id="${html.id}"] .frame-shield`).dblclick()
      const input = win.frameLocator(`[data-frame-id="${html.id}"] iframe:not(.is-pending)`).locator('textarea')
      await input.focus()
      assert.equal(await win.evaluate(() => document.activeElement?.tagName), 'IFRAME')
      await nativeText('live native')
      await menu('Select All')
      await menu('Paste')
      await win.waitForTimeout(100)
      assert.equal(await input.inputValue(), 'live native')
      await menu('Select All')
      await menu('Copy')
      await menu('Duplicate')
      await win.waitForTimeout(100)
      assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'live native')
      assert.equal((await canvas()).frames.length, 2)
      await focusCanvas()
      await win.keyboard.press('Escape')
    })
    await check('missing, traversal, symlink, folder, and special assets refuse Cut without deleting frames or replacing clipboard', async () => {
      const asset = join(source, 'assets', image.asset)
      const backup = `${asset}.backup`
      const reject = async (pattern) => {
        await nativeText('keep clipboard on failed cut')
        await select([html.id, image.id])
        await menu('Cut')
        await win.getByRole('alert').filter({ hasText: pattern }).waitFor()
        assert.equal((await canvas()).frames.length, 2)
        assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'keep clipboard on failed cut')
        await win.getByRole('button', { name: 'Dismiss frame notice' }).click()
      }
      renameSync(asset, backup)
      try {
        await reject(/missing or unsafe/)
        symlinkSync(backup, asset)
        await reject(/missing or unsafe/)
        unlinkSync(asset)
        execFileSync('mkfifo', [asset])
        await reject(/regular file/)
        unlinkSync(asset)
        mkdirSync(asset)
        await reject(/regular file/)
        const { rmdirSync } = await import('node:fs')
        rmdirSync(asset)
      } finally {
        if (!existsSync(asset)) renameSync(backup, asset)
      }
      const folder = join(source, 'assets')
      renameSync(folder, `${folder}-original`)
      try {
        symlinkSync(`${folder}-original`, folder)
        await reject(/symbolic link/)
      } finally {
        unlinkSync(folder)
        renameSync(`${folder}-original`, folder)
      }
      await switchProject(destination)
      const doc = JSON.parse(readFileSync(join(source, 'chalk.json'), 'utf8'))
      doc.frames.find((f) => f.id === image.id).asset = '../private.png'
      writeFileSync(join(source, 'chalk.json'), JSON.stringify(doc))
      await switchProject(source)
      await reject(/Unsafe image asset/)
      assert.equal((await state()).frames.find((f) => f.id === image.id).asset, '../private.png', 'Opening preserves legacy documents')
      await switchProject(destination)
      doc.frames.find((f) => f.id === image.id).asset = image.asset
      writeFileSync(join(source, 'chalk.json'), JSON.stringify(doc))
      await switchProject(source)
    })
    await check('clipboard write failures and document edits during Cut leave every source frame intact', async () => {
      await nativeText('clipboard survives a failed write')
      await select([html.id, image.id])
      await app.evaluate(({ clipboard }) => {
        globalThis.originalFrameClipboardWrite = clipboard.write
        clipboard.write = async () => { throw new Error('Clipboard write refused fixture') }
      })
      try {
        await menu('Cut')
        await win.getByRole('alert').filter({ hasText: /Clipboard write refused fixture/ }).waitFor()
        assert.equal((await canvas()).frames.length, 2)
        assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), 'clipboard survives a failed write')
      } finally {
        await app.evaluate(({ clipboard }) => { clipboard.write = globalThis.originalFrameClipboardWrite })
      }
      await win.getByRole('button', { name: 'Dismiss frame notice' }).click()
      await select([html.id, image.id])
      await app.evaluate(({ clipboard }) => {
        globalThis.frameClipboardWaiting = false
        globalThis.frameClipboardGate = new Promise((resolve) => { globalThis.releaseFrameClipboard = resolve })
        clipboard.write = async (items) => {
          globalThis.frameClipboardWaiting = true
          await globalThis.frameClipboardGate
          return globalThis.originalFrameClipboardWrite.call(clipboard, items)
        }
      })
      await menu('Cut')
      for (let i = 0; i < 100 && !await app.evaluate(() => globalThis.frameClipboardWaiting); i++) await win.waitForTimeout(20)
      assert.equal(await app.evaluate(() => globalThis.frameClipboardWaiting), true)
      await win.evaluate((id) => window.chalk.invoke('op', { type: 'patch', id, patch: { name: 'Changed during Cut' } }), html.id)
      await app.evaluate(({ clipboard }) => {
        clipboard.write = globalThis.originalFrameClipboardWrite
        globalThis.releaseFrameClipboard()
      })
      await win.getByRole('alert').filter({ hasText: /Frames changed during Cut/ }).waitFor()
      assert.equal((await canvas()).frames.length, 2)
      assert.equal((await state()).frames.find((f) => f.id === html.id).name, 'Changed during Cut')
      await win.evaluate((id) => window.chalk.invoke('op', { type: 'patch', id, patch: { name: 'Mixed HTML' } }), html.id)
      await win.getByRole('button', { name: 'Dismiss frame notice' }).click()
    })
    await check('project switches away and back during clipboard reads cannot paste stale frames', async () => {
      await select([html.id, image.id])
      await copy()
      await app.evaluate(({ clipboard }) => {
        globalThis.originalFrameClipboardRead = clipboard.read
        globalThis.frameClipboardReading = false
        globalThis.frameClipboardReadGate = new Promise((resolve) => { globalThis.releaseFrameClipboardRead = resolve })
        clipboard.read = async () => {
          globalThis.frameClipboardReading = true
          const items = await globalThis.originalFrameClipboardRead.call(clipboard)
          await globalThis.frameClipboardReadGate
          return items
        }
      })
      await menu('Paste')
      for (let i = 0; i < 100 && !await app.evaluate(() => globalThis.frameClipboardReading); i++) await win.waitForTimeout(20)
      assert.equal(await app.evaluate(() => globalThis.frameClipboardReading), true)
      await switchProject(destination)
      await switchProject(source)
      await app.evaluate(({ clipboard }) => {
        clipboard.read = globalThis.originalFrameClipboardRead
        globalThis.releaseFrameClipboardRead()
      })
      await win.getByRole('alert').filter({ hasText: /project changed/ }).waitFor()
      assert.equal((await canvas()).frames.length, 2)
      assert.deepEqual((await canvas()).selectedFrameIds, [])
      await switchProject(destination)
      assert.equal((await canvas()).frames.length, 0)
      await switchProject(source)
      assert.equal((await canvas()).frames.length, 2)
      await win.getByRole('button', { name: 'Dismiss frame notice' }).click()
    })
    await check('project switches during clipboard writes cannot cut another project or reuse stale selection', async () => {
      await select([html.id, image.id])
      await app.evaluate(({ clipboard }) => {
        globalThis.originalFrameClipboardWrite = clipboard.write
        globalThis.frameClipboardWaiting = false
        globalThis.frameClipboardGate = new Promise((resolve) => { globalThis.releaseFrameClipboard = resolve })
        clipboard.write = async (items) => {
          globalThis.frameClipboardWaiting = true
          await globalThis.frameClipboardGate
          return globalThis.originalFrameClipboardWrite.call(clipboard, items)
        }
      })
      await menu('Cut')
      for (let i = 0; i < 100 && !await app.evaluate(() => globalThis.frameClipboardWaiting); i++) await win.waitForTimeout(20)
      assert.equal(await app.evaluate(() => globalThis.frameClipboardWaiting), true)
      await switchProject(destination)
      await app.evaluate(({ clipboard }) => {
        clipboard.write = globalThis.originalFrameClipboardWrite
        globalThis.releaseFrameClipboard()
      })
      await win.getByRole('alert').filter({ hasText: /project changed/ }).waitFor()
      assert.deepEqual((await canvas()).selectedFrameIds, [])
      assert.equal((await canvas()).frames.length, 0)
      await switchProject(source)
      assert.equal((await canvas()).frames.length, 2)
    })
    await check('atomic Op arrays skip stale targets and prune selection before Undo and Redo responses', async () => {
      await focusCanvas()
      const id = 'atomic-frames-fixture'
      await win.evaluate(async (id) => {
        await window.chalk.invoke('op', [
          { type: 'add', frame: { id, kind: 'html', name: 'Atomic', html: '', x: 0, y: 0, width: 390, height: 844, updatedAt: Date.now() } },
          { type: 'patch', id, patch: { x: 123 } },
          { type: 'delete', id: 'missing-frame' }
        ])
        await window.chalk.invoke('select', [id, 'missing-frame'])
      }, id)
      assert.deepEqual((await canvas()).selectedFrameIds, [id])
      assert.equal((await canvas()).frames.find((f) => f.id === id).x, 123)
      await win.evaluate(() => window.chalk.invoke('history', 'undo'))
      assert.deepEqual((await canvas()).selectedFrameIds, [])
      assert.equal((await canvas()).frames.length, 2)
      await win.evaluate(() => window.chalk.invoke('history', 'redo'))
      assert.equal((await canvas()).frames.length, 3)
      await win.evaluate(async (id) => {
        await window.chalk.invoke('select', [id])
        await window.chalk.invoke('op', [{ type: 'delete', id }, { type: 'patch', id, patch: { x: 99 } }])
      }, id)
      assert.deepEqual((await canvas()).selectedFrameIds, [])
      await win.evaluate(() => window.chalk.invoke('op', [{ type: 'delete', id: 'missing-frame' }]))
      await win.evaluate(() => window.chalk.invoke('history', 'undo'))
      assert.equal((await canvas()).frames.length, 3, 'Missing-only batch does not create history')
    })
  } finally {
    await app.evaluate(({ clipboard, dialog }) => {
      if (globalThis.originalFrameClipboardWrite) clipboard.write = globalThis.originalFrameClipboardWrite
      if (globalThis.originalFrameClipboardRead) clipboard.read = globalThis.originalFrameClipboardRead
      globalThis.releaseFrameClipboardRead?.()
      globalThis.releaseFrameClipboard?.()
      if (globalThis.originalFramesOpenDialog) dialog.showOpenDialog = globalThis.originalFramesOpenDialog
    })
    await switchProject(project)
    writeFileSync(join(artifacts, 'frames-projects.json'), JSON.stringify({ source, destination, original: project }, null, 2))
  }
}
