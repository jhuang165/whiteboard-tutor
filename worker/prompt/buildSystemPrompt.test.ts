import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { AgentPrompt } from '../../shared/types/AgentPrompt'
import { buildSystemPrompt } from './buildSystemPrompt'

const TUTOR_ACTIONS = [
	'message',
	'think',
	'setMyView',
	'hint',
	'mark-error',
	'verdict',
	'pose-problem',
	'write-math',
	'create',
	'pen',
	'unknown',
] as const

function promptFor(partTypes: string[]): AgentPrompt {
	return {
		mode: {
			type: 'mode',
			modeType: 'working',
			partTypes,
			actionTypes: [...TUTOR_ACTIONS],
		},
	} as unknown as AgentPrompt
}

const tutorPrompt = buildSystemPrompt(promptFor(['mode', 'messages', 'screenshot', 'tutorTurn']))

// Rules the tutor prompt doesn't cover yet: Grill mode (M5) and evidence records (L1-L4)
// arrive in Phase 2 and Phase 4 (docs/PLAN.md section 5).
const DEFERRED_RULES = new Set(['M5', 'L1', 'L2', 'L3', 'L4'])

describe('buildSystemPrompt', () => {
	it('uses the tutor sections when the mode has a tutorTurn part', () => {
		expect(tutorPrompt).toContain('You are a patient math tutor')
		expect(tutorPrompt).toContain('## Tutor rules')
		expect(tutorPrompt).not.toContain('helps the user use a drawing')
	})

	it('keeps the generic agent intro without a tutorTurn part', () => {
		const generic = buildSystemPrompt(promptFor(['mode', 'messages']))
		expect(generic).toContain('helps the user use a drawing')
		expect(generic).not.toContain('## Tutor rules')
	})

	it('covers every in-scope pedagogy-spec rule id', () => {
		const spec = readFileSync(new URL('../../.claude/skills/pedagogy-spec/SKILL.md', import.meta.url), 'utf8')
		const ids = [...spec.matchAll(/^- \*\*([A-Z]\d)\b/gm)].map((m) => m[1])
		expect(ids.length).toBeGreaterThan(20)

		const missing = ids.filter((id) => !DEFERRED_RULES.has(id) && !tutorPrompt.includes(id))
		expect(missing).toEqual([])
	})

	it('tells the tutor when to use each tutor mark action', () => {
		expect(tutorPrompt).toContain('one `hint` action anchored to the student shape')
		expect(tutorPrompt).toContain('give one `verdict` on the work you checked, and if it is wrong, one `mark-error`')
		expect(tutorPrompt).toContain('note starting with "tutor"')
		expect(tutorPrompt).toContain('pose one problem at a time with `pose-problem`')
		expect(tutorPrompt).toContain('Write every formula or equation with `write-math`')
	})

	it('is identical across turns, so it stays cacheable', () => {
		expect(buildSystemPrompt(promptFor(['mode', 'messages', 'screenshot', 'tutorTurn']))).toBe(tutorPrompt)
	})
})
