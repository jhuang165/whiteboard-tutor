import { describe, expect, it } from 'vitest'
import { buildTutorTurnContent } from './buildTutorTurnContent'
import { TUTOR_BUTTONS, TUTOR_INTENTS } from './TutorIntent'

describe('buildTutorTurnContent', () => {
	it('names a mode for every intent', () => {
		for (const intent of TUTOR_INTENTS) {
			const text = buildTutorTurnContent({ intent, hintsGiven: 0 }).join('\n')
			expect(text).toMatch(/\bM[1-8]\b/)
		}
	})

	it('has a button for every intent except chat and watch', () => {
		expect(TUTOR_BUTTONS.map((b) => b.intent).sort()).toEqual(
			TUTOR_INTENTS.filter((i) => i !== 'chat' && i !== 'watch').sort()
		)
	})

	it('passes the triage reason on a Watch turn and allows doing nothing (M8)', () => {
		const text = buildTutorTurnContent({ intent: 'watch', hintsGiven: 0, watchReason: 'Line 2 adds\n the two  probabilities.' }).join()
		expect(text).toContain('M8 Watch')
		expect(text).toContain('"Line 2 adds the two probabilities."')
		expect(text).toContain('no actions')
		expect(text).toContain('no verdict, hint, method, or answer')
	})

	it('caps a long triage reason', () => {
		const text = buildTutorTurnContent({ intent: 'watch', hintsGiven: 0, watchReason: 'x'.repeat(1000) }).join()
		expect(text.length).toBeLessThan(1500)
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

	it('pins the concept on a scheduled review (L4)', () => {
		const text = buildTutorTurnContent({ intent: 'quiz', hintsGiven: 0, reviewConcept: 'bayes-rule' }).join()
		expect(text).toContain('scheduled review')
		expect(text).toContain('set its `concept` to exactly `bayes-rule`')
		expect(buildTutorTurnContent({ intent: 'quiz', hintsGiven: 0 }).join()).not.toContain('scheduled review')
	})
})
