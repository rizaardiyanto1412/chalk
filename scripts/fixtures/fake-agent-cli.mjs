#!/usr/bin/env node
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

const home = process.env.CHALK_FAKE_AGENT_HOME
const name = basename(process.argv[1])
const args = process.argv.slice(2)
if (!home) {
  console.error('fake agent CLI refuses to run without CHALK_FAKE_AGENT_HOME')
  process.exit(3)
}
if (process.env.CHALK_FAKE_AGENT_LOG) appendFileSync(process.env.CHALK_FAKE_AGENT_LOG, JSON.stringify({ name, args }) + '\n')
const fail = (message) => {
  console.error(message)
  process.exit(1)
}
const isHelp = args.includes('--help')
if (process.env.CHALK_FAKE_AGENT_FAIL === name && !isHelp) fail(`${name}: simulated failure`)
const text = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : '')
const save = (file, value) => {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, value)
}

if (name === 'claude') {
  const file = join(home, '.claude.json')
  const config = JSON.parse(text(file) || '{}')
  config.mcpServers ??= {}
  if (args[1] === 'add') {
    if (config.mcpServers.chalk) fail('MCP server chalk already exists in user config')
    config.mcpServers.chalk = { type: 'http', url: args.at(-1) }
  } else if (args[1] === 'remove') {
    if (!config.mcpServers.chalk) fail('No user-scoped MCP server found with name: chalk')
    delete config.mcpServers.chalk
  } else fail(`unexpected claude args ${args.join(' ')}`)
  save(file, JSON.stringify(config, null, 2))
} else if (name === 'codex') {
  const file = join(home, '.codex/config.toml')
  const table = /(?:^|\n)\[mcp_servers\.chalk\][^\n]*\n(?:(?!\[)[^\n]*\n?)*/
  if (isHelp) console.log(process.env.CHALK_FAKE_CODEX_OLD ? 'Usage: codex mcp add <NAME> -- <COMMAND>...' : 'Usage: codex mcp add [OPTIONS] <NAME> (--url <URL> | -- <COMMAND>...)\n      --url <URL>  URL for a streamable HTTP MCP server')
  else if (args[1] === 'add') {
    if (table.test(text(file))) fail('MCP server chalk already exists')
    save(file, `${text(file)}\n[mcp_servers.chalk]\nurl = ${JSON.stringify(args.at(-1))}\n`)
  } else if (args[1] === 'remove') save(file, text(file).replace(table, ''))
  else fail(`unexpected codex args ${args.join(' ')}`)
} else if (name === 'code') {
  if (args[0] !== '--add-mcp') fail(`unexpected code args ${args.join(' ')}`)
  const file = join(home, 'Library/Application Support/Code/User/mcp.json')
  const config = JSON.parse(text(file) || '{}')
  const { name: server, ...entry } = JSON.parse(args[1])
  config.servers = { ...config.servers, [server]: entry }
  save(file, JSON.stringify(config, null, '\t'))
} else fail(`unexpected CLI ${name}`)
