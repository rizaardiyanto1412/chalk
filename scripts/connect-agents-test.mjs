import { build } from 'vite'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chmodSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const outDir = join(root, 'out/connect-tests')
await build({ configFile: false, logLevel: 'error', build: { ssr: join(root, 'src/main/connectAgents.ts'), outDir, emptyOutDir: true, rollupOptions: { external: ['zod'], output: { entryFileNames: 'connectAgents.mjs' } } } })
const { configLocations, createConnections } = await import(pathToFileURL(join(outDir, 'connectAgents.mjs')).href)

const fakeCli = join(root, 'scripts/fixtures/fake-agent-cli.mjs')
chmodSync(fakeCli, 0o755)
const url = 'http://127.0.0.1:8160/mcp'
const nextUrl = 'http://127.0.0.1:8161/mcp'
const ALL_CLIS = ['claude', 'codex', 'code', 'opencode']

function fixture({ clis = ALL_CLIS, dirs = [] } = {}) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'chalk-connect-')))
  const bin = join(home, 'bin')
  mkdirSync(bin)
  for (const name of clis) symlinkSync(fakeCli, join(bin, name))
  for (const dir of dirs) mkdirSync(join(home, dir), { recursive: true })
  const log = join(home, 'cli.jsonl')
  process.env.CHALK_FAKE_AGENT_HOME = home
  process.env.CHALK_FAKE_AGENT_LOG = log
  delete process.env.CHALK_FAKE_AGENT_FAIL
  delete process.env.CHALK_FAKE_CODEX_OLD
  const opened = []
  const locations = configLocations(home, [join(home, 'Applications')])
  const service = createConnections({ locations, findCli: (name) => (clis.includes(name) ? join(bin, name) : null), openExternal: async (link) => void opened.push(link) })
  const write = (file, text) => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
  }
  const read = (file) => readFileSync(file, 'utf8')
  const calls = () => (existsSync(log) ? read(log).trim().split('\n').filter(Boolean).map((line) => { const { name, args } = JSON.parse(line); return [name, ...args] }) : [])
  const backups = (file) => readdirSync(dirname(file)).filter((entry) => entry.startsWith(`${basename(file)}.chalk-backup-`)).sort()
  const temps = (file) => readdirSync(dirname(file)).filter((entry) => entry.endsWith('.tmp'))
  return { home, locations, service, opened, write, read, calls, backups, temps }
}

async function lifecycle(f, id, file, seed, { chalkUrl, others }) {
  f.write(file, seed)
  assert.equal((await f.service.state(id, url)).status.kind, 'not-connected', 'starts not connected')
  const first = await f.service.connect(id, url)
  assert.deepEqual(first.status, { kind: 'connected', url }, 'connect reports Connected')
  assert.equal(first.message?.tone, 'info', 'connect shows a success note')
  assert.equal(chalkUrl(f.read(file)), url, 'config holds the Chalk URL')
  assert.equal(f.backups(file).length, 1, 'one backup before the first change')
  assert.equal(f.read(join(dirname(file), f.backups(file)[0])), seed, 'backup holds the original bytes')
  const connected = f.read(file)
  const cliCalls = f.calls().length
  assert.deepEqual((await f.service.connect(id, url)).status, { kind: 'connected', url }, 'second connect stays Connected')
  assert.equal(f.read(file), connected, 'second connect leaves the file byte-identical')
  assert.equal(f.backups(file).length, 1, 'second connect makes no backup')
  assert.equal(f.calls().length, cliCalls, 'second connect runs no CLI')
  assert.deepEqual((await f.service.state(id, nextUrl)).status, { kind: 'old-address', url }, 'a new port shows the old address')
  assert.deepEqual((await f.service.connect(id, nextUrl)).status, { kind: 'connected', url: nextUrl }, 'Update reports Connected')
  assert.equal(chalkUrl(f.read(file)), nextUrl, 'Update writes the new URL')
  assert.deepEqual(others(f.read(file)), others(seed), 'Update keeps every other key and server')
  assert.equal(f.backups(file).length, 2, 'Update backs up the connected config first')
  assert.deepEqual(f.temps(file), [], 'no temporary files left behind')
  return cliCalls
}

const jsonChalk = (key) => (text) => JSON.parse(text)[key]?.chalk?.url
const jsonOthers = (key) => (text) => {
  const config = JSON.parse(text)
  delete config[key].chalk
  return config
}

test('Claude Code connects through `claude mcp add`, and Update removes then adds', async () => {
  const f = fixture()
  const seed = JSON.stringify({ numStartups: 4, mcpServers: { other: { type: 'stdio', command: 'other-mcp', args: ['--keep'] } }, projects: { '/tmp/x': { allowedTools: [] } } }, null, 2)
  await lifecycle(f, 'claude-code', f.locations.claude, seed, { chalkUrl: jsonChalk('mcpServers'), others: jsonOthers('mcpServers') })
  assert.deepEqual(f.calls(), [
    ['claude', 'mcp', 'add', '--scope', 'user', '--transport', 'http', 'chalk', url],
    ['claude', 'mcp', 'remove', '--scope', 'user', 'chalk'],
    ['claude', 'mcp', 'add', '--scope', 'user', '--transport', 'http', 'chalk', nextUrl]
  ])
})

test('Codex connects through `codex mcp add --url` when the installed CLI supports it', async () => {
  const f = fixture()
  const seed = '# my settings\nmodel = "gpt-6" # keep\n\n[mcp_servers.other]\ncommand = "npx"\n'
  await lifecycle(f, 'codex', f.locations.codex, seed, {
    chalkUrl: (text) => /\[mcp_servers\.chalk\]\nurl = "([^"]+)"/.exec(text)?.[1],
    others: (text) => text.replace(/\n\[mcp_servers\.chalk\]\nurl = "[^"]+"\n/, '')
  })
  assert.deepEqual(f.calls(), [
    ['codex', 'mcp', 'add', '--help'],
    ['codex', 'mcp', 'add', 'chalk', '--url', url],
    ['codex', 'mcp', 'add', '--help'],
    ['codex', 'mcp', 'remove', 'chalk'],
    ['codex', 'mcp', 'add', 'chalk', '--url', nextUrl]
  ])
})

const codexSeed = `# Codex config
model = "gpt-6" # inline comment
instructions = """
[not a table]
"""

[mcp_servers.other]
command = "npx"
args = [
  "-y", # comment inside an array
  "[other]",
]

[profiles.fast]
model = "fast"
`

test('Codex without --url support merges [mcp_servers.chalk] into config.toml and keeps every comment', async () => {
  const f = fixture()
  process.env.CHALK_FAKE_CODEX_OLD = '1'
  await lifecycle(f, 'codex', f.locations.codex, codexSeed, {
    chalkUrl: (text) => /\[mcp_servers\.chalk\]\nurl = "([^"]+)"/.exec(text)?.[1],
    others: (text) => text.replace(/\n\[mcp_servers\.chalk\]\nurl = "[^"]+"\n$/, '')
  })
  assert.equal(f.read(f.locations.codex), `${codexSeed}\n[mcp_servers.chalk]\nurl = "${nextUrl}"\n`, 'only the Chalk table was added and updated')
  assert.deepEqual(f.calls(), [['codex', 'mcp', 'add', '--help'], ['codex', 'mcp', 'add', '--help']], 'the old CLI is only asked for help')
})

test('Codex without a CLI edits an existing Chalk table in place: URL, enabled flag, comments, and other keys', async () => {
  const f = fixture({ clis: [], dirs: ['.codex'] })
  const seed = "# top\r\n[mcp_servers.chalk] # Chalk server\r\nurl = 'http://127.0.0.1:7801/mcp' # old port\r\nenabled = false # paused\r\nstartup_timeout_sec = 20\r\n\r\n[mcp_servers.other]\r\nurl = \"http://other.test/mcp\"\r\n"
  f.write(f.locations.codex, seed)
  assert.equal((await f.service.state('codex', url)).status.kind, 'not-connected', 'a disabled entry is not connected')
  assert.deepEqual((await f.service.connect('codex', url)).status, { kind: 'connected', url })
  assert.equal(f.read(f.locations.codex), seed.replace("'http://127.0.0.1:7801/mcp'", `"${url}"`).replace('enabled = false', 'enabled = true'))
  assert.deepEqual(f.calls(), [])
})

test('Codex refuses TOML layouts it cannot edit and leaves them byte-identical', async () => {
  for (const seed of ['[mcp_servers.chalk]\nurl = "http://a/mcp"\n[mcp_servers.chalk]\nurl = "http://b/mcp"\n', '[mcp_servers]\nchalk = { url = "http://old/mcp" }\n', 'mcp_servers = { other = { url = "http://other/mcp" } }\n', '[mcp_servers.chalk]\ncommand = "chalk-mcp"\n']) {
    const f = fixture({ clis: [], dirs: ['.codex'] })
    f.write(f.locations.codex, seed)
    const result = await f.service.connect('codex', url)
    assert.ok(result.status.kind === 'blocked' || result.message?.tone === 'error', `refused: ${seed}`)
    assert.match(result.status.reason ?? result.message.text, /Chalk cannot update ~\/\.codex\/config\.toml because/)
    assert.equal(f.read(f.locations.codex), seed, 'file is byte-identical')
    assert.deepEqual(f.backups(f.locations.codex), [], 'no backup for a refused change')
  }
})

test('Cursor merges mcpServers.chalk into mcp.json, keeping indentation and other servers', async () => {
  const f = fixture({ dirs: ['.cursor'] })
  const seed = JSON.stringify({ mcpServers: { other: { url: 'http://other.test/mcp', headers: { 'X-Key': 'keep' } } }, theme: 'keep' }, null, 4) + '\n'
  await lifecycle(f, 'cursor', f.locations.cursor, seed, { chalkUrl: jsonChalk('mcpServers'), others: jsonOthers('mcpServers') })
  assert.equal(f.read(f.locations.cursor), JSON.stringify({ mcpServers: { other: { url: 'http://other.test/mcp', headers: { 'X-Key': 'keep' } }, chalk: { url: nextUrl } }, theme: 'keep' }, null, 4) + '\n')
  assert.deepEqual(f.calls(), [])
})

test('Cursor creates mcp.json when it is missing', async () => {
  const f = fixture({ dirs: ['.cursor'] })
  assert.deepEqual((await f.service.connect('cursor', url)).status, { kind: 'connected', url })
  assert.deepEqual(JSON.parse(f.read(f.locations.cursor)), { mcpServers: { chalk: { url } } })
  assert.equal(lstatSync(f.locations.cursor).mode & 0o777, 0o600)
  assert.deepEqual(f.backups(f.locations.cursor), [], 'nothing to back up')
})

test('Cursor writes through a symlinked mcp.json and keeps the link', async () => {
  const f = fixture({ dirs: ['.cursor', 'dotfiles'] })
  const real = join(f.home, 'dotfiles/mcp.json')
  f.write(real, '{"mcpServers":{}}')
  symlinkSync(real, f.locations.cursor)
  await f.service.connect('cursor', url)
  assert.ok(lstatSync(f.locations.cursor).isSymbolicLink(), 'link kept')
  assert.equal(JSON.parse(f.read(real)).mcpServers.chalk.url, url)
})

test('VS Code connects through `code --add-mcp`', async () => {
  const f = fixture()
  const seed = JSON.stringify({ servers: { other: { type: 'stdio', command: 'other-mcp' } }, inputs: [] }, null, '\t')
  await lifecycle(f, 'vscode', f.locations.vscode, seed, { chalkUrl: jsonChalk('servers'), others: jsonOthers('servers') })
  assert.deepEqual(f.calls(), [url, nextUrl].map((value) => ['code', '--add-mcp', JSON.stringify({ name: 'chalk', type: 'http', url: value })]))
})

test('VS Code without the code CLI opens the vscode:mcp/install link', async () => {
  const f = fixture({ clis: [], dirs: ['Applications/Visual Studio Code.app'] })
  assert.equal((await f.service.state('vscode', url)).status.kind, 'not-connected')
  const result = await f.service.connect('vscode', url)
  assert.equal(result.message.tone, 'info')
  assert.deepEqual(f.opened, [`vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: 'chalk', type: 'http', url }))}`])
  f.write(f.locations.copilot, JSON.stringify({ mcpServers: { chalk: { type: 'http', url } } }))
  assert.deepEqual((await f.service.state('vscode', url)).status, { kind: 'connected', url }, 'reads the global Copilot config too')
})

test('OpenCode merges a remote mcp.chalk entry into opencode.json', async () => {
  const f = fixture()
  const seed = JSON.stringify({ $schema: 'https://opencode.ai/config.json', mcp: { other: { type: 'local', command: ['other'] } }, provider: {} }, null, 2) + '\n'
  await lifecycle(f, 'opencode', f.locations.opencode, seed, { chalkUrl: jsonChalk('mcp'), others: jsonOthers('mcp') })
  assert.deepEqual(JSON.parse(f.read(f.locations.opencode)).mcp.chalk, { type: 'remote', url: nextUrl, enabled: true })
  assert.deepEqual(f.calls(), [])
})

test('OpenCode reads JSONC but refuses to rewrite comments it cannot keep', async () => {
  const f = fixture()
  const seed = '{\n  // my servers\n  "mcp": {\n    "chalk": { "type": "remote", "url": "http://127.0.0.1:7801/mcp", "enabled": true, },\n  },\n}\n'
  f.write(f.locations.opencodeJsonc, seed)
  assert.deepEqual((await f.service.state('opencode', url)).status, { kind: 'old-address', url: 'http://127.0.0.1:7801/mcp' })
  const result = await f.service.connect('opencode', url)
  assert.match(result.message.text, /opencode\.jsonc because it has comments or trailing commas/)
  assert.equal(f.read(f.locations.opencodeJsonc), seed)
  assert.deepEqual(f.backups(f.locations.opencodeJsonc), [])
})

const broken = [
  ['claude-code', 'claude', '{ "mcpServers": { '],
  ['codex', 'codex', 'model = "gpt-6\n[mcp_servers.other'],
  ['cursor', 'cursor', '{ mcpServers: nope }'],
  ['vscode', 'vscode', '{ "servers": [ }'],
  ['opencode', 'opencode', '{ "mcp": "x" '],
  ['cursor', 'cursor', '{ "mcpServers": ["not", "an", "object"] }']
]
for (const [id, key, seed] of broken) {
  test(`${id} refuses an unparsable config, shows the reason, and leaves it byte-identical: ${JSON.stringify(seed)}`, async () => {
    const f = fixture({ dirs: ['.cursor', '.codex'] })
    const file = f.locations[key]
    f.write(file, seed)
    const before = await f.service.state(id, url)
    assert.equal(before.status.kind, 'blocked')
    assert.match(before.status.reason, /^Chalk cannot update ~\/.+ because /)
    assert.ok(before.manual.some((step) => step.text.includes(url)), 'manual steps still show')
    const after = await f.service.connect(id, url)
    assert.equal(after.status.kind, 'blocked')
    assert.equal(f.read(file), seed, 'file is byte-identical')
    assert.deepEqual(f.backups(file), [], 'no backup')
    assert.deepEqual(f.calls(), [], 'no CLI ran')
  })
}

test('A failing CLI shows its error and changes nothing', async () => {
  const f = fixture()
  const seed = JSON.stringify({ mcpServers: { chalk: { type: 'http', url: 'http://127.0.0.1:7801/mcp' } } })
  f.write(f.locations.claude, seed)
  process.env.CHALK_FAKE_AGENT_FAIL = 'claude'
  const result = await f.service.connect('claude-code', url)
  assert.equal(result.status.kind, 'old-address')
  assert.match(result.message.text, /`claude mcp remove` failed: claude: simulated failure/)
  assert.equal(f.read(f.locations.claude), seed)
})

test('Concurrent connects converge on one entry and one backup', async () => {
  const f = fixture({ dirs: ['.cursor'] })
  f.write(f.locations.cursor, '{"mcpServers":{"other":{"url":"http://other.test/mcp"}}}')
  const results = await Promise.all([1, 2, 3].map(() => f.service.connect('cursor', url)))
  assert.ok(results.every((result) => result.status.kind === 'connected'))
  assert.deepEqual(Object.keys(JSON.parse(f.read(f.locations.cursor)).mcpServers), ['other', 'chalk'])
  assert.equal(f.backups(f.locations.cursor).length, 1)
})

test('Agents that are not installed show Not installed, keep manual steps, and never write', async () => {
  const f = fixture({ clis: [] })
  for (const id of ['claude-code', 'codex', 'cursor', 'vscode', 'opencode']) {
    const result = await f.service.connect(id, url)
    assert.equal(result.status.kind, 'not-installed', id)
    assert.ok(result.manual.some((step) => step.text.includes(url)), `${id} manual steps include the URL`)
  }
  assert.deepEqual(readdirSync(f.home).sort(), ['bin'])
})

test('Other agents get the URL and a generic JSON snippet, with nothing to connect', async () => {
  const f = fixture()
  const result = await f.service.connect('other', url)
  assert.deepEqual(result.status, { kind: 'manual' })
  assert.equal(result.manual[0].text, url)
  assert.deepEqual(JSON.parse(result.manual[1].text), { mcpServers: { chalk: { type: 'http', url } } })
  assert.deepEqual(f.calls(), [])
})
