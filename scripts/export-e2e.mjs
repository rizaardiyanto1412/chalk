import assert from 'node:assert/strict'
import { existsSync, readFileSync, writeFileSync, renameSync, symlinkSync, unlinkSync, readdirSync, mkdtempSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { PNG } from 'pngjs'

export async function checkExports({ app, win, client, call, json, check, project, artifacts, framesTab }) {
  const beforeFrames = json(await call(client, 'get_canvas')).frames
  const fixture = json(await call(client, 'create_frame', { name: '../../Export fixture', width: 200, height: 100, html: '<div style="width:100px;height:100px;background:rgb(224,32,64)"></div>' })).created
  const image = new PNG({ width: 400, height: 400 })
  for (let y = 0; y < 400; y++) for (let x = 0; x < 400; x++) {
    image.data.set(y < 200 ? [224, 32, 64, 255] : [16, 64, 224, 255], (y * 400 + x) * 4)
  }
  const sourcePng = PNG.sync.write(image)
  const savedExports = new Map()
  const waitForFile = async (file) => {
    for (let i = 0; i < 200 && !existsSync(file); i++) await win.waitForTimeout(50)
    assert.ok(existsSync(file), `file appeared: ${file}`)
    return readFileSync(file)
  }
  const pixel = (png, x, y) => [...png.data.subarray((y * png.width + x) * 4, (y * png.width + x) * 4 + 4)]
  const pngSize = (bytes, width = 200, height = 100) => {
    const png = PNG.sync.read(bytes)
    assert.deepEqual([png.width, png.height], [width, height])
    return png
  }
  const menuExport = (format) => app.evaluate(({ Menu, BrowserWindow }, label) => {
    const menu = Menu.getApplicationMenu().items.find((item) => item.label === 'File').submenu.items.find((item) => item.label === 'Export Selection').submenu
    menu.items.find((item) => item.label === label).click(undefined, BrowserWindow.getAllWindows()[0])
  }, format)
  const stubSave = (path, canceled = false) => app.evaluate(({ dialog }, { path, canceled }) => {
    globalThis.originalExportSaveDialog ??= dialog.showSaveDialog
    dialog.showSaveDialog = async (_window, options) => {
      globalThis.exportSaveOptions = options
      return { canceled, filePath: path }
    }
  }, { path, canceled })
  const select = async (id) => {
    await framesTab()
    const names = json(await call(client, 'get_canvas')).frames
    await win.locator('.layer').nth(names.findIndex((frame) => frame.id === id)).click()
    await win.waitForTimeout(100)
  }
  let imageId
  try {
    await check('export_frame writes PNG, JPEG, portable HTML, and one correctly sized PDF page without editing the project', async () => {
      await win.waitForTimeout(350)
      const before = json(await call(client, 'get_canvas'))
      const docBytes = readFileSync(join(project, 'chalk.json'))
      for (const format of ['png', 'jpeg', 'html', 'pdf']) {
        const result = json(await call(client, 'export_frame', { id: fixture.id, format }))
        assert.equal(dirname(result.path), join(project, 'exports'))
        assert.match(result.path, /export-fixture-[a-z0-9-]+\.(png|jpg|html|pdf)$/)
        assert.deepEqual([result.width, result.height], [200, 100])
        const bytes = readFileSync(result.path)
        savedExports.set(format, bytes)
        writeFileSync(join(artifacts, `export-html-frame.${format === 'jpeg' ? 'jpg' : format}`), bytes)
        assert.equal(result.bytes, bytes.length)
      }
      const png = pngSize(savedExports.get('png'))
      assert.deepEqual(pixel(png, 20, 20), [224, 32, 64, 255])
      assert.deepEqual(pixel(png, 180, 20), [255, 255, 255, 255])
      const [screenshot] = await call(client, 'screenshot_frame', { id: fixture.id })
      const plain = pngSize(Buffer.from(screenshot.data, 'base64'))
      assert.deepEqual(png.data, plain.data)
      assert.equal(savedExports.get('jpeg').subarray(0, 3).toString('hex'), 'ffd8ff')
      const jpegDecoded = await app.evaluate(({ nativeImage }, b64) => nativeImage.createFromBuffer(Buffer.from(b64, 'base64')).toPNG().toString('base64'), savedExports.get('jpeg').toString('base64'))
      const jpg = pngSize(Buffer.from(jpegDecoded, 'base64'))
      assert.ok(pixel(jpg, 180, 20).slice(0, 3).every((value) => value >= 250), 'transparent JPEG pixels are white')
      assert.match(savedExports.get('html').toString(), /^<!doctype html>/)
      assert.match(savedExports.get('html').toString(), /rgb\(224,32,64\)/)
      const pdf = savedExports.get('pdf').toString('latin1')
      assert.match(pdf, /^%PDF-/)
      assert.equal((pdf.match(/\/Type\s*\/Page\b/g) || []).length, 1)
      const box = pdf.match(/\/MediaBox\s*\[([^\]]+)\]/)[1].trim().split(/\s+/).map(Number)
      assert.ok(Math.abs(box[2] - 150) < 1 && Math.abs(box[3] - 75) < 1, `PDF points ${box}`)
      assert.deepEqual(json(await call(client, 'get_canvas')).frames, before.frames)
      assert.deepEqual(readFileSync(join(project, 'chalk.json')), docBytes)
    })

    await check('copy_frame_image puts actual PNG pixels on the system clipboard without writing or editing', async () => {
      const before = readdirSync(join(project, 'exports'))
      const doc = readFileSync(join(project, 'chalk.json'))
      assert.equal(json(await call(client, 'copy_frame_image', { id: fixture.id })).status, 'copied')
      const data = await app.evaluate(async ({ clipboard }) => {
        const item = (await clipboard.read()).find((item) => item.types.includes('image/png'))
        return Buffer.from(await (await item.getType('image/png')).arrayBuffer()).toString('base64')
      })
      assert.deepEqual(pngSize(Buffer.from(data, 'base64')).data, pngSize(savedExports.get('png')).data)
      assert.deepEqual(readdirSync(join(project, 'exports')), before)
      assert.deepEqual(readFileSync(join(project, 'chalk.json')), doc)
    })

    await check('concurrent exports use independent render windows and leave no temporary files', async () => {
      const results = await Promise.all(['png', 'pdf', 'png'].map((format) => call(client, 'export_frame', { id: fixture.id, format })))
      for (const result of results) {
        const output = json(result)
        assert.ok(readFileSync(output.path).length > 0)
      }
      assert.deepEqual(pngSize(readFileSync(json(results[0]).path)).data, pngSize(savedExports.get('png')).data)
      assert.ok(readdirSync(join(project, 'exports')).every((name) => !name.endsWith('.tmp')))
      assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1)
    })

    await check('a resized image exports the same top cover crop as canvas and portable embedded HTML', async () => {
      await win.evaluate(async (b64) => {
        const dt = new DataTransfer()
        dt.items.add(new File([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], 'export-crop.png', { type: 'image/png' }))
        const canvas = document.querySelector('.canvas')
        const r = canvas.getBoundingClientRect()
        canvas.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: r.left + 40, clientY: r.top + 40 }))
      }, sourcePng.toString('base64'))
      await win.waitForFunction(() => [...document.querySelectorAll('.layer')].some((node) => node.textContent.includes('export-crop')))
      imageId = json(await call(client, 'get_canvas')).frames.find((frame) => frame.name === 'export-crop').id
      await call(client, 'update_frame', { id: imageId, width: 200, height: 100 })
      const png = pngSize(readFileSync(json(await call(client, 'export_frame', { id: imageId, format: 'png' })).path))
      assert.deepEqual(pixel(png, 100, 0), [224, 32, 64, 255])
      assert.deepEqual(pixel(png, 100, 99), [224, 32, 64, 255], 'bottom blue half was cropped')
      const html = readFileSync(json(await call(client, 'export_frame', { id: imageId, format: 'html' })).path, 'utf8')
      assert.match(html, /object-fit:cover;object-position:top/)
      assert.match(html, /data:image\/png;base64,/)
      assert.doesNotMatch(html, /\/assets\//)
      const portable = await app.evaluate(async ({ BrowserWindow }, html) => {
        const view = new BrowserWindow({ show: false, width: 300, height: 200, useContentSize: true, webPreferences: { offscreen: true, sandbox: true } })
        try {
          await view.loadURL(`data:text/html,${encodeURIComponent(html)}`)
          await view.webContents.executeJavaScript('Promise.all([...document.images].map(image => image.decode()))')
          return (await view.webContents.capturePage()).toPNG().toString('base64')
        } finally { view.destroy() }
      }, html)
      const standalone = pngSize(Buffer.from(portable, 'base64'), 300, 200)
      for (let row = 0; row < 100; row++) assert.deepEqual(standalone.data.subarray(row * 300 * 4, (row * 300 + 200) * 4), png.data.subarray(row * 200 * 4, (row + 1) * 200 * 4))
      assert.deepEqual(pixel(standalone, 250, 150), [255, 255, 255, 255], 'HTML preserves the saved frame box in a larger browser window')
      const [original] = await call(client, 'screenshot_frame', { id: imageId })
      pngSize(Buffer.from(original.data, 'base64'), 400, 400)
      for (const format of ['jpeg', 'pdf']) {
        const bytes = readFileSync(json(await call(client, 'export_frame', { id: imageId, format })).path)
        assert.ok(format === 'pdf' ? bytes.toString('latin1').startsWith('%PDF-') : bytes.subarray(0, 3).toString('hex') === 'ffd8ff')
      }
    })

    await check('HTML asset URLs, srcset, CSS images, and linked CSS are embedded from the project snapshot', async () => {
      writeFileSync(join(project, 'assets', 'export-source.png'), sourcePng)
      writeFileSync(join(project, 'assets', 'export-style.css'), 'body{background-image:url("export-source.png")}')
      const out = json(await call(client, 'create_frame', { name: 'Local assets', width: 200, height: 100, html: '<link rel="stylesheet" href="/assets/export-style.css"><img style="width:200px;height:100px;object-fit:cover;object-position:top" src="./assets/export-source.png?v=1" srcset="/assets/export-source.png 1x, assets/export-source.png 2x"><style>div{background:url(/assets/export-source.png)}</style>' })).created
      try {
        const html = readFileSync(json(await call(client, 'export_frame', { id: out.id, format: 'html' })).path, 'utf8')
        assert.doesNotMatch(html, /(?:\.\/|\/)assets\//)
        assert.match(html, /data:text\/css;base64,/)
        const css = Buffer.from(html.match(/data:text\/css;base64,([^"\s]+)/)[1], 'base64').toString()
        assert.match(css, /data:image\/png;base64,/)
        const png = pngSize(readFileSync(json(await call(client, 'export_frame', { id: out.id, format: 'png' })).path))
        assert.deepEqual(pixel(png, 100, 50), [224, 32, 64, 255])
      } finally { await call(client, 'delete_frame', { id: out.id }) }
    })

    await check('export rewriting preserves body, code, scripts, CSS strings and remote URLs while embedding spaced asset names', async () => {
      writeFileSync(join(project, 'assets', 'my logo.png'), sourcePng)
      const markup = `<p>Files live in assets/brand</p><code>assets/logo.png</code><script>window.example="assets/missing.png";1 //%x
</script><style>p::after{content:"url(assets/brand)"}/* url(assets/missing.png) */</style><a href="/assets/spec.pdf">PDF</a><img alt="relative" src="my-assets/x.png"><img alt="remote" src="https://cdn.example.com/a,b/assets/x.png"><img alt="spaced" style="position:absolute;left:0;top:0;width:200px;height:100px;object-fit:cover;object-position:top" src="assets/my logo.png">`
      const frame = json(await call(client, 'create_frame', { name: 'URL contexts', width: 200, height: 100, html: markup })).created
      try {
        const html = readFileSync(json(await call(client, 'export_frame', { id: frame.id, format: 'html' })).path, 'utf8')
        for (const text of ['Files live in assets/brand', '<code>assets/logo.png</code>', 'window.example="assets/missing.png"', 'url(assets/brand)', '/* url(assets/missing.png) */', 'href="/assets/spec.pdf"', 'src="my-assets/x.png"', 'https://cdn.example.com/a,b/assets/x.png']) assert.ok(html.includes(text), text)
        assert.match(html, /data:image\/png;base64,/)
        const png = pngSize(readFileSync(json(await call(client, 'export_frame', { id: frame.id, format: 'png' })).path))
        assert.deepEqual(pixel(png, 100, 50), [224, 32, 64, 255])
        assert.equal(json(await call(client, 'copy_frame_image', { id: frame.id })).status, 'copied')
      } finally { await call(client, 'delete_frame', { id: frame.id }) }
    })

    await check('private exports block dynamic asset requests through loopback aliases', async () => {
      const urls = ['x.localhost', 'localhost.', '127.0.0.2', '0.0.0.0', '[::ffff:7f00:1]', '127.0.0.1'].map((host) => `http://${host}:7911/assets/export-source.png`)
      const html = `<div id="result" style="width:200px;height:100px;background:rgb(0,0,255)"></div><script>Promise.all(${JSON.stringify(urls)}.map(url=>new Promise(resolve=>{const image=new Image();image.onload=()=>resolve(false);image.onerror=()=>resolve(true);image.src=url}))).then(blocked=>document.getElementById('result').style.background=blocked.every(Boolean)?'rgb(0,200,0)':'rgb(255,0,0)')</script>`
      const frame = json(await call(client, 'create_frame', { name: 'Loopback export', width: 200, height: 100, html })).created
      try {
        const png = pngSize(readFileSync(json(await call(client, 'export_frame', { id: frame.id, format: 'png' })).path))
        assert.deepEqual(pixel(png, 100, 50), [0, 200, 0, 255], 'every dynamic loopback request was blocked')
      } finally { await call(client, 'delete_frame', { id: frame.id }) }
    })

    await check('the real toolbar exports both frame kinds, copies PNG, and preserves Copy HTML and Open', async () => {
      await select(fixture.id)
      await win.getByTitle('Copy HTML', { exact: true }).click()
      assert.match(await app.evaluate(({ clipboard }) => clipboard.readText()), /rgb\(224,32,64\)/)
      assert.equal(await win.getByTitle('Open in your browser', { exact: true }).count(), 1)
      for (const id of [fixture.id, imageId]) {
        await select(id)
        const path = join(artifacts, `toolbar-${id}.png`)
        await stubSave(path)
        await win.getByRole('button', { name: 'Export frame', exact: true }).click()
        assert.deepEqual(await win.getByRole('dialog', { name: 'Export frame formats' }).getByRole('button').allTextContents(), ['PNG', 'JPEG', 'HTML', 'PDF'])
        await win.getByRole('button', { name: 'Export PNG', exact: true }).click()
        const bytes = await waitForFile(path)
        assert.deepEqual(pixel(pngSize(bytes), 20, 20), [224, 32, 64, 255])
        await win.getByRole('status').filter({ hasText: 'Saved' }).waitFor()
        const options = await app.evaluate(() => globalThis.exportSaveOptions)
        assert.match(options.defaultPath, /\.png$/)
        assert.deepEqual(options.filters[0].extensions, ['png'])
      }
      await win.getByRole('button', { name: 'Copy as PNG', exact: true }).click()
      await win.getByRole('status').filter({ hasText: 'PNG copied' }).waitFor()
      const data = await app.evaluate(async ({ clipboard }) => {
        const item = (await clipboard.read()).find((item) => item.types.includes('image/png'))
        return Buffer.from(await (await item.getType('image/png')).arrayBuffer()).toString('base64')
      })
      assert.deepEqual(pixel(pngSize(Buffer.from(data, 'base64')), 100, 99), [224, 32, 64, 255])
      await win.getByRole('button', { name: 'Export frame', exact: true }).click()
      await win.getByRole('button', { name: 'Export PNG', exact: true }).press('Escape')
      assert.equal(await win.getByRole('dialog', { name: 'Export frame formats' }).count(), 0)
      assert.equal(await win.getByRole('button', { name: 'Export frame', exact: true }).evaluate((button) => button === document.activeElement), true)
    })

    await check('File Export Selection uses the same export path and rejects absent or multiple selections', async () => {
      await select(fixture.id)
      const path = join(artifacts, 'file-menu.html')
      await stubSave(path)
      await menuExport('HTML')
      assert.match((await waitForFile(path)).toString(), /rgb\(224,32,64\)/)
      const result = await win.evaluate(async () => {
        await window.chalk.invoke('select', [])
      })
      assert.equal(result, undefined)
      await menuExport('PNG')
      await win.getByRole('alert').filter({ hasText: 'Select one frame' }).waitFor()
      await win.evaluate((ids) => window.chalk.invoke('select', ids), [fixture.id, imageId])
      await menuExport('PNG')
      await win.getByRole('alert').filter({ hasText: 'Select one frame' }).waitFor()
      await select(fixture.id)
    })

    await check('save dialog cancel returns canceled, writes nothing, and visible failures return typed errors', async () => {
      const path = join(artifacts, 'canceled-export.png')
      await stubSave(path, true)
      const before = readFileSync(join(project, 'chalk.json'))
      const result = await win.evaluate((id) => window.chalk.invoke('frame:export', id, 'png'), fixture.id)
      assert.deepEqual(result, { status: 'canceled' })
      assert.equal(existsSync(path), false)
      assert.deepEqual(readFileSync(join(project, 'chalk.json')), before)
      await win.getByRole('status').filter({ hasText: 'Export canceled' }).waitFor()
      await stubSave(join(artifacts, 'missing-folder', 'failure.png'))
      await win.getByRole('button', { name: 'Export frame', exact: true }).click()
      await win.getByRole('button', { name: 'Export PNG', exact: true }).click()
      await win.getByRole('alert').filter({ hasText: 'ENOENT' }).waitFor()
      const bad = await win.evaluate((id) => window.chalk.invoke('frame:export', id, 'webp'), fixture.id)
      assert.equal(bad.status, 'error')
      assert.equal(bad.message, 'Choose PNG, JPEG, HTML, or PDF for export.')
    })

    await check('unsupported formats, arbitrary output paths, and unsafe exports folders cannot redirect writes', async () => {
      const arbitrary = join(artifacts, 'model-chosen-output.html')
      assert.equal((await client.callTool({ name: 'export_frame', arguments: { id: fixture.id, format: 'webp' } })).isError, true)
      const output = json(await call(client, 'export_frame', { id: fixture.id, format: 'html', path: arbitrary }))
      assert.equal(existsSync(arbitrary), false)
      assert.equal(dirname(output.path), join(project, 'exports'))
      const folder = join(project, 'exports')
      const backup = `${folder}-backup`
      const external = mkdtempSync(join(tmpdir(), 'chalk-export-outside-'))
      renameSync(folder, backup)
      try {
        symlinkSync(external, folder)
        const link = await client.callTool({ name: 'export_frame', arguments: { id: fixture.id, format: 'html' } })
        assert.equal(link.isError, true)
        assert.match(link.content[0].text, /not a folder/)
        assert.deepEqual(readdirSync(external), [])
        unlinkSync(folder)
        writeFileSync(folder, 'not a folder')
        assert.equal((await client.callTool({ name: 'export_frame', arguments: { id: fixture.id, format: 'html' } })).isError, true)
      } finally { unlinkSync(folder); renameSync(backup, folder) }
      assert.equal((await fetch(`http://127.0.0.1:7911/export/${fixture.id}.png`)).status, 404)
    })

    await check('untrusted image asset traversal and symbolic links fail at the export boundary', async () => {
      const unsafe = { id: 'unsafe-export-fixture', kind: 'image', name: 'Unsafe', asset: '../chalk.json', width: 200, height: 100, x: 0, y: 0, updatedAt: Date.now() }
      await win.evaluate((frame) => window.chalk.invoke('op', { type: 'add', frame }), unsafe)
      const link = join(project, 'assets', 'export-escape.png')
      try {
        const bad = await client.callTool({ name: 'export_frame', arguments: { id: unsafe.id, format: 'html' } })
        assert.equal(bad.isError, true)
        assert.match(bad.content[0].text, /Unsafe asset path/)
        symlinkSync(join(project, 'chalk.json'), link)
        await win.evaluate((frame) => window.chalk.invoke('op', { type: 'add', frame }), { ...unsafe, id: 'link-export-fixture', asset: 'export-escape.png' })
        const escaped = await client.callTool({ name: 'export_frame', arguments: { id: 'link-export-fixture', format: 'png' } })
        assert.equal(escaped.isError, true)
        assert.match(escaped.content[0].text, /missing or unsafe/)
      } finally {
        if (existsSync(link)) unlinkSync(link)
        await call(client, 'delete_frame', { id: unsafe.id })
        const frames = json(await call(client, 'get_canvas')).frames
        if (frames.some((f) => f.id === 'link-export-fixture')) await call(client, 'delete_frame', { id: 'link-export-fixture' })
      }
    })

    await check('private export previews are removed on render failure and leave no render window behind', async () => {
      const broken = json(await call(client, 'create_frame', { name: 'Broken export', width: 200, height: 100, html: '<div>Visible</div><script>Object.defineProperty(document.documentElement,"scrollHeight",{get(){throw new Error("export render fixture")}})</script>' })).created
      await app.evaluate(({ app }) => {
        app.once('browser-window-created', (_event, window) => window.webContents.once('did-finish-load', () => { globalThis.failedExportPreview = window.webContents.getURL() }))
      })
      try {
        const result = await client.callTool({ name: 'export_frame', arguments: { id: broken.id, format: 'png' } })
        assert.equal(result.isError, true)
        const preview = await app.evaluate(() => globalThis.failedExportPreview)
        assert.match(preview, /\/preview\//)
        assert.equal((await fetch(preview)).status, 404)
        assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1)
      } finally { await call(client, 'delete_frame', { id: broken.id }) }
    })

    await check('pending UI and MCP exports retain the original frame, assets, and project across project switches', async () => {
      const otherProject = mkdtempSync(join(tmpdir(), 'chalk-export-switch-'))
      const destination = join(artifacts, 'snapshot-switch.png')
      const imageFrame = (await win.evaluate(() => window.chalk.invoke('init'))).doc.frames.find((frame) => frame.id === imageId)
      const imagePath = join(project, 'assets', imageFrame.asset)
      const originalAsset = readFileSync(imagePath)
      const blue = PNG.sync.read(originalAsset)
      for (let offset = 0; offset < blue.data.length; offset += 4) blue.data.set([16, 64, 224, 255], offset)
      const changedAsset = PNG.sync.write(blue)
      await app.evaluate(({ dialog }, { otherProject, destination }) => {
        globalThis.originalExportOpenDialog = dialog.showOpenDialog
        dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [otherProject] })
        dialog.showSaveDialog = async () => {
          globalThis.exportDialogPending = true
          return new Promise((resolve) => { globalThis.releaseExportDialog = () => resolve({ canceled: false, filePath: destination }) })
        }
      }, { otherProject, destination })
      const pending = win.evaluate((id) => window.chalk.invoke('frame:export', id, 'png'), imageId)
      for (let i = 0; i < 100 && !await app.evaluate(() => globalThis.exportDialogPending); i++) await win.waitForTimeout(20)
      try {
        assert.equal(await app.evaluate(() => globalThis.exportDialogPending), true)
        const overlap = await win.evaluate((id) => window.chalk.invoke('frame:export', id, 'png'), imageId)
        assert.deepEqual(overlap, { status: 'error', message: 'An export is already running.' })
        await menuExport('PNG')
        await win.getByRole('status').filter({ hasText: 'Preparing export' }).waitFor()
        assert.equal(await win.getByRole('button', { name: 'Export frame', exact: true }).isDisabled(), true)
        await call(client, 'update_frame', { id: imageId, width: 300, height: 150 })
        writeFileSync(imagePath, changedAsset)
        await win.evaluate(() => window.chalk.invoke('project', 'open'))
        assert.equal(json(await call(client, 'get_canvas')).project, otherProject)
        await app.evaluate(() => globalThis.releaseExportDialog())
        assert.equal((await pending).status, 'saved')
        assert.deepEqual(pixel(pngSize(await waitForFile(destination)), 100, 99), [224, 32, 64, 255])
        await win.evaluate((dir) => window.chalk.invoke('project', 'switch', dir), project)
        writeFileSync(imagePath, originalAsset)
        await call(client, 'update_frame', { id: imageId, width: 200, height: 100 })
        await app.evaluate(({ app }) => {
          globalThis.exportWindowReady = new Promise((resolve) => app.once('browser-window-created', (_event, window) => window.webContents.once('did-finish-load', () => {
            globalThis.successExportPreview = window.webContents.getURL()
            resolve()
          })))
        })
        const mcpPending = call(client, 'export_frame', { id: imageId, format: 'png' })
        await app.evaluate(() => globalThis.exportWindowReady)
        await call(client, 'update_frame', { id: imageId, width: 300, height: 150 })
        writeFileSync(imagePath, changedAsset)
        await win.evaluate((dir) => window.chalk.invoke('project', 'switch', dir), otherProject)
        const result = json(await mcpPending)
        assert.equal(result.projectDir, project)
        assert.equal(dirname(result.path), join(project, 'exports'))
        assert.deepEqual(pixel(pngSize(readFileSync(result.path)), 100, 99), [224, 32, 64, 255])
        assert.equal((await fetch(await app.evaluate(() => globalThis.successExportPreview))).status, 404)
        assert.deepEqual(readdirSync(join(otherProject, 'assets')), [])
        assert.equal(existsSync(join(otherProject, 'exports')), false)
      } finally {
        writeFileSync(imagePath, originalAsset)
        await app.evaluate(({ dialog }) => {
          globalThis.releaseExportDialog?.()
          dialog.showOpenDialog = globalThis.originalExportOpenDialog
        })
        await pending
        await win.evaluate((dir) => window.chalk.invoke('project', 'switch', dir), project)
      }
    })
  } finally {
    await app.evaluate(({ dialog }) => { if (globalThis.originalExportSaveDialog) dialog.showSaveDialog = globalThis.originalExportSaveDialog })
    if (imageId) await call(client, 'delete_frame', { id: imageId })
    await call(client, 'delete_frame', { id: fixture.id })
    assert.deepEqual(json(await call(client, 'get_canvas')).frames, beforeFrames, 'export fixtures cleaned up')
  }
}
