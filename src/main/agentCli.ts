import { accessSync, constants } from 'node:fs'
import { execFile, execFileSync } from 'node:child_process'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

export type AgentCli = 'claude' | 'codex' | 'code' | 'opencode'

const KNOWN: Record<AgentCli, string[]> = {
  claude: [join(homedir(), '.local/bin/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude', join(homedir(), '.claude/local/claude')],
  codex: [join(homedir(), '.local/bin/codex'), '/opt/homebrew/bin/codex', '/usr/local/bin/codex'],
  code: ['/opt/homebrew/bin/code', '/usr/local/bin/code', '/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code', join(homedir(), 'Applications/Visual Studio Code.app/Contents/Resources/app/bin/code')],
  opencode: [join(homedir(), '.opencode/bin/opencode'), join(homedir(), '.local/bin/opencode'), '/opt/homebrew/bin/opencode', '/usr/local/bin/opencode']
}

let loginPath: string | undefined

/** A packaged app starts with a minimal PATH, so add the login shell's PATH once. */
export function userPath(): string {
  if (loginPath === undefined) {
    try {
      loginPath = execFileSync('/bin/zsh', ['-lc', 'print -r -- "$PATH"'], { encoding: 'utf8', timeout: 5000 }).trim()
    } catch {
      loginPath = ''
    }
  }
  return [process.env.PATH, loginPath, '/opt/homebrew/bin', '/usr/local/bin', join(homedir(), '.local/bin')].filter(Boolean).join(':')
}

function executable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

export function findCli(name: AgentCli): string | null {
  if (name === 'claude' && process.env.CHALK_CLAUDE_PATH) return process.env.CHALK_CLAUDE_PATH
  return KNOWN[name].find(executable) ?? userPath().split(':').filter(Boolean).map((dir) => join(dir, name)).find(executable) ?? null
}

export function runCli(file: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 30_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, PATH: userPath() } }, (error, stdout, stderr) => {
      if (!error) return resolve(stdout)
      const detail = error.killed ? 'it timed out' : (stderr || stdout).trim().split('\n').slice(-3).join(' ') || error.message
      reject(new Error(`\`${basename(file)} ${args.slice(0, 2).join(' ')}\` failed: ${detail.slice(0, 400)}`))
    })
  })
}
