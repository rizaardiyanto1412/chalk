import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { CONNECT_AGENTS, type AgentConnection, type ConnectAgentId, type ConnectionStatus, type ManualStep } from '../shared/connectAgents'
import { runCli, type AgentCli } from './agentCli'
import { readCodexChalk, TomlProblem, withCodexChalk } from './codexToml'

export interface ConfigLocations {
  home: string
  claude: string
  codex: string
  cursor: string
  vscode: string
  copilot: string
  opencode: string
  opencodeJsonc: string
  apps: string[]
}

export function configLocations(home: string, apps = [join(home, 'Applications'), '/Applications']): ConfigLocations {
  return {
    home,
    claude: join(home, '.claude.json'),
    codex: join(home, '.codex/config.toml'),
    cursor: join(home, '.cursor/mcp.json'),
    vscode: join(home, 'Library/Application Support/Code/User/mcp.json'),
    copilot: join(home, '.copilot/mcp-config.json'),
    opencode: join(home, '.config/opencode/opencode.json'),
    opencodeJsonc: join(home, '.config/opencode/opencode.jsonc'),
    apps
  }
}

export interface ConnectDeps {
  locations: ConfigLocations
  findCli: (name: AgentCli) => string | null
  openExternal: (url: string) => Promise<void>
}

interface Agent {
  detect(): boolean
  status(url: string): Promise<ConnectionStatus>
  /** Returns a note for the user when the agent still has to finish the job. */
  connect?(url: string): Promise<string | void>
  manual(url: string): ManualStep[]
}

type JsonObject = Record<string, unknown>

interface JsonConfig {
  file: string
  text: string | null
  value: JsonObject
  strict: boolean
}

const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)
const pretty = (value: unknown) => JSON.stringify(value, null, 2)

async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8')
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null
    throw error
  }
}

/** VS Code, Cursor, and OpenCode accept comments and trailing commas, so status reads must too. */
function parseJsonc(text: string): unknown {
  let out = ''
  let comma = -1
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '"') {
      let end = i + 1
      while (end < text.length && text[end] !== '"') end += text[end] === '\\' ? 2 : 1
      out += text.slice(i, end + 1)
      i = end
      comma = -1
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      if (end < 0) throw new SyntaxError('Unclosed comment')
      i = end + 1
    } else {
      if ((c === '}' || c === ']') && comma >= 0) out = out.slice(0, comma) + out.slice(comma + 1)
      if (c === ',') comma = out.length
      else if (!/\s/.test(c)) comma = -1
      out += c
    }
  }
  return JSON.parse(out)
}

export function createConnections(deps: ConnectDeps) {
  const loc = deps.locations
  const shown = (file: string) => (file.startsWith(loc.home + '/') ? `~${file.slice(loc.home.length)}` : file)
  const problem = (file: string, reason: string) => new Error(`Chalk cannot update ${shown(file)} because ${reason}.`)
  const hasApp = (name: string) => loc.apps.some((dir) => existsSync(join(dir, name)))

  const readJson = async (file: string): Promise<JsonConfig> => {
    const text = await readText(file)
    if (text === null || !text.trim()) return { file, text, value: {}, strict: true }
    let value: unknown
    let strict = true
    try {
      value = JSON.parse(text)
    } catch {
      strict = false
      try {
        value = parseJsonc(text)
      } catch (error) {
        throw problem(file, `it is not valid JSON (${error instanceof Error ? error.message : error})`)
      }
    }
    if (!isObject(value)) throw problem(file, 'it does not hold a JSON object')
    return { file, text, value, strict }
  }

  const servers = (config: JsonConfig, key: string): JsonObject => {
    const group = config.value[key] ?? {}
    if (!isObject(group)) throw problem(config.file, `its "${key}" value is not an object`)
    return group
  }

  const savedEntry = async (file: string, key: string) => servers(await readJson(file), key).chalk

  const urlStatus = (saved: string | null, url: string): ConnectionStatus => {
    if (saved === null) return { kind: 'not-connected' }
    return saved === url ? { kind: 'connected', url } : { kind: 'old-address', url: saved }
  }
  const entryStatus = (entry: unknown, url: string) => urlStatus(isObject(entry) && typeof entry.url === 'string' && entry.enabled !== false ? entry.url : null, url)

  const backup = async (file: string, text: string, mode: number) => {
    await writeFile(`${file}.chalk-backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(3).toString('hex')}`, text, { mode, flag: 'wx' })
  }

  const backupBeforeCli = async (file: string) => {
    const text = await readText(file)
    if (text !== null) await backup(file, text, (await stat(file)).mode & 0o777)
  }

  const replaceFile = async (file: string, before: string | null, after: string) => {
    if (after === before) return
    const target = before === null ? file : await realpath(file)
    await mkdir(dirname(target), { recursive: true })
    const mode = before === null ? 0o600 : (await stat(target)).mode & 0o777
    if (before !== null) await backup(file, before, mode)
    const temp = `${target}.chalk-${process.pid}-${Date.now()}.tmp`
    try {
      await writeFile(temp, after, { mode, flag: 'wx' })
      await rename(temp, target)
    } finally {
      await rm(temp, { force: true })
    }
  }

  const writeJsonEntry = async (file: string, key: string, entry: JsonObject) => {
    const config = await readJson(file)
    const group = servers(config, key)
    if (isDeepStrictEqual(group.chalk, entry)) return
    if (!config.strict) throw problem(file, 'it has comments or trailing commas that Chalk cannot keep')
    const indent = /^[ \t]+(?=")/m.exec(config.text ?? '')?.[0] ?? 2
    await replaceFile(file, config.text, JSON.stringify({ ...config.value, [key]: { ...group, chalk: entry } }, null, indent) + '\n')
  }

  const readCodex = async () => {
    const text = await readText(loc.codex)
    try {
      return { text, ...(text === null ? { url: null, exists: false } : readCodexChalk(text)) }
    } catch (error) {
      throw error instanceof TomlProblem ? problem(loc.codex, error.message) : error
    }
  }

  const opencodeEntry = async () => (await savedEntry(loc.opencodeJsonc, 'mcp')) ?? (await savedEntry(loc.opencode, 'mcp'))

  const agents: Record<ConnectAgentId, Agent> = {
    'claude-code': {
      detect: () => !!deps.findCli('claude'),
      status: async (url) => entryStatus(await savedEntry(loc.claude, 'mcpServers'), url),
      connect: async (url) => {
        const claude = deps.findCli('claude')
        if (!claude) throw new Error('Chalk could not find the `claude` command. Use the manual steps below.')
        const exists = (await savedEntry(loc.claude, 'mcpServers')) !== undefined
        await backupBeforeCli(loc.claude)
        if (exists) await runCli(claude, ['mcp', 'remove', '--scope', 'user', 'chalk'])
        await runCli(claude, ['mcp', 'add', '--scope', 'user', '--transport', 'http', 'chalk', url])
      },
      manual: (url) => [
        { label: 'Run this in Terminal', text: `claude mcp add --scope user --transport http chalk ${url}` },
        { label: 'If Chalk has an old address, run this first', text: 'claude mcp remove --scope user chalk' }
      ]
    },
    codex: {
      detect: () => !!deps.findCli('codex') || existsSync(dirname(loc.codex)),
      status: async (url) => urlStatus((await readCodex()).url, url),
      connect: async (url) => {
        const saved = await readCodex()
        const codex = deps.findCli('codex')
        const help = codex ? await runCli(codex, ['mcp', 'add', '--help']).catch(() => '') : ''
        if (codex && /--url\b/.test(help)) {
          await backupBeforeCli(loc.codex)
          if (saved.exists) await runCli(codex, ['mcp', 'remove', 'chalk'])
          await runCli(codex, ['mcp', 'add', 'chalk', '--url', url])
          return
        }
        let after: string
        try {
          after = withCodexChalk(saved.text ?? '', url)
        } catch (error) {
          throw error instanceof TomlProblem ? problem(loc.codex, error.message) : error
        }
        await replaceFile(loc.codex, saved.text, after)
      },
      manual: (url) => [
        { label: 'Run this in Terminal', text: `codex mcp add chalk --url ${url}` },
        { label: 'Or add this to ~/.codex/config.toml', text: `[mcp_servers.chalk]\nurl = ${JSON.stringify(url)}` }
      ]
    },
    cursor: {
      detect: () => existsSync(dirname(loc.cursor)) || hasApp('Cursor.app'),
      status: async (url) => entryStatus(await savedEntry(loc.cursor, 'mcpServers'), url),
      connect: (url) => writeJsonEntry(loc.cursor, 'mcpServers', { url }),
      manual: (url) => [{ label: 'Add this to ~/.cursor/mcp.json', text: pretty({ mcpServers: { chalk: { url } } }) }]
    },
    vscode: {
      detect: () => !!deps.findCli('code') || hasApp('Visual Studio Code.app'),
      status: async (url) => entryStatus((await savedEntry(loc.vscode, 'servers')) ?? (await savedEntry(loc.copilot, 'mcpServers')), url),
      connect: async (url) => {
        const server = JSON.stringify({ name: 'chalk', type: 'http', url })
        const code = deps.findCli('code')
        if (!code) {
          await deps.openExternal(`vscode:mcp/install?${encodeURIComponent(server)}`)
          return 'VS Code is opening. Click Install there, then come back to see the status.'
        }
        await backupBeforeCli(loc.vscode)
        await runCli(code, ['--add-mcp', server])
      },
      manual: (url) => [
        { label: 'Run this in Terminal', text: `code --add-mcp '${JSON.stringify({ name: 'chalk', type: 'http', url })}'` },
        { label: 'Or run “MCP: Open User Configuration” in VS Code and add', text: pretty({ servers: { chalk: { type: 'http', url } } }) }
      ]
    },
    opencode: {
      detect: () => !!deps.findCli('opencode') || existsSync(dirname(loc.opencode)),
      status: async (url) => entryStatus(await opencodeEntry(), url),
      connect: (url) => writeJsonEntry(existsSync(loc.opencodeJsonc) ? loc.opencodeJsonc : loc.opencode, 'mcp', { type: 'remote', url, enabled: true }),
      manual: (url) => [{ label: 'Add this to ~/.config/opencode/opencode.json', text: pretty({ mcp: { chalk: { type: 'remote', url, enabled: true } } }) }]
    },
    other: {
      detect: () => true,
      status: async () => ({ kind: 'manual' }),
      manual: (url) => [
        { label: 'MCP server URL (Streamable HTTP)', text: url },
        { label: 'Or add this to your agent’s MCP config', text: pretty({ mcpServers: { chalk: { type: 'http', url } } }) }
      ]
    }
  }

  const state = async (id: ConnectAgentId, url: string, message: AgentConnection['message'] = null): Promise<AgentConnection> => {
    const agent = agents[id]
    const manual = agent.manual(url)
    try {
      const status = await agent.status(url)
      return { status: status.kind === 'not-connected' && !agent.detect() ? { kind: 'not-installed' } : status, manual, message }
    } catch (error) {
      return { status: { kind: 'blocked', reason: error instanceof Error ? error.message : String(error) }, manual, message }
    }
  }

  const connectNow = async (id: ConnectAgentId, url: string): Promise<AgentConnection> => {
    const agent = agents[id]
    const before = await state(id, url)
    if (!agent.connect || (before.status.kind !== 'not-connected' && before.status.kind !== 'old-address')) return before
    const name = CONNECT_AGENTS.find((info) => info.id === id)!.name
    try {
      const note = await agent.connect(url)
      const after = await state(id, url)
      if (note) return { ...after, message: { tone: 'info', text: note } }
      if (after.status.kind === 'connected') return { ...after, message: { tone: 'info', text: `Added. If ${name} is open, start a new session to load Chalk.` } }
      return { ...after, message: { tone: 'error', text: `${name} did not save the address. Use the manual steps below.` } }
    } catch (error) {
      return state(id, url, { tone: 'error', text: error instanceof Error ? error.message : String(error) })
    }
  }

  let queue: Promise<unknown> = Promise.resolve()
  const connect = (id: ConnectAgentId, url: string): Promise<AgentConnection> => {
    const result = queue.then(() => connectNow(id, url))
    queue = result.catch(() => {})
    return result
  }

  return { state, connect }
}
