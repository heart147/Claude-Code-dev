import * as React from 'react'
import { Text } from 'ink'
import { randomUUID } from 'crypto'
import {
  getSessionId,
  setPendingBuddySoulRefinement,
} from '../../bootstrap/state.js'
import type { LocalJSXCommandCall } from '../../types/command.js'
import {
  getCompanion,
  type Roll,
  roll,
  companionUserId,
} from '../../buddy/companion.js'
import { RARITY_COLORS, RARITY_STARS, STAT_NAMES } from '../../buddy/types.js'
import {
  getGlobalConfig,
  saveGlobalConfig,
  type GlobalConfig,
} from '../../utils/config.js'
import type { AppState } from '../../state/AppStateStore.js'

const PERSONALITY_TRAITS = [
  'curious and gentle',
  'chaotic but lovable',
  'quietly observant',
  'dramatically brave',
  'snarky in a friendly way',
  'patient and thoughtful',
] as const

function getBuddyRoll(): Roll {
  return roll(companionUserId())
}

function formatStats(stats: Record<(typeof STAT_NAMES)[number], number>): string {
  return STAT_NAMES.map(name => `${name}:${stats[name]}`).join('  ')
}

function toTitleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function buildGeneratedSoul(): { name: string; personality: string } {
  const { bones, inspirationSeed } = getBuddyRoll()
  const trait = PERSONALITY_TRAITS[inspirationSeed % PERSONALITY_TRAITS.length]!
  const suffix = String(inspirationSeed % 1000).padStart(3, '0')
  return {
    name: `${toTitleCase(bones.species)}-${suffix}`,
    personality: `${toTitleCase(bones.species)} is ${trait}.`,
  }
}

function buildStatusText(): string {
  const companion = getCompanion()
  const currentConfig = getGlobalConfig()

  if (!companion) {
    const fallbackRoll = getBuddyRoll()
    return [
      'Buddy is not hatched yet.',
      `Reserved companion roll: ${fallbackRoll.bones.species} · ${fallbackRoll.bones.rarity}`,
      'First-stage commands currently available: /buddy hatch, /buddy help, /buddy status, /buddy card, /buddy mute, /buddy unmute, /buddy pet.',
      'Hatch currently uses a deterministic local soul generator for stage A.',
    ].join('\n')
  }

  const stars = RARITY_STARS[companion.rarity]
  const mutedState = currentConfig.companionMuted ? 'muted' : 'active'
  return [
    `${companion.name} the ${companion.species}`,
    `Rarity: ${companion.rarity} ${stars}`,
    `Status: ${mutedState}${companion.shiny ? ' · shiny ✨' : ''}`,
    `Eye: ${companion.eye} · Hat: ${companion.hat}`,
    `Personality: ${companion.personality}`,
    `Stats: ${formatStats(companion.stats)}`,
  ].join('\n')
}

function buildHelpText(): string {
  return [
    'Buddy commands available in stage A:',
    '/buddy                Show Buddy status',
    '/buddy hatch          Hatch your Buddy with a deterministic local soul and trigger an AI soul refinement turn',
    '/buddy status         Show current Buddy summary',
    '/buddy card           Show Buddy card details',
    '/buddy pet            Trigger the current sprite reaction + pet hearts',
    '/buddy mute           Mute Buddy notifications/context injection',
    '/buddy unmute         Unmute Buddy notifications/context injection',
    '/buddy help           Show this help text',
  ].join('\n')
}

function buildCardNode(): React.ReactNode {
  const companion = getCompanion()

  if (!companion) {
    const fallbackRoll = getBuddyRoll()
    return (
      <Text>
        {`No hatched Buddy yet. Reserved card: ${fallbackRoll.bones.species} · ${fallbackRoll.bones.rarity}`}
      </Text>
    )
  }

  return (
    <Text color={RARITY_COLORS[companion.rarity]}>
      {`${companion.name} the ${companion.species}`} {'\n'}
      {`Rarity: ${companion.rarity} ${RARITY_STARS[companion.rarity]}`} {'\n'}
      {`Traits: eye=${companion.eye} hat=${companion.hat}${companion.shiny ? ' shiny=✨' : ''}`} {'\n'}
      {`Personality: ${companion.personality}`} {'\n'}
      {`Stats: ${formatStats(companion.stats)}`}
    </Text>
  )
}

function updateBuddyConfig(
  updater: (config: GlobalConfig) => GlobalConfig,
): string {
  let changed = false
  saveGlobalConfig(current => {
    const next = updater(current)
    changed = next !== current
    return next
  })
  return changed ? 'Buddy config updated.' : 'No Buddy config changes were needed.'
}

function setMuted(nextMuted: boolean): string {
  return updateBuddyConfig(current => {
    if (!!current.companionMuted === nextMuted) {
      return current
    }
    return {
      ...current,
      companionMuted: nextMuted,
    }
  })
}

function hatchBuddy(): { message: string; createdNewBuddy: boolean } {
  const existing = getCompanion()
  if (existing) {
    return {
      message: `${existing.name} is already hatched.`,
      createdNewBuddy: false,
    }
  }

  const soul = buildGeneratedSoul()
  let changed = false
  saveGlobalConfig(current => {
    if (current.companion) {
      return current
    }
    changed = true
    return {
      ...current,
      companion: {
        ...soul,
        hatchedAt: Date.now(),
      },
    }
  })

  if (!changed) {
    const currentCompanion = getCompanion()
    return {
      message: currentCompanion
        ? `${currentCompanion.name} is already hatched.`
        : 'Buddy hatch did not make any changes.',
      createdNewBuddy: false,
    }
  }

  return {
    message: `${soul.name} hatched successfully. Personality: ${soul.personality}`,
    createdNewBuddy: true,
  }
}

function buildAiSoulMetaMessage(triggerMetaMessageUuid: string): string {
  const { bones, inspirationSeed } = getBuddyRoll()
  return `<system-reminder>\nBuddy hatch completed. This refinement request is bound to meta message uuid: ${triggerMetaMessageUuid}\nReturn ONLY valid JSON with this exact shape:\n{"name": string, "personality": string}\nDo not wrap it in markdown. Do not add commentary before or after the JSON.\nKeep species, rarity, stats, eye, hat, shiny unchanged — those are fixed by the deterministic Buddy roll.\nCurrent Buddy roll:\n- species: ${bones.species}\n- rarity: ${bones.rarity}\n- eye: ${bones.eye}\n- hat: ${bones.hat}\n- shiny: ${String(bones.shiny)}\n- stats: ${formatStats(bones.stats)}\n- inspirationSeed: ${inspirationSeed}\nGenerate only a playful name and a short personality string.\n</system-reminder>`
}

function applyPetReaction(setAppState: (updater: (prev: AppState) => AppState) => void): string {
  const companion = getCompanion()
  if (!companion) {
    return 'No hatched Buddy yet, so there is nothing to pet.'
  }

  setAppState(prev => ({
    ...prev,
    companionPetAt: Date.now(),
    companionReaction: `♡ ${companion.name} looks delighted!`,
  }))

  return `You pet ${companion.name}.`
}

export const call: LocalJSXCommandCall = async (onDone, context, args) => {
  const parts = args?.trim() ? args.trim().split(/\s+/) : []
  const subcommand = parts[0] ?? 'status'

  switch (subcommand) {
    case 'hatch': {
      const { message, createdNewBuddy } = hatchBuddy()
      const triggerMetaMessageUuid = randomUUID()
      if (createdNewBuddy) {
        setPendingBuddySoulRefinement({
          sessionId: getSessionId(),
          triggerMetaMessageUuid,
        })
      } else {
        setPendingBuddySoulRefinement(null)
      }
      onDone(
        message,
        createdNewBuddy
          ? {
              display: 'system',
              metaMessages: [buildAiSoulMetaMessage(triggerMetaMessageUuid)],
              shouldQuery: true,
            }
          : { display: 'system' },
      )
      return null
    }
    case 'status':
      onDone(buildStatusText())
      return null
    case 'help':
      onDone(buildHelpText())
      return null
    case 'card':
      return buildCardNode()
    case 'mute': {
      onDone(setMuted(true))
      return null
    }
    case 'unmute': {
      onDone(setMuted(false))
      return null
    }
    case 'pet': {
      onDone(applyPetReaction(context.setAppState))
      return null
    }
    default:
      onDone(
        `Unknown /buddy subcommand: ${subcommand}\n\n${buildHelpText()}`,
      )
      return null
  }
}
