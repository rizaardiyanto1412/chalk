import { z } from 'zod'

export const connectAgentIdSchema = z.enum(['claude-code', 'codex', 'cursor', 'vscode', 'opencode', 'other'])
export type ConnectAgentId = z.infer<typeof connectAgentIdSchema>

export interface ConnectAgentInfo {
  id: ConnectAgentId
  label: string
  name: string
  initials: string
}

export const CONNECT_AGENTS: ConnectAgentInfo[] = [
  { id: 'claude-code', label: 'Claude Code', name: 'Claude Code', initials: 'CC' },
  { id: 'codex', label: 'Codex', name: 'Codex', initials: 'CX' },
  { id: 'cursor', label: 'Cursor', name: 'Cursor', initials: 'CU' },
  { id: 'vscode', label: 'VS Code (GitHub Copilot)', name: 'VS Code', initials: 'VS' },
  { id: 'opencode', label: 'OpenCode', name: 'OpenCode', initials: 'OC' },
  { id: 'other', label: 'Other agents', name: 'your agent', initials: '•••' }
]

export type ConnectionStatus =
  | { kind: 'connected'; url: string }
  | { kind: 'old-address'; url: string }
  | { kind: 'not-connected' }
  | { kind: 'not-installed' }
  | { kind: 'blocked'; reason: string }
  | { kind: 'manual' }

export interface ManualStep {
  label: string
  text: string
}

export interface AgentConnection {
  status: ConnectionStatus
  manual: ManualStep[]
  message: { tone: 'info' | 'error'; text: string } | null
}

export const CONNECT_PROMPTS = [
  'Build the selected Chalk frame as a React component',
  'Read my Chalk canvas and list the frames',
  "Recreate the selected Chalk frame in this project's styles"
]

export const CONNECT_LEARN_URL = 'https://github.com/rizaardiyanto1412/chalk#use-your-designs-from-claude-code'
