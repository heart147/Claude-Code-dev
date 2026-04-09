import { z } from 'zod/v4'
import {
  getPendingBuddySoulRefinement,
  getSessionId,
  setPendingBuddySoulRefinement,
} from '../bootstrap/state.js'
import { saveGlobalConfig } from '../utils/config.js'
import { safeParseJSON } from '../utils/json.js'
import { registerPostSamplingHook } from '../utils/hooks/postSamplingHooks.js'
import type { AssistantMessage } from '../types/message.js'

const buddySoulSchema = z.object({
  name: z.string().min(1).max(80),
  personality: z.string().min(1).max(240),
})

function getAssistantText(message: AssistantMessage): string | null {
  const content = message.message?.content
  if (!Array.isArray(content)) {
    return null
  }

  const textBlock = content.find(
    (block): block is { type: 'text'; text: string } =>
      typeof block === 'object' &&
      block !== null &&
      'type' in block &&
      block.type === 'text' &&
      'text' in block &&
      typeof block.text === 'string',
  )

  return textBlock?.text?.trim() ?? null
}

registerPostSamplingHook(context => {
  const pending = getPendingBuddySoulRefinement()
  if (!pending || pending.sessionId !== getSessionId()) {
    return
  }

  const triggerIndex = context.messages.findIndex(
    message => message.uuid === pending.triggerMetaMessageUuid,
  )

  if (triggerIndex === -1) {
    return
  }

  const targetAssistant = context.messages
    .slice(triggerIndex + 1)
    .find((message): message is AssistantMessage => message.type === 'assistant')

  if (!targetAssistant) {
    return
  }

  const text = getAssistantText(targetAssistant)
  const parsed = safeParseJSON(text, false)
  const result = buddySoulSchema.safeParse(parsed)

  setPendingBuddySoulRefinement(null)

  if (!result.success) {
    return
  }

  saveGlobalConfig(current => {
    if (!current.companion) {
      return current
    }
    if (
      current.companion.name === result.data.name &&
      current.companion.personality === result.data.personality
    ) {
      return current
    }
    return {
      ...current,
      companion: {
        ...current.companion,
        name: result.data.name,
        personality: result.data.personality,
      },
    }
  })
})
