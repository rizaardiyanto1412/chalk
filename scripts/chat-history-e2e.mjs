import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export async function checkChatHistory({ electron, root, artifacts, check }) {
  const evidence = join(artifacts, 'chat-history')
  mkdirSync(evidence, { recursive: true })
  const project = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-history-')))
  const other = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-history-other-')))
  const profile = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-history-profile-')))
  const log = join(evidence, 'transport.jsonl')
  writeFileSync(log, '')
  const directory = join(project, '.chalk', 'chats')
  const files = () => existsSync(directory) ? readdirSync(directory).filter(name => name.endsWith('.json')) : []
  const read = (id) => JSON.parse(readFileSync(join(directory, `${id}.json`), 'utf8'))
  const logs = () => readFileSync(log, 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  const launch = () => electron.launch({ args: [root, `--user-data-dir=${profile}`], cwd: root, env: { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')), CHALK_PROJECT_DIR: project, CHALK_CLAUDE_PATH: join(root, 'scripts/fixtures/fake-claude.mjs'), CHALK_FAKE_LOG: log, CHALK_FAKE_HISTORY: '1', CHALK_PORT: String((Number(process.env.CHALK_PORT) || 8150) + 4), ELECTRON_RENDERER_URL: '' } })
  let instance
  let win
  let first
  let second
  const start = async () => {
    instance = await launch()
    assert.equal(realpathSync(await instance.evaluate(({ app }) => app.getPath('userData'))), profile)
    win = await instance.firstWindow()
    await win.waitForSelector('.chat textarea')
  }
  const invoke = (channel, ...args) => win.evaluate(({ channel, args }) => window.chalk.invoke(channel, ...args), { channel, args })
  const state = () => invoke('chats:list')
  const idle = () => win.waitForSelector('.chat-new:not(:disabled)')
  const send = async (text) => {
    await win.locator('.chat textarea').fill(text)
    await win.locator('.chat textarea').press('Enter')
    await win.waitForFunction((text) => [...document.querySelectorAll('.msg-user')].some(node => node.textContent === text.trim()), text)
    await win.waitForSelector('.agent-presence')
    await idle()
  }
  const menu = () => win.getByRole('button', { name: 'Chat history', exact: true }).click()
  const openProject = async (dir) => {
    await instance.evaluate(({ dialog }, dir) => {
      globalThis.historyOpenDialog ??= dialog.showOpenDialog
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] })
    }, dir)
    await invoke('project', 'open')
    await win.waitForFunction(dir => document.querySelector('.tab.is-on')?.title === dir, dir)
  }
  const confirm = (response) => instance.evaluate(({ dialog }, response) => {
    globalThis.historyMessageBox ??= dialog.showMessageBox
    globalThis.historyConfirmations ??= []
    dialog.showMessageBox = async (_window, options) => {
      globalThis.historyConfirmations.push(options)
      return { response, checkboxChecked: false }
    }
  }, response)
  try {
    await start()
    await check('history saves a first turn atomically and leaves a fresh chat unsaved', async () => {
      assert.deepEqual(files(), [])
      await send('  Design a calm reading page.  ')
      const history = await state()
      first = history.current.id
      assert.equal(history.current.title, 'Design a calm reading page.')
      assert.equal(history.current.model, undefined)
      assert.equal(history.chats.length, 1)
      assert.equal(files().length, 1)
      const saved = read(first)
      assert.equal(saved.id, first)
      assert.match(saved.sessionId, /^[\da-f-]{36}$/)
      assert.ok(saved.events.some(event => event.type === 'user' && event.text === 'Design a calm reading page.'))
      assert.ok(saved.events.some(event => event.type === 'text' && event.text === 'Saved design conversation.'))
      assert.equal(readdirSync(directory).some(name => name.endsWith('.tmp')), false)
    })
    await check('history restores messages and lists the latest chat under Today after an app restart', async () => {
      await instance.close()
      instance = undefined
      await start()
      assert.equal(await win.locator('.msg-user').innerText(), 'Design a calm reading page.')
      assert.equal(await win.locator('.msg-text').innerText(), 'Saved design conversation.')
      assert.equal((await state()).current.id, first)
      await menu()
      const today = win.getByRole('group', { name: 'Today', exact: true })
      assert.equal(await today.getByRole('menuitemradio').count(), 1)
      assert.equal(await today.getByRole('menuitemradio').getAttribute('aria-checked'), 'true')
      await win.keyboard.press('Escape')
      await win.getByRole('menu', { name: 'Chat history' }).waitFor({ state: 'detached' })
    })
    await check('New starts an empty unsaved chat and a second message sorts its chat first', async () => {
      await win.locator('.chat-new').click()
      await win.waitForSelector('.agent-empty')
      assert.equal(await win.locator('.msg-user').count(), 0)
      assert.equal(files().length, 1)
      assert.equal((await state()).current.sessionId, undefined)
      await win.locator('[title="Claude model"]').selectOption('sonnet')
      await send('Create a focused project dashboard.')
      const history = await state()
      second = history.current.id
      assert.notEqual(second, first)
      assert.equal(history.current.model, 'sonnet')
      assert.deepEqual(history.chats.map(chat => chat.id), [second, first])
      assert.equal(files().length, 2)
      await menu()
      assert.equal(await win.getByRole('menuitemradio').first().innerText(), 'Create a focused project dashboard.')
      await win.keyboard.press('Escape')
    })
    await check('opening a saved chat restores its transcript and the SDK receives its stored resume ID', async () => {
      const savedSession = read(first).sessionId
      const count = logs().filter(item => item.type === 'spawn').length
      await menu()
      await win.getByRole('menuitemradio', { name: 'Design a calm reading page.', exact: true }).click()
      await win.waitForFunction(() => document.querySelector('.chat-session span')?.textContent === 'Design a calm reading page.')
      assert.equal(await win.locator('.msg-user').innerText(), 'Design a calm reading page.')
      await send('Refine the reading controls.')
      const spawned = logs().filter(item => item.type === 'spawn').slice(count)
      assert.equal(spawned.length, 1)
      assert.ok(spawned[0].argv.includes(`--resume=${savedSession}`))
      assert.equal(read(first).sessionId, savedSession)
      assert.equal(await win.locator('.msg-user').count(), 2)
    })
    await check('a missing Claude session retries once without resume and keeps the transcript with a notice', async () => {
      const previous = read(first).sessionId
      const count = logs().filter(item => item.type === 'spawn').length
      await send('[history-expired] Continue with a new session.')
      const spawned = logs().filter(item => item.type === 'spawn').slice(count)
      assert.equal(spawned.length, 2)
      assert.ok(spawned[0].argv.includes(`--resume=${previous}`))
      assert.equal(spawned[1].argv.some(arg => arg.startsWith('--resume=')), false)
      assert.notEqual(read(first).sessionId, previous)
      assert.equal(await win.locator('.msg-user').count(), 3)
      assert.equal(await win.locator('.msg-notice').count(), 1)
      assert.equal(await win.locator('.msg-error').count(), 0)
    })
    await check('project switches show separate histories and restore the most recent conversation', async () => {
      await openProject(other)
      assert.equal((await state()).chats.length, 0)
      assert.equal(await win.locator('.msg-user').count(), 0)
      await send('Sketch a separate mobile project.')
      assert.equal(readdirSync(join(other, '.chalk', 'chats')).length, 1)
      await invoke('project', 'switch', project)
      assert.equal((await state()).current.id, first)
      assert.equal(await win.locator('.msg-user').count(), 3)
      await invoke('project', 'switch', other)
      assert.equal(await win.locator('.msg-user').innerText(), 'Sketch a separate mobile project.')
      await invoke('project', 'switch', project)
    })
    await check('a missing session in a structured SDK result also retries without losing saved messages', async () => {
      const previous = read(first).sessionId
      const count = logs().filter(item => item.type === 'spawn').length
      const messages = await win.locator('.msg-user').count()
      await send('[history-missing-result] Continue the design.')
      const spawned = logs().filter(item => item.type === 'spawn').slice(count)
      assert.equal(spawned.length, 2)
      assert.ok(spawned[0].argv.includes(`--resume=${previous}`))
      assert.equal(spawned[1].argv.some(arg => arg.startsWith('--resume=')), false)
      assert.equal(await win.locator('.msg-user').count(), messages + 1)
      assert.notEqual(read(first).sessionId, previous)
    })
    await check('an expired login session keeps the saved Claude session and reports the normal agent error', async () => {
      const session = read(first).sessionId
      const count = logs().filter(item => item.type === 'spawn').length
      const notices = await win.locator('.msg-notice').count()
      await send('[history-auth-error] Preserve this conversation.')
      assert.equal(logs().filter(item => item.type === 'spawn').length - count, 1)
      assert.equal(read(first).sessionId, session)
      assert.equal(await win.locator('.msg-notice').count(), notices)
      assert.match(await win.locator('.msg-error').last().innerText(), /Agent stopped: error_during_execution/)
    })
    await check('running turns save on debounce, block New, chat switches, and overlapping turns, and keep running in a background tab', async () => {
      const count = logs().filter(item => item.type === 'spawn').length
      await invoke('agent:send', { text: '[history-slow] Keep this turn in its chat.', model: 'sonnet' })
      await win.waitForSelector('.agent-presence')
      assert.equal(await win.locator('.chat-session').isDisabled(), true)
      assert.equal(await win.locator('.chat-new').isDisabled(), true)
      await invoke('chats:new')
      await invoke('chats:open', second)
      await invoke('project', 'switch', other)
      assert.equal((await invoke('init')).project.dir, other, 'tabs switch while the agent works')
      assert.equal((await invoke('init')).agentStatus, 'idle', 'the other tab has its own idle agent')
      await win.waitForFunction(dir => document.querySelector(`.tab.is-busy[title^="${dir}"]`), project)
      await invoke('project', 'switch', project)
      assert.equal((await invoke('init')).agentStatus, 'running')
      await invoke('agent:send', { text: 'This overlapping turn must not run.', model: '' })
      await win.waitForSelector('.presence-model')
      await win.waitForTimeout(300)
      assert.ok(read(first).events.some(event => event.type === 'user' && event.text.includes('[history-slow]')))
      assert.equal((await state()).current.id, first)
      assert.equal((await invoke('init')).project.dir, project)
      await idle()
      assert.equal(logs().filter(item => item.type === 'spawn').length - count, 1)
      assert.equal((await state()).current.events.some(event => event.type === 'user' && event.text.includes('overlapping')), false)
    })
    await check('Stop keeps the chat locked until the active SDK turn has settled', async () => {
      await invoke('agent:send', { text: '[history-slow] Stop this turn.', model: '' })
      await win.waitForSelector('.agent-presence')
      await win.getByRole('button', { name: 'Stop', exact: true }).click()
      await idle()
      assert.equal(await win.locator('.chat-new').isDisabled(), false)
      assert.equal((await state()).current.id, first)
      assert.ok(read(first).events.some(event => event.type === 'user' && event.text.includes('Stop this turn')))
    })
    await check('history skips corrupt, invalid, and mismatched files and groups chats by local calendar dates', async () => {
      writeFileSync(join(directory, 'corrupt.json'), '{broken')
      writeFileSync(join(directory, `${randomUUID()}.json`), JSON.stringify({ events: [] }))
      const today = new Date()
      today.setHours(12, 0, 0, 0)
      for (const [days, title] of [[1, 'Review the mobile onboarding.'], [4, 'Explore the library navigation.'], [14, 'Plan the first design direction.']]) {
        const date = new Date(today)
        date.setDate(date.getDate() - days)
        const chat = { id: randomUUID(), title, createdAt: date.getTime(), updatedAt: date.getTime(), events: [{ type: 'user', text: title }] }
        writeFileSync(join(directory, `${chat.id}.json`), JSON.stringify(chat))
      }
      writeFileSync(join(directory, `${randomUUID()}.json`), JSON.stringify(read(first)))
      await invoke('project', 'switch', other)
      await invoke('project', 'switch', project)
      assert.equal((await state()).chats.length, 5)
      await menu()
      for (const label of ['Today', 'Yesterday', 'Previous 7 days', 'Older']) assert.equal(await win.getByRole('group', { name: label, exact: true }).count(), 1)
      assert.equal(await win.locator('.chat-history-row.is-current').count(), 1)
      const current = win.locator('.chat-history-row.is-current .chat-history-open')
      assert.equal(await current.getAttribute('title'), 'Design a calm reading page.')
      await win.screenshot({ path: join(evidence, 'history-menu.png') })
      await win.keyboard.press('Escape')
    })
    await check('history menu closes on outside click, focus leaving it, and window blur', async () => {
      await menu()
      await win.locator('.chat textarea').click()
      assert.equal(await win.getByRole('menu').count(), 0)
      await menu()
      await win.locator('.chat textarea').focus()
      assert.equal(await win.getByRole('menu').count(), 0)
      await menu()
      await win.evaluate(() => window.dispatchEvent(new Event('blur')))
      assert.equal(await win.getByRole('menu').count(), 0)
      await menu()
      await win.keyboard.press('ArrowDown')
      assert.equal(await win.getByRole('menuitemradio').first().evaluate(node => node === document.activeElement), true)
      await win.keyboard.press('Escape')
    })
    await check('disk transcripts cap events and remove inline images, base64, and unknown payload fields', async () => {
      const chat = read(first)
      const data = `data:image/png;base64,${'a'.repeat(512)}`
      chat.events = Array.from({ length: 2000 }, (_, index) => ({ type: 'text', text: `Line ${index} ${data}`, image: { data } }))
      writeFileSync(join(directory, `${first}.json`), JSON.stringify(chat))
      await invoke('chats:open', first)
      assert.equal((await state()).current.events.length, 2000)
      await invoke('agent:send', { text: `Keep the image context ${data}`, model: 'sonnet' })
      await win.waitForSelector('.agent-presence')
      await idle()
      const saved = read(first)
      assert.equal(saved.events.length, 2000)
      const serialized = JSON.stringify(saved)
      assert.equal(/data:image|a{256}|"image"/.test(serialized), false, 'stored transcript contains an image payload')
      assert.match(serialized, /attachment omitted/)
    })
    await check('deleting one chat asks for confirmation and cancellation preserves its file', async () => {
      await confirm(0)
      await menu()
      await win.getByRole('menuitem', { name: 'Delete chat: Create a focused project dashboard.', exact: true }).click()
      await invoke('chats:list')
      assert.equal(existsSync(join(directory, `${second}.json`)), true)
      assert.equal((await state()).chats.length, 5)
      await confirm(1)
      await menu()
      await win.getByRole('menuitem', { name: 'Delete chat: Create a focused project dashboard.', exact: true }).click()
      await menu()
      await win.getByRole('menuitemradio', { name: 'Create a focused project dashboard.', exact: true }).waitFor({ state: 'detached' })
      await win.keyboard.press('Escape')
      assert.equal(existsSync(join(directory, `${second}.json`)), false)
      assert.equal((await state()).current.id, first)
      const confirmations = await instance.evaluate(() => globalThis.historyConfirmations)
      assert.equal(confirmations.length, 2)
      assert.equal(confirmations[0].cancelId, 0)
      assert.equal(confirmations[0].message, 'Delete this chat?')
    })
    await check('quit flushes a pending user message before its debounce or turn end', async () => {
      await win.locator('.chat-new').click()
      await invoke('agent:send', { text: '[history-slow] Save this message on quit.', model: '' })
      const id = (await state()).current.id
      await instance.close()
      instance = undefined
      assert.ok(read(id).events.some(event => event.type === 'user' && event.text.includes('Save this message on quit')))
      await start()
      assert.equal((await state()).current.id, id)
      assert.equal(await win.locator('.msg-user').innerText(), '[history-slow] Save this message on quit.')
    })
    await check('clear history confirms, cancels safely, removes corrupt files too, and keeps the other project', async () => {
      await confirm(0)
      const count = files().length
      await menu()
      await win.getByRole('menuitem', { name: 'Clear Agent History', exact: true }).click()
      await invoke('chats:list')
      assert.equal(files().length, count)
      await confirm(1)
      await menu()
      await win.getByRole('menuitem', { name: 'Clear Agent History', exact: true }).click()
      await win.waitForSelector('.agent-empty')
      assert.deepEqual(files(), [])
      assert.equal(await win.locator('.msg-user').count(), 0)
      assert.equal(await win.locator('.chat-session').innerText(), 'New chat')
      const confirmations = await instance.evaluate(() => globalThis.historyConfirmations)
      assert.equal(confirmations.at(-1).message, 'Clear Agent History?')
      await openProject(other)
      assert.equal((await state()).chats.length, 1)
      assert.equal(await win.locator('.msg-user').innerText(), 'Sketch a separate mobile project.')
      await instance.close()
      instance = undefined
      await start()
      assert.equal((await state()).chats.length, 0)
    })
    writeFileSync(join(evidence, 'environment.json'), JSON.stringify({ project, other, profile }, null, 2))
  } finally {
    await instance?.close()
  }
}
