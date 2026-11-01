import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { CONNECT_AGENTS, CONNECT_PROMPTS, connectAgentIdSchema, type AgentConnection, type ConnectAgentId, type ConnectAgentInfo, type ConnectionStatus } from '../../shared/connectAgents'
import { api } from './api'
import { Icon } from './icons'

const LAST_AGENT = 'chalk.connectAgent'

const STATUS_LABEL: Record<ConnectionStatus['kind'], string> = {
  connected: 'Connected',
  'old-address': 'Connected to an old address',
  'not-connected': 'Not connected',
  'not-installed': 'Not installed',
  blocked: 'Cannot add automatically',
  manual: ''
}

function CopyButton({ text, label, className = 'connect-copy', children }: { text: string; label: string; className?: string; children?: ReactNode }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1400)
    return () => clearTimeout(timer)
  }, [copied])
  return (
    <button className={className} aria-label={children ? undefined : label} title={copied ? 'Copied' : label} onClick={() => void api.copy(text).then(() => setCopied(true))}>
      <Icon name={copied ? 'check' : 'copy'} size={13} />
      {children}
    </button>
  )
}

function ManualSteps({ connection }: { connection: AgentConnection }) {
  return (
    <>
      {connection.manual.map((step) => (
        <div className="connect-snippet" key={step.label}>
          <p>{step.label}</p>
          <div className="code">
            <pre>
              <code>{step.text}</code>
            </pre>
            <CopyButton text={step.text} label={`Copy: ${step.label}`} />
          </div>
        </div>
      ))}
    </>
  )
}

function ConnectStep({ agent, connection, busy, onAdd }: { agent: ConnectAgentInfo; connection: AgentConnection | null; busy: boolean; onAdd: () => void }) {
  const status = connection?.status
  const [manualOpen, setManualOpen] = useState(false)
  const needsManual = status?.kind === 'not-installed' || status?.kind === 'blocked'
  useEffect(() => setManualOpen(needsManual), [needsManual])

  if (!connection || !status) return <p className="connect-checking">Checking {agent.name}…</p>
  if (status.kind === 'manual') {
    return (
      <div className="connect-manual-body">
        <p>Add Chalk as a Streamable HTTP MCP server in your agent’s settings.</p>
        <ManualSteps connection={connection} />
      </div>
    )
  }
  const action = status.kind === 'old-address' ? 'Update' : status.kind === 'connected' ? 'Added' : `Add to ${agent.name}`
  return (
    <>
      <div className="connect-install">
        <div className="connect-status" role="status">
          <span className={`connect-dot is-${status.kind}`} aria-hidden="true" />
          <div>
            <strong>{STATUS_LABEL[status.kind]}</strong>
            {'url' in status && <code>{status.url}</code>}
            {status.kind === 'not-installed' && <small>Install {agent.name}, or use the manual steps below.</small>}
            {status.kind === 'blocked' && <small>{status.reason} Use the manual steps below.</small>}
          </div>
        </div>
        {status.kind !== 'blocked' && (
          <button className="connect-add" disabled={busy || status.kind === 'connected' || status.kind === 'not-installed'} onClick={onAdd}>
            {status.kind === 'connected' && <Icon name="check" size={12} />}
            {busy ? 'Adding…' : action}
          </button>
        )}
      </div>
      {connection.message && (
        <p className={`connect-message is-${connection.message.tone}`} role={connection.message.tone === 'error' ? 'alert' : undefined}>
          {connection.message.text}
        </p>
      )}
      <div className="connect-manual">
        <button className="connect-manual-toggle" aria-expanded={manualOpen} onClick={() => setManualOpen(!manualOpen)}>
          Or, install manually
          <Icon name={manualOpen ? 'minus' : 'plus'} size={13} />
        </button>
        {manualOpen && (
          <div className="connect-manual-body">
            <ManualSteps connection={connection} />
          </div>
        )}
      </div>
    </>
  )
}

function ConnectDialog({ mcpUrl, onClose }: { mcpUrl: string; onClose: () => void }) {
  const [selected, setSelected] = useState<ConnectAgentId>(() => connectAgentIdSchema.catch('claude-code').parse(localStorage.getItem(LAST_AGENT)))
  const [loaded, setLoaded] = useState<{ id: ConnectAgentId; connection: AgentConnection } | null>(null)
  const [busy, setBusy] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  const agent = CONNECT_AGENTS.find((item) => item.id === selected)!
  const connection = loaded?.id === selected ? loaded.connection : null

  useEffect(() => {
    void api.browser('obscured', true)
    list.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus()
    const keydown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', keydown)
    return () => {
      document.removeEventListener('keydown', keydown)
      void api.browser('obscured', false)
    }
  }, [onClose])

  useEffect(() => {
    localStorage.setItem(LAST_AGENT, selected)
    let live = true
    const refresh = () =>
      void api.connectState(selected).then((next) => live && setLoaded((current) => ({ id: selected, connection: { ...next, message: current?.id === selected ? current.connection.message : null } })))
    refresh()
    window.addEventListener('focus', refresh)
    return () => {
      live = false
      window.removeEventListener('focus', refresh)
    }
  }, [selected])

  const choose = (id: ConnectAgentId) => {
    setSelected(id)
    list.current?.querySelector<HTMLButtonElement>(`[data-agent="${id}"]`)?.focus()
  }

  const add = async () => {
    setBusy(true)
    try {
      setLoaded({ id: selected, connection: await api.connectAgent(selected) })
    } catch (err) {
      setLoaded((current) => current && { id: current.id, connection: { ...current.connection, message: { tone: 'error', text: err instanceof Error ? err.message : String(err) } } })
    } finally {
      setBusy(false)
    }
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal connect-modal" role="dialog" aria-modal="true" aria-labelledby="connect-title">
        <h3 id="connect-title" className="connect-title">Connect your agent</h3>
        <div className="connect-body">
          <div className="connect-agents" role="tablist" aria-label="Agents" aria-orientation="vertical" ref={list}>
            {CONNECT_AGENTS.map((item, i) => (
              <button
                key={item.id}
                role="tab"
                data-agent={item.id}
                aria-selected={item.id === selected}
                tabIndex={item.id === selected ? 0 : -1}
                disabled={busy}
                onClick={() => choose(item.id)}
                onKeyDown={(e) => {
                  const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
                  if (!step) return
                  e.preventDefault()
                  choose(CONNECT_AGENTS[(i + step + CONNECT_AGENTS.length) % CONNECT_AGENTS.length].id)
                }}
              >
                <span className="connect-initials" aria-hidden="true">{item.initials}</span>
                {item.label}
              </button>
            ))}
          </div>
          <div className="connect-steps" role="tabpanel" aria-label={agent.label}>
            <section className="connect-step">
              <span className="connect-number is-done" aria-label="Done">
                <Icon name="check" size={12} />
              </span>
              <div>
                <h4>Chalk is running</h4>
                <div className="connect-url">
                  <code>{mcpUrl}</code>
                  <CopyButton text={mcpUrl} label="Copy MCP URL" />
                </div>
              </div>
            </section>
            <section className="connect-step">
              <span className="connect-number">2</span>
              <div>
                <h4>Connect to {agent.name}</h4>
                <ConnectStep key={agent.id} agent={agent} connection={connection} busy={busy} onAdd={() => void add()} />
              </div>
            </section>
            <section className="connect-step">
              <span className="connect-number">3</span>
              <div>
                <h4>Run your first prompt</h4>
                <p>Select a frame in Chalk, then run one of these in {agent.name}:</p>
                <div className="connect-prompts">
                  {CONNECT_PROMPTS.map((prompt) => (
                    <CopyButton key={prompt} text={prompt} label="Copy prompt" className="connect-prompt">
                      {prompt}
                    </CopyButton>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </div>
        <div className="modal-actions connect-footer">
          <button className="connect-learn" onClick={() => void api.connectLearnMore()}>
            Learn more
          </button>
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export function ConnectButton({ mcpUrl }: { mcpUrl: string }) {
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  return (
    <>
      <button className="connect-btn" aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <Icon name="plug" size={14} /> Connect agent
      </button>
      {open && <ConnectDialog mcpUrl={mcpUrl} onClose={close} />}
    </>
  )
}
