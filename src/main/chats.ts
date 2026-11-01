import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { agentEventSchema, chatSchema, chatText, MAX_CHAT_EVENTS, type Chat, type ChatHistoryState, type ChatSummary } from '../shared/chats'
import type { AgentEvent } from '../shared/model'

const emptyChat = (): Chat => ({ id: randomUUID(), title: 'New chat', createdAt: Date.now(), updatedAt: Date.now(), events: [] })

export class ChatHistory {
  current = emptyChat()
  private dir = ''
  private chats = new Map<string, ChatSummary>()
  private saveTimer: NodeJS.Timeout | null = null

  constructor(private readonly changed: (state: ChatHistoryState) => void) {}

  state(): ChatHistoryState {
    return { current: this.current, chats: [...this.chats.values()].sort((a, b) => b.updatedAt - a.updatedAt) }
  }

  openProject(project: string): void {
    this.flush()
    this.dir = join(project, '.chalk', 'chats')
    this.chats.clear()
    const loaded: Chat[] = []
    try {
      for (const entry of readdirSync(this.dir, { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.json')) continue
        const chat = this.read(entry.name)
        if (chat) loaded.push(chat)
      }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) console.error('Chat history could not be read', error)
    }
    loaded.sort((a, b) => b.updatedAt - a.updatedAt)
    for (const chat of loaded) this.remember(chat)
    this.current = loaded[0] ?? emptyChat()
    this.changed(this.state())
  }

  open(id: string): void {
    if (!this.chats.has(id)) return
    this.flush()
    const chat = this.read(`${id}.json`)
    if (!chat) this.chats.delete(id)
    else this.current = chat
    this.changed(this.state())
  }

  new(): void {
    this.flush()
    this.current = emptyChat()
    this.changed(this.state())
  }

  append(event: AgentEvent): void {
    const clean = agentEventSchema.parse(event)
    const firstMessage = clean.type === 'user' && !this.chats.has(this.current.id)
    this.current = {
      ...this.current,
      title: firstMessage ? chatText(clean.text.trim()) || 'New chat' : this.current.title,
      updatedAt: Date.now(),
      model: clean.type === 'start' ? clean.model ?? undefined : this.current.model,
      events: [...this.current.events, clean].slice(-MAX_CHAT_EVENTS)
    }
    if (firstMessage || this.chats.has(this.current.id)) {
      this.remember(this.current)
      this.scheduleSave()
    }
    this.changed(this.state())
    if (clean.type === 'done') this.flush()
  }

  setSession(sessionId: string | undefined): void {
    this.current = { ...this.current, sessionId }
    if (this.chats.has(this.current.id)) this.scheduleSave()
  }

  delete(id: string): void {
    this.flush()
    unlinkSync(join(this.dir, `${id}.json`))
    this.chats.delete(id)
    if (this.current.id === id) {
      const latest = this.state().chats[0]
      this.current = latest ? this.read(`${latest.id}.json`) ?? emptyChat() : emptyChat()
    }
    this.changed(this.state())
  }

  clear(): void {
    this.flush()
    for (const entry of readdirSync(this.dir, { withFileTypes: true })) {
      if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.json.tmp'))) unlinkSync(join(this.dir, entry.name))
    }
    this.chats.clear()
    this.current = emptyChat()
    this.changed(this.state())
  }

  flush(): void {
    if (!this.saveTimer) return
    clearTimeout(this.saveTimer)
    this.saveTimer = null
    try {
      mkdirSync(this.dir, { recursive: true })
      const file = join(this.dir, `${this.current.id}.json`)
      writeFileSync(`${file}.tmp`, JSON.stringify(this.current))
      renameSync(`${file}.tmp`, file)
    } catch (error) {
      console.error('Chat history could not be saved', error)
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flush(), 250)
  }

  private remember(chat: Chat): void {
    const { events: _events, sessionId: _sessionId, ...summary } = chat
    this.chats.set(chat.id, summary)
  }

  private read(name: string): Chat | null {
    try {
      const parsed = chatSchema.safeParse(JSON.parse(readFileSync(join(this.dir, name), 'utf8')))
      return parsed.success && name === `${parsed.data.id}.json` ? parsed.data : null
    } catch {
      return null
    }
  }
}
