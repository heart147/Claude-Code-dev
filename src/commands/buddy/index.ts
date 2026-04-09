import type { Command } from '../../commands.js'

const buddy = {
  type: 'local-jsx',
  name: 'buddy',
  description: 'Interact with your AI companion',
  immediate: true,
  argumentHint: '[hatch|status|card|pet|mute|unmute|help]',
  load: () => import('./buddy.js'),
} satisfies Command

export default buddy
