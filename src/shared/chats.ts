import { z } from 'zod'
import type { AgentEvent } from './model'

export const MAX_CHAT_EVENTS = 2000

export function chatText(text: string): string {
  return text.replace(/data:[^\s"'<>)]*/gi, '[attachment omitted]').replace(/[A-Za-z0-9+/]{256,}={0,2}/g, '[attachment omitted]').slice(0, 32000)
}

const text = z.string().transform(chatText)
export const agentEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('start'), model: text.nullable() }),
  z.object({ type: z.literal('model'), model: text }),
  z.object({ type: z.literal('user'), text }),
  z.object({ type: z.literal('text'), text }),
  z.object({ type: z.literal('tool'), name: text, summary: text }),
  z.object({ type: z.literal('error'), text }),
  z.object({ type: z.literal('notice'), text }),
  z.object({ type: z.literal('done'), costUsd: z.number().finite().nonnegative().optional(), durationMs: z.number().finite().nonnegative().optional() })
]) satisfies z.ZodType<AgentEvent>

export const chatIdSchema = z.uuid()
export const chatSchema = z.object({
  id: chatIdSchema,
  title: text.pipe(z.string().trim().min(1)),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  sessionId: z.uuid().optional(),
  model: text.optional(),
  events: z.array(agentEventSchema).max(MAX_CHAT_EVENTS)
})

export type Chat = z.infer<typeof chatSchema>
export type ChatSummary = Omit<Chat, 'events' | 'sessionId'>
export interface ChatHistoryState {
  current: Chat
  chats: ChatSummary[]
}
