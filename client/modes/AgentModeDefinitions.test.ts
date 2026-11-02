import { describe, expect, it } from 'vitest'
import { getAgentModeDefinition } from './AgentModeDefinitions'

// Actions that change shapes already on the board, which are the student's (pedagogy-spec C1).
const MUTATING_ACTIONS = [
	'delete',
	'update',
	'label',
	'move',
	'place',
	'bringToFront',
	'sendToBack',
	'rotate',
	'resize',
	'align',
	'distribute',
	'stack',
	'clear',
]

describe('working mode', () => {
	const mode = getAgentModeDefinition('working')
	if (!mode.active) throw new Error('working mode should be active')

	it('cannot change existing shapes (C1)', () => {
		const actions: readonly string[] = mode.actions
		expect(actions.filter((a) => MUTATING_ACTIONS.includes(a))).toEqual([])
	})

	it('sends the tutorTurn part, which selects the tutor system prompt', () => {
		expect(mode.parts).toContain('tutorTurn')
	})
})
