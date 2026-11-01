import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'

const fixtures = new URL('./fixtures/styles/', import.meta.url)
const geometry = JSON.parse(readFileSync(new URL('geometry.json', fixtures)))
const legacy = JSON.parse(readFileSync(new URL('legacy-baseline.json', fixtures)))
const directions = {
  'Aerial Gravitas': 'terrain-register', 'Anchored Ribbon Grid': 'current-index', 'Artisan Editorial': 'workshop-journal',
  'Blueprint Technical': 'assembly-sheet', 'Centered Device Cascade': 'screen-relay', 'Centered Serif List': 'folio-directory',
  'Cinematic Alternating': 'scene-sequence', 'Cinematic Device Column': 'portrait-console', 'Color Block Stack': 'signal-press',
  'Dark Centered Platform': 'control-orbit', 'Editorial Landscape Stack': 'horizon-log', 'Editorial Scientific': 'specimen-review',
  'Gradient Prompt Stack': 'query-workbench', 'Illustrated Ribbon Stack': 'story-path', 'Illustrated Warm': 'neighborhood-table',
  'Inline Friendly': 'margin-greeting', 'Modular Bento Showcase': 'module-exhibit', 'Monumental Editorial': 'large-type-review',
  'Narrative Illustrated': 'chapter-garden', 'Product Data Grid': 'object-specification', 'Product Demo': 'task-theater',
  'Saturated Code Bridge': 'code-crossing', 'Soft Bento': 'cushion-desk', 'Spatial Plus': 'crosspoint-atlas',
  'Split Inverse Showcase': 'reverse-stage', 'Zigzag Bold Split': 'switchback-stories'
}
const rgb = hex => `rgb(${hex.match(/\w\w/g).map(v => parseInt(v, 16)).join(', ')})`
const luminance = hex => hex.match(/\w\w/g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0)
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05)
const shadowShape = value => value.replace(/rgba?\([^)]*\)/g, '').trim()
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) <= .5, `${message}: ${actual} != ${expected}`)
function relationships(boxes, rules) {
  for (const rule of rules) {
    const a = boxes[rule.a], b = boxes[rule.b]
    assert.ok(a, `Missing region ${rule.a}`)
    if (rule.kind === 'right') assert.ok(a.x >= b.right - 1, `${rule.a} must be right of ${rule.b}`)
    else if (rule.kind === 'below') assert.ok(a.y >= b.bottom - 1, `${rule.a} must follow ${rule.b}`)
    else if (rule.kind === 'taller') assert.ok(a.height >= b.height * rule.ratio, `${rule.a} must be taller than ${rule.b}`)
    else if (rule.kind === 'wider') assert.ok(a.width >= b.width * rule.ratio, `${rule.a} must dominate ${rule.b}`)
    else if (rule.kind === 'center') close(a.x + a.width / 2, boxes.viewport.width / 2, `${rule.a} centered`)
    else assert.fail(`Unknown geometry relation ${rule.kind}`)
  }
}

export async function checkStyles({ app, win, client, call, json, check, artifacts, root, project, agentTab, fakeLog }) {
  const evidence = join(artifacts, 'styles')
  mkdirSync(evidence, { recursive: true })
  const measurements = [], fontEvidence = [], fontSkips = [], shots = []
  const load = args => call(client, 'get_style', args).then(json)
  const styles = (await load({})).styles
  await check('32 styles expose one shared strict read-only MCP catalog', async () => {
    assert.equal(styles.length, 32)
    assert.equal(new Set(styles.map(s => s.id)).size, 32)
    const tool = (await client.listTools()).tools.find(t => t.name === 'get_style')
    assert.deepEqual(Object.keys(tool.inputSchema.properties).sort(), ['imagery', 'name', 'variant'])
    assert.equal(tool.inputSchema.additionalProperties, false)
    assert.equal(tool.annotations.readOnlyHint, true)
    const init = await win.evaluate(() => window.chalk.invoke('init'))
    assert.deepEqual(init.styles, styles)
  })
  await check('all six complete legacy payloads equal frozen baseline values', async () => {
    for (const expected of legacy) {
      const actual = await load({ name: expected.id })
      assert.deepEqual(Object.fromEntries(Object.keys(expected).map(k => [k, actual[k]])), expected)
      assert.deepEqual(actual.variants, [{ id: 'default', name: 'Default' }])
      assert.deepEqual(actual.imageryModes, [])
      assert.equal(actual.direction, null)
    }
  })
  const resolved = new Map()
  await check('26 explicit direction lookups, names, curated choices and deterministic repeats', async () => {
    for (const [direction, id] of Object.entries(directions)) {
      const s = await load({ name: direction })
      assert.equal(s.id, id)
      assert.equal(s.direction, direction)
      assert.deepEqual(await load({ name: direction.toLowerCase() }), s)
      assert.deepEqual(await load({ name: id }), s)
      assert.deepEqual(await load({ name: s.name }), s)
      assert.deepEqual(await load({ name: id }), await load({ name: id }))
      assert.equal(s.variants.length, 2)
      assert.ok(s.imageryModes.length <= 3)
      assert.ok(s.composition.length > 150 && s.mobile.length > 70)
      assert.ok(s.avoid.length >= 2)
      for (const variant of s.variants) {
        const selected = await load({ name: id, variant: variant.id })
        assert.equal(selected.resolved.variant, variant.id)
        for (const mode of s.imageryModes) assert.equal((await load({ name: id, variant: variant.id, imagery: mode.id })).resolved.imagery, mode.id)
      }
      resolved.set(id, s)
    }
    assert.equal(new Set([...resolved.values()].map(s => s.composition)).size, 26, 'copy-paste guard for composition prose')
    assert.equal(new Set([...resolved.values()].map(s => s.mobile)).size, 26, 'copy-paste guard for mobile prose')
  })
  await check('HTTP MCP rejects unsupported keys, orphans, aliases and invalid choices', async () => {
    for (const [args, message] of [
      [{ name: 'terrain-register', params: {} }, /params/], [{ name: 'terrain-register', mode: 'options' }, /mode/],
      [{ extra: true }, /extra/], [{ variant: 'atlas' }, /name.*required/], [{ imagery: 'survey-lines' }, /name.*required/],
      [{ name: 'unknown' }, /studio-ledger/], [{ name: 'terrain-register', variant: 'Carbon Frost' }, /survey.*atlas/],
      [{ name: 'terrain-register', imagery: 'missing' }, /survey-lines.*overhead-photo/],
      [{ name: 'signal-press', imagery: 'photo' }, /none.*omit/], [{ name: 'studio-ledger', variant: 'alternate' }, /default/],
      [{ name: 'studio-ledger', imagery: 'photo' }, /omit imagery/i]
    ]) {
      const r = await client.callTool({ name: 'get_style', arguments: args })
      assert.equal(r.isError, true, JSON.stringify(args))
      if (args.params || args.mode || args.extra) assert.match(r.content[0].text, /Valid fields: name, variant, imagery/)
      assert.match(r.content[0].text, message)
    }
  })
  let fontNetwork
  const checkedFontUrls = new Set()
  const fonts = async (frame, s) => {
    if (fontNetwork === false) return
    const url = s.fontLinks.match(/href="([^"]+)"/)[1]
    if (!checkedFontUrls.has(url)) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(8000) })
        assert.equal(response.status, 200, `font stylesheet ${url}`)
        fontNetwork = true
        checkedFontUrls.add(url)
      } catch (error) {
        if (error.code === 'ERR_ASSERTION') throw error
        fontNetwork = false
        fontSkips.push(`fonts.googleapis.com network unavailable: ${error.message}`)
        return
      }
    }
    const result = await frame.locator('[data-style-root]').evaluate(async (_, roles) => {
      const results = []
      let timer
      try {
        return await Promise.race([(async () => {
          for (const role of Object.values(roles).filter(value => typeof value === 'object')) {
            for (const weight of role.weights) {
              for (const italic of role.italic ? [false, true] : [false]) {
                const declaration = `${italic ? 'italic ' : ''}${weight} 16px "${role.family}"`
                const faces = await document.fonts.load(declaration, 'BESbswy0123')
                const matches = faces.filter(face => {
                  const range = face.weight.split(/\s+/).map(Number)
                  const coversWeight = range.length === 1 ? range[0] === weight : range[0] <= weight && weight <= range[1]
                  return face.family.replaceAll('"', '') === role.family && face.status === 'loaded' && face.style === (italic ? 'italic' : 'normal') && coversWeight
                })
                results.push({ family: role.family, weight, italic, loadedFaces: matches.length, faces: matches.map(face => ({ family: face.family, weight: face.weight, style: face.style, status: face.status })), check: document.fonts.check(declaration, 'BESbswy0123') })
              }
            }
          }
          return { results }
        })(), new Promise(resolve => { timer = setTimeout(() => resolve({ networkFailure: 'Font loading timed out in Electron' }), 10000) })])
      } catch (error) { return { networkFailure: String(error) } }
      finally { clearTimeout(timer) }
    }, s.type)
    if (result.networkFailure) { fontSkips.push(`${s.id}/${s.resolved.variant}: ${result.networkFailure}`); fontNetwork = false; return }
    assert.ok(result.results.every(r => r.loadedFaces > 0 && r.check), `Actual loaded font faces, not fallback: ${JSON.stringify(result)}`)
    fontEvidence.push({ id: s.id, variant: s.resolved.variant, ...result })
  }
  for (const id of Object.values(directions)) {
    const base = resolved.get(id)
    let defaultMobile
    for (const [variant, width] of [[base.variants[0].id, 1440], [base.variants[0].id, 390], [base.variants[1].id, 390]]) {
      await check(`composition ${id} ${variant} ${width}`, async () => {
        const s = await load({ name: id, variant })
        for (const [a, b] of [['ink', 'canvas'], ['ink', 'surface'], ['muted', 'canvas'], ['muted', 'surface'], ['onAccent', 'accent'], ['onInverse', 'inverse']]) assert.ok(contrast(s.colors[a], s.colors[b]) >= 4.5, `${id} contrast ${a}/${b}`)
        const fragment = readFileSync(new URL(id + '.html', fixtures), 'utf8')
        const out = json(await call(client, 'create_frame', { name: `${id} ${variant} ${width}`, width, html: s.fontLinks + s.theme + fragment }))
        try {
          await win.waitForSelector(`[data-frame-id="${out.created.id}"] iframe`)
          const frame = win.frameLocator(`[data-frame-id="${out.created.id}"] iframe`)
          await frame.locator('[data-style-root]').waitFor()
          await frame.locator('[data-style-root]').evaluate(() => document.fonts.ready)
          const measured = await frame.locator('[data-style-root]').evaluate(el => {
            const root = getComputedStyle(el), display = getComputedStyle(el.querySelector('[data-style-display]')), panel = getComputedStyle(el.querySelector('[data-style-panel]')), button = getComputedStyle(el.querySelector('[data-style-button]'))
            const boxes = { viewport: { width: innerWidth } }
            for (const region of el.querySelectorAll('[data-probe]')) {
              const r = region.getBoundingClientRect()
              boxes[region.dataset.probe] = { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom, background: getComputedStyle(region).backgroundColor, color: getComputedStyle(region).color }
            }
            const muted = getComputedStyle(el.querySelector('[data-style-muted]'))
            return { boxes, background: root.backgroundColor, ink: root.color, muted: muted.color, bodyFont: root.fontFamily, displayFont: display.fontFamily, display: parseFloat(display.fontSize), section: parseFloat(root.paddingTop), gutter: parseFloat(root.paddingLeft), surface: panel.backgroundColor, radius: parseFloat(panel.borderRadius), shadow: panel.boxShadow, control: parseFloat(button.borderRadius), accent: button.backgroundColor, onAccent: button.color }
          })
          relationships(measured.boxes, geometry[id][width === 1440 ? 'desktop' : 'mobile'])
          if (id === 'signal-press') {
            for (const [region, background, foreground] of [['proposition', 'inverse', 'onInverse'], ['proof', 'surface', 'ink'], ['action', 'accent', 'onAccent']]) {
              assert.equal(measured.boxes[region].background, rgb(s.colors[background]), `${region} is a solid band`)
              assert.equal(measured.boxes[region].color, rgb(s.colors[foreground]))
            }
          }
          assert.equal(measured.background, rgb(s.colors.canvas)); assert.equal(measured.ink, rgb(s.colors.ink)); assert.equal(measured.muted, rgb(s.colors.muted))
          assert.equal(measured.surface, rgb(s.colors.surface)); assert.equal(measured.accent, rgb(s.colors.accent)); assert.equal(measured.onAccent, rgb(s.colors.onAccent))
          assert.ok(measured.bodyFont.startsWith('"' + s.typography.body + '"') || measured.bodyFont.startsWith(s.typography.body))
          assert.ok(measured.displayFont.includes(s.typography.display))
          close(measured.display, s.responsive.displayPx[width === 1440 ? 1 : 0], 'display size')
          close(measured.section, s.responsive.sectionPx[width === 1440 ? 1 : 0], 'section padding')
          close(measured.gutter, s.responsive.gutterPx[width === 1440 ? 1 : 0], 'gutter padding')
          close(measured.radius, s.radii.panelPx, 'panel radius'); close(measured.control, s.radii.controlPx, 'control radius')
          assert.equal(measured.shadow === 'none', s.elevation === 'flat')
          if (width === 390 && variant === base.variants[0].id) defaultMobile = measured
          if (width === 390 && variant === base.variants[1].id) assert.ok(measured.radius !== defaultMobile.radius || measured.control !== defaultMobile.control || shadowShape(measured.shadow) !== shadowShape(defaultMobile.shadow) || measured.displayFont !== defaultMobile.displayFont, 'Alternate must change measured non-color treatment')
          const review = await call(client, 'review_frame', { id: out.created.id })
          const report = JSON.parse(review[1].text)
          assert.equal(report.horizontalOverflowPx, 0, JSON.stringify(report))
          assert.deepEqual(report.failedImages, [])
          assert.equal(report.pendingImages, 0)
          const shot = `${id}--${variant}--${width}.png`
          writeFileSync(join(evidence, shot), Buffer.from(review[0].data, 'base64'))
          shots.push({ id, variant, width, shot })
          measurements.push({ id, variant, width, ...measured, report })
          if (width === 390) await fonts(frame, s)
        } finally { await call(client, 'delete_frame', { id: out.created.id }) }
      })
    }
  }
  await check('real font faces load at every declared family, weight and italic style', async () => {
    if (fontSkips.length) return { skip: fontSkips.join('; ') }
    assert.equal(fontEvidence.length, 52)
  })
  writeFileSync(join(evidence, 'measurements.json'), JSON.stringify({ measurements, fontEvidence, fontSkips, checkedFontUrls: [...checkedFontUrls] }, null, 2))
  const sheet = new PNG({ width: 1050, height: Math.ceil(shots.length / 3) * 500, fill: true })
  shots.forEach(({ shot }, i) => {
    const image = PNG.sync.read(readFileSync(join(evidence, shot)))
    const scale = Math.min(340 / image.width, 490 / image.height)
    const width = Math.floor(image.width * scale), height = Math.floor(image.height * scale)
    const x = i % 3 * 350 + Math.floor((340 - width) / 2), y = Math.floor(i / 3) * 500
    for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
      const sx = Math.floor(dx / scale), sy = Math.floor(dy / scale)
      const source = (sy * image.width + sx) * 4, target = ((y + dy) * sheet.width + x + dx) * 4
      image.data.copy(sheet.data, target, source, source + 4)
    }
  })
  writeFileSync(join(evidence, 'contact-sheet.png'), PNG.sync.write(sheet))
  writeFileSync(join(evidence, 'contact-sheet.html'), `<!doctype html><meta charset="utf-8"><title>Chalk original compositions</title><style>body{font:14px system-ui;background:#eee;margin:20px}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}figure{margin:0;background:white;padding:12px}img{width:100%;height:420px;object-fit:contain;object-position:top}figcaption{margin-bottom:8px}</style><h1>Original composition examples</h1><p>Each row is desktop default, mobile default, mobile alternate. These deterministic fixtures do not evaluate AI design quality.</p><div class="grid">${shots.map(s => `<figure><figcaption>${s.id} / ${s.variant} / ${s.width}</figcaption><a href="${s.shot}"><img src="${s.shot}"></a></figure>`).join('')}</div>`)

  await agentTab()
  const style = win.getByRole('combobox', { name: 'Style', exact: true })
  const variant = win.getByRole('combobox', { name: 'Variant', exact: true })
  const logs = () => existsSync(fakeLog) ? readFileSync(fakeLog, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []
  const promptCount = () => logs().filter(l => l.type === 'user').length
  const send = async (text, selection = null) => {
    const count = promptCount()
    if (selection) {
      await win.evaluate(({ text, style }) => window.chalk.invoke('agent:send', { text, model: '', style }), { text, style: selection })
    } else {
      await win.locator('.chat textarea').fill(text)
      await win.locator('.chat textarea').press('Enter')
    }
    await win.waitForFunction(() => document.querySelector('.chat .agent-presence'), null, { timeout: 10000 })
    await win.waitForFunction(() => !document.querySelector('.chat .agent-presence'), null, { timeout: 15000 })
    assert.equal(promptCount(), count + 1, JSON.stringify(logs()))
    const content = logs().filter(l => l.type === 'user').at(-1).message.content
    return typeof content === 'string' ? content : content.filter(block => block.type === 'text').map(block => block.text).join('\n')
  }
  await check('Chat hides Style and Variant controls while keeping the composer available', async () => {
    assert.equal(await style.count(), 0)
    assert.equal(await variant.count(), 0)
    assert.equal(await win.locator('.chat textarea').isVisible(), true)
  })
  await check('explicit style IPC carries the full resolved recipe through actual SDK CLI transport', async () => {
    const prompt = await send('Keep the supplied brief and use this direction.', { id: 'terrain-register', variant: 'atlas' })
    const serialized = prompt.match(/<chosen-style>\n([^]*?)\n<\/chosen-style>/)?.[1]
    assert.ok(serialized, prompt)
    assert.deepEqual(JSON.parse(serialized), await load({ name: 'terrain-register', variant: 'atlas' }))
    assert.match(prompt, /current written instruction; selected references; project brand and DESIGN.md; chosen style; autonomous agent choice/)
    assert.equal(await style.count(), 0)
    assert.equal(await variant.count(), 0)
    const requests = logs().filter(l => l.type === 'control_request')
    assert.ok(requests.some(r => r.request.subtype === 'initialize'), 'real SDK initialization recorded')
    assert.ok(await win.locator('.msg-error').count() || await win.getByText('Agent stopped: error_during_execution').count())
  })
  await check('selected image reference precedes chosen style in real outgoing prompt', async () => {
    const png = new PNG({ width: 20, height: 20 }); png.data.fill(255)
    const image = await win.evaluate(async bytes => window.chalk.invoke('image:add', { name: 'Style reference', bytes: new Uint8Array(bytes), x: 0, y: 0 }), [...PNG.sync.write(png)])
    const reference = json(await call(client, 'get_canvas')).frames.find(f => f.name === 'Style reference')
    try {
      await win.evaluate(id => window.chalk.invoke('select', [id]), reference.id)
      const prompt = await send('Respect the reference crop.', { id: 'current-index', variant: 'alternate' })
      assert.ok(prompt.indexOf('Selected image references:') >= 0)
      assert.ok(prompt.indexOf('Selected image references:') < prompt.indexOf('<chosen-style>'))
      assert.deepEqual(JSON.parse(prompt.match(/<chosen-style>\n([^]*?)\n<\/chosen-style>/)[1]), await load({ name: 'current-index', variant: 'alternate' }))
    } finally { await call(client, 'delete_frame', { id: reference.id }) }
  })
  await check('normal Chat sends omit the style block, including after New chat', async () => {
    const prompt = await send('Keep the current direction.')
    assert.doesNotMatch(prompt, /chosen-style/)
    await win.getByRole('button', { name: 'New', exact: true }).click()
    assert.doesNotMatch(await send('Design a warm editorial coffee page.'), /chosen-style/)
    await win.getByRole('button', { name: 'New', exact: true }).click()
    assert.equal(await style.count(), 0)
    assert.equal(await variant.count(), 0)
  })
  await check('project changes preserve the draft with no style controls or saved preference', async () => {
    const other = mkdtempSync(join(tmpdir(), 'chalk-style-switch-'))
    await win.locator('.chat textarea').fill('Keep this draft across project switches.')
    await app.evaluate(({ dialog }, dir) => {
      globalThis.originalStyleOpenDialog = dialog.showOpenDialog
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
    }, other)
    try {
      await win.evaluate(() => window.chalk.invoke('project', 'open'))
      await win.waitForFunction(dir => document.querySelector('.tab.is-on')?.title === dir, other)
      assert.equal(await style.count(), 0)
      assert.equal(await win.locator('.chat textarea').inputValue(), 'Keep this draft across project switches.')
      await win.evaluate(dir => window.chalk.invoke('project', 'switch', dir), project)
      await win.waitForFunction(dir => document.querySelector('.tab.is-on')?.title === dir, project)
      assert.equal(await style.count(), 0)
      assert.equal(await win.locator('.chat textarea').inputValue(), 'Keep this draft across project switches.')
    } finally {
      await app.evaluate(({ dialog }) => { dialog.showOpenDialog = globalThis.originalStyleOpenDialog })
      await win.evaluate(dir => window.chalk.invoke('project', 'switch', dir), project)
      await win.locator('.chat textarea').fill('')
    }
    assert.deepEqual(await win.evaluate(() => Object.keys(localStorage).filter(k => /style|variant/i.test(k))), [])
  })
  await check('forged style IPC emits an error and starts no CLI', async () => {
    const count = logs().filter(l => l.type === 'spawn').length
    for (const forged of [{ id: 'missing', variant: 'primary' }, { id: 'Aerial Gravitas', variant: 'atlas' }, { id: 'terrain-register', variant: 'missing' }, { id: 'terrain-register', variant: 'survey', params: {} }]) {
      await win.evaluate(style => window.chalk.invoke('agent:send', { text: 'Do not start', model: '', style }), forged)
    }
    await win.waitForFunction(() => [...document.querySelectorAll('.msg-error')].filter(el => el.textContent.includes('Invalid style or message')).length === 4)
    await new Promise(resolve => setTimeout(resolve, 1000))
    assert.equal(await win.locator('.msg-error').filter({ hasText: 'Invalid style or message' }).count(), 4)
    assert.equal(await style.count(), 0)
    assert.equal(logs().filter(l => l.type === 'spawn').length, count)
  })
  await check('live AI design quality', async () => ({ skip: 'Not measured. Tests use a local fake executable through the real SDK; no user Claude CLI, credentials or live model is accessed.' }))
  writeFileSync(join(evidence, 'transport.json'), JSON.stringify({ prompts: logs().filter(l => l.type === 'user'), controls: logs().filter(l => l.type === 'control_request'), executable: join(root, 'scripts/fixtures/fake-claude.mjs') }, null, 2))
}
