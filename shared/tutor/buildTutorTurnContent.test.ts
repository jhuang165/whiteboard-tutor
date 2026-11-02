import { describe, expect, it } from 'vitest'
import { buildTutorTurnContent } from './buildTutorTurnContent'
import { TUTOR_BUTTONS, TUTOR_INTENTS } from './TutorIntent'

describe('buildTutorTurnContent', () => {
	it('names a mode for every intent', () => {
		for (const intent of TUTOR_INTENTS) {
			const text = buildTutorTurnContent({ intent, hintsGiven: 0 }).join('\n')
			expect(text).toMatch(/\bM[1-7]\b/)
		}
	})

	it('has a button for every intent except chat', () => {
		expect(TUTOR_BUTTONS.map((b) => b.intent).sort()).toEqual(
			TUTOR_INTENTS.filter((i) => i !== 'chat').sort()
		)
	})

	it('asks for zero questions on Explain (Q2)', () => {
		expect(buildTutorTurnContent({ intent: 'explain', hintsGiven: 0 }).join()).toContain('zero questions')
	})

	it('counts hint requests and asks for exactly one rung', () => {
		const first = buildTutorTurnContent({ intent: 'hint', hintsGiven: 0 }).join()
		expect(first).toContain('hint request #1')
		expect(first).toContain('exactly one rung')
		expect(first).not.toContain('already gave')

		const third = buildTutorTurnContent({ intent: 'hint', hintsGiven: 2 }).join()
		expect(third).toContain('hint request #3')
		expect(third).toContain('already gave')
	})

	it('transcribes before judging on Check (C3)', () => {
		expect(buildTutorTurnContent({ intent: 'check', hintsGiven: 0 }).join()).toContain('(C3)')
	})
})
