import { describe, expect, it } from 'vitest'
import {
	classifyEvidence,
	conceptSlug,
	EvidenceRecord,
	getDueReviews,
	summarizeEvidence,
	toEvidenceRecord,
} from './evidence'

const DAY = 24 * 60 * 60 * 1000
const NOW = 100 * DAY

function record(partial: Partial<EvidenceRecord>): EvidenceRecord {
	return { id: 'r', concept: 'bayes-rule', level: 'independent', problemId: 'p0', hintRungs: [], at: NOW, ...partial }
}

describe('classifyEvidence', () => {
	const solved = { kind: 'solved' as const, concept: 'Bayes rule', problemId: 'p1', hintRungs: [], incorrectChecks: 0 }

	it('never logs a solve after hints as independent (L2)', () => {
		expect(classifyEvidence({ ...solved, hintRungs: ['H2'] }, [], NOW)).toBe('assisted')
	})

	it('counts a solve after a wrong check as assisted', () => {
		expect(classifyEvidence({ ...solved, incorrectChecks: 1 }, [], NOW)).toBe('assisted')
	})

	it('logs a clean first solve as independent (L3)', () => {
		expect(classifyEvidence(solved, [], NOW)).toBe('independent')
	})

	it('logs a clean solve a day after an independent one as retained (L4)', () => {
		const history = [record({ at: NOW - 2 * DAY })]
		expect(classifyEvidence(solved, history, NOW)).toBe('retained')
		expect(classifyEvidence(solved, [record({ at: NOW - DAY / 2 })], NOW)).toBe('independent')
		expect(classifyEvidence(solved, [record({ at: NOW - 2 * DAY, level: 'assisted' })], NOW)).toBe('independent')
	})

	it('logs an explanation as exposure (L1)', () => {
		expect(classifyEvidence({ kind: 'exposure', concept: 'bayes', problemId: null }, [], NOW)).toBe('exposure')
	})
})

describe('toEvidenceRecord', () => {
	it('writes one record per problem and level', () => {
		const event = { kind: 'solved' as const, concept: 'bayes-rule', problemId: 'p1', hintRungs: [], incorrectChecks: 0 }
		const first = toEvidenceRecord(event, [], NOW, 'a')
		expect(first).toMatchObject({ concept: 'bayes-rule', level: 'independent', problemId: 'p1' })
		expect(toEvidenceRecord(event, [first!], NOW, 'b')).toBeNull()
	})
})

describe('summarizeEvidence', () => {
	it('reports the best level and the next review date', () => {
		const [summary] = summarizeEvidence([
			record({ level: 'exposure', at: NOW - 3 * DAY, problemId: null }),
			record({ level: 'assisted', at: NOW - 2 * DAY }),
			record({ level: 'independent', at: NOW - DAY }),
		])
		expect(summary).toMatchObject({ concept: 'bayes-rule', best: 'independent', independent: 1, assisted: 1 })
		expect(summary.reviewDueAt).toBe(NOW)
	})

	it('has no review date before an independent solve', () => {
		expect(summarizeEvidence([record({ level: 'assisted' })])[0].reviewDueAt).toBeNull()
	})
})

describe('getDueReviews', () => {
	it('lists due reviews, most overdue first', () => {
		const summary = summarizeEvidence([
			record({ concept: 'bayes-rule', level: 'independent', at: NOW - DAY }),
			record({ concept: 'expected-value', level: 'independent', at: NOW - 2 * DAY }),
			record({ concept: 'counting', level: 'independent', at: NOW - DAY / 2 }),
			record({ concept: 'variance', level: 'assisted', at: NOW - 5 * DAY }),
		])
		expect(getDueReviews(summary, NOW).map((c) => c.concept)).toEqual(['expected-value', 'bayes-rule'])
	})
})

describe('conceptSlug', () => {
	it('normalizes names', () => {
		expect(conceptSlug("Bayes' Rule")).toBe('bayes-rule')
		expect(conceptSlug('  ')).toBe('general')
	})
})
