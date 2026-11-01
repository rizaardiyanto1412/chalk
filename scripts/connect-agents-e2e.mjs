import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** The app's isolated agent home is `<profile>/agent-home`; only the fake CLIs in agent-bin exist for it. */
export function prepareConnectAgents({ root, profile, artifacts }) {
  const home = join(profile, 'agent-home')
  const bin = join(profile, 'agent-bin')
  const fake = join(root, 'scripts/fixtures/fake-agent-cli.mjs')
  chmodSync(fake, 0o755)
  mkdirSync(bin, { recursive: true })
  mkdirSync(join(home, '.cursor'), { recursive: true })
  for (const name of ['claude', 'codex', 'code']) symlinkSync(fake, join(bin, name))
  writeFileSync(join(home, '.claude.json'), JSON.stringify({ mcpServers: { other: { type: 'stdio', command: 'other-mcp' } } }, null, 2))
  const log = join(artifacts, 'fake-agent-cli.jsonl')
  writeFileSync(log, '')
  return { home, log, env: { CHALK_CONNECT_BIN: bin, CHALK_FAKE_AGENT_HOME: home, CHALK_FAKE_AGENT_LOG: log } }
}

export async function checkConnectAgents({ app, win, check, artifacts, port, agents }) {
  const url = `http://127.0.0.1:${port}/mcp`
  const dialog = win.getByRole('dialog', { name: 'Connect your agent' })
  const tab = (name) => dialog.getByRole('tab', { name, exact: true })
  const status = () => dialog.locator('.connect-status').innerText()
  const clipboard = () => app.evaluate(({ clipboard }) => clipboard.readText())
  const open = async () => {
    await win.getByRole('button', { name: 'Connect agent', exact: true }).click()
    await dialog.waitFor()
  }

  await check('Connect agent opens the dialog with Claude Code selected and the current MCP URL', async () => {
    await open()
    assert.equal(await tab('Claude Code').getAttribute('aria-selected'), 'true')
    assert.deepEqual(await dialog.locator('.connect-step h4').allInnerTexts(), ['Chalk is running', 'Connect to Claude Code', 'Run your first prompt'])
    assert.equal(await dialog.locator('.connect-url code').innerText(), url)
    await dialog.getByRole('button', { name: 'Add to Claude Code', exact: true }).waitFor()
    assert.equal(await status(), 'Not connected')
    assert.equal(await dialog.locator('.connect-prompt').count(), 3)
    await win.screenshot({ path: join(artifacts, 'connect-claude-code.png') })
  })

  await check('Add to Claude Code runs `claude mcp add` and shows Connected with the URL', async () => {
    await dialog.getByRole('button', { name: 'Add to Claude Code', exact: true }).click()
    await dialog.locator('.connect-dot.is-connected').waitFor()
    assert.equal(await status(), `Connected\n${url}`)
    assert.deepEqual(readFileSync(agents.log, 'utf8').trim().split('\n').map((line) => JSON.parse(line)), [{ name: 'claude', args: ['mcp', 'add', '--scope', 'user', '--transport', 'http', 'chalk', url] }])
    assert.deepEqual(JSON.parse(readFileSync(join(agents.home, '.claude.json'), 'utf8')).mcpServers, { other: { type: 'stdio', command: 'other-mcp' }, chalk: { type: 'http', url } })
    await win.screenshot({ path: join(artifacts, 'connect-claude-code-connected.png') })
  })

  await check("Switching agents shows each agent's steps and status", async () => {
    for (const [label, name, expected] of [['Codex', 'Codex', 'Not connected'], ['Cursor', 'Cursor', 'Not connected'], ['VS Code (GitHub Copilot)', 'VS Code', 'Not connected'], ['OpenCode', 'OpenCode', 'Not installed']]) {
      await tab(label).click()
      assert.equal(await tab(label).getAttribute('aria-selected'), 'true')
      await dialog.getByRole('heading', { name: `Connect to ${name}`, exact: true }).waitFor()
      await dialog.getByRole('button', { name: `Add to ${name}`, exact: true }).waitFor()
      assert.match(await status(), new RegExp(`^${expected}`))
    }
    assert.ok(await dialog.getByText('Add this to ~/.config/opencode/opencode.json').isVisible(), 'Not installed opens the manual steps')
    await tab('Other agents').click()
    await dialog.getByText('MCP server URL (Streamable HTTP)').waitFor()
    assert.equal(await dialog.locator('.connect-add').count(), 0)
    assert.equal(await dialog.locator('.connect-snippet code').first().innerText(), url)
  })

  await check('Or, install manually expands, and Copy puts the snippet and prompts on the clipboard', async () => {
    await tab('Cursor').click()
    await dialog.getByRole('button', { name: 'Add to Cursor', exact: true }).waitFor()
    const toggle = dialog.getByRole('button', { name: 'Or, install manually', exact: true })
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
    await toggle.click()
    assert.equal(await toggle.getAttribute('aria-expanded'), 'true')
    const snippet = await dialog.locator('.connect-snippet code').innerText()
    assert.deepEqual(JSON.parse(snippet), { mcpServers: { chalk: { url } } })
    await dialog.getByRole('button', { name: 'Copy: Add this to ~/.cursor/mcp.json', exact: true }).click()
    assert.equal(await clipboard(), snippet)
    await win.screenshot({ path: join(artifacts, 'connect-cursor-manual.png') })
    await dialog.getByRole('button', { name: 'Read my Chalk canvas and list the frames', exact: true }).click()
    assert.equal(await clipboard(), 'Read my Chalk canvas and list the frames')
  })

  await check('Done closes the dialog, and the dialog reopens on the last agent after a reload', async () => {
    await dialog.getByRole('button', { name: 'Done', exact: true }).click()
    assert.equal(await dialog.count(), 0)
    await open()
    assert.equal(await tab('Cursor').getAttribute('aria-selected'), 'true')
    await win.keyboard.press('Escape')
    assert.equal(await dialog.count(), 0)
    await win.reload()
    await win.waitForSelector('.titlebar')
    await open()
    assert.equal(await tab('Cursor').getAttribute('aria-selected'), 'true')
    await dialog.getByRole('button', { name: 'Done', exact: true }).click()
  })

  await check('Connect IPC rejects unknown agent ids', async () => {
    const result = await win.evaluate(() => window.chalk.invoke('connect:add', '../codex').then(() => 'accepted', () => 'rejected'))
    assert.equal(result, 'rejected')
  })
}

export async function checkConnectBrowserOverlay({ app, win, check }) {
  await check('The native browser hides under the Connect dialog and returns after Done', async () => {
    const visible = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].contentView.children.some((view) => view.getVisible()))
    const until = async (want, message) => {
      for (let i = 0; i < 40 && (await visible()) !== want; i++) await win.waitForTimeout(50)
      assert.equal(await visible(), want, message)
    }
    await until(true, 'browser page is showing')
    await win.getByRole('button', { name: 'Connect agent', exact: true }).click()
    const dialog = win.getByRole('dialog', { name: 'Connect your agent' })
    await dialog.waitFor()
    await until(false, 'dialog hides the browser view')
    await win.evaluate(() => window.chalk.invoke('browser', 'visible', true))
    assert.equal(await visible(), false, 'a re-show request does not lift the browser above the dialog')
    await dialog.getByRole('button', { name: 'Done', exact: true }).click()
    await until(true, 'Done shows the browser view again')
  })
}
