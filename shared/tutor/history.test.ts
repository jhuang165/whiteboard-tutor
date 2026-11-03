import { describe, expect, it } from 'vitest'
import { EvidenceRecord } from './evidence'
import { buildHistoryEntries, buildSessions, HistoryProblem, SESSION_GAP_MS } from './history'

const HOUR = 60 * 60 * 1000
const T0 = 1_000 * HOUR

function problem(partial: Partial<HistoryProblem>): HistoryProblem {
	return {
		problemId: 'p1',
		title: 'Spam emails',
		statement: 'Find $P(S|F)$.',
		concept: 'bayes-rule',
		posedAt: T0,
		verification: 'checked',
		issue: '',
		...partial,
	}
}

function record(partial: Partial<EvidenceRecord>): EvidenceRecord {
	return { id: 'r1', concept: 'bayes-rule', level: 'independent', problemId: 'p1', hintRungs: [], at: T0, ...partial }
}

describe('buildHistoryEntries', () => {
	it('marks a posed problem with no evidence as not solved', () => {
		const [entry] = buildHistoryEntries({ problems: [problem({})], records: [] })
		expect(entry).toMatchObject({ kind: 'problem', outcome: 'unsolved', hintRungs: [] })
	})

	it('takes the best solve and its hints, over an exposure on the same problem', () => {
		const [entry] = buildHistoryEntries({
			problems: [problem({})],
			records: [
				record({ id: 'a', level: 'exposure', at: T0 + 1 }),
				record({ id: 'b', level: 'assisted', hintRungs: ['H1', 'H2'], at: T0 + 2 }),
			],
		})
		expect(entry).toMatchObject({ outcome: 'assisted', hintRungs: ['H1', 'H2'], endAt: T0 + 2 })
	})

	it('shows an explained but unsolved problem as an exposure', () => {
		const [entry] = buildHistoryEntries({ problems: [problem({})], records: [record({ level: 'exposure' })] })
		expect(entry.outcome).toBe('exposure')
	})

	it('shows a flawed problem as flawed whatever the evidence (V2)', () => {
		const [entry] = buildHistoryEntries({
			problems: [problem({ verification: 'flawed', issue: 'Two answers fit' })],
			records: [record({ level: 'exposure' })],
		})
		expect(entry.outcome).toBe('flawed')
	})

	it('keeps evidence for an unlisted problem and explanations outside a problem', () => {
		const entries = buildHistoryEntries({
			problems: [],
			records: [
				record({ id: 'x', problemId: null, level: 'exposure', concept: 'chain-rule', at: T0 + 5 }),
				record({ id: 'y', problemId: 'gone', at: T0 }),
			],
		})
		expect(entries.map((e) => [e.kind, e.key, e.problem])).toEqual([
			['problem', 'gone', null],
			['explanation', 'x', null],
		])
	})

	it('slugs the concept of older problem rows', () => {
		const [entry] = buildHistoryEntries({ problems: [problem({ concept: "Bayes' rule" })], records: [] })
		expect(entry.concept).toBe('bayes-rule')
	})
})

describe('buildSessions', () => {
	it('splits on a pause longer than the gap, newest session first', () => {
		const sessions = buildSessions({
			problems: [
				problem({ problemId: 'a', posedAt: T0 }),
				problem({ problemId: 'b', posedAt: T0 + HOUR }),
				problem({ problemId: 'c', posedAt: T0 + HOUR + SESSION_GAP_MS + 1 }),
			],
			records: [],
		})
		expect(sessions.map((s) => s.entries.map((e) => e.key))).toEqual([['c'], ['a', 'b']])
		expect(sessions[1]).toMatchObject({ startAt: T0, endAt: T0 + HOUR })
	})

	it('counts records as activity that keeps a session going', () => {
		const sessions = buildSessions({
			problems: [problem({ problemId: 'a', posedAt: T0 }), problem({ problemId: 'b', posedAt: T0 + 3 * HOUR })],
			records: [record({ problemId: 'a', at: T0 + 1.5 * HOUR })],
		})
		expect(sessions).toHaveLength(1)
		expect(sessions[0].entries.map((e) => e.key)).toEqual(['a', 'b'])
	})

	it('keeps a problem solved a day later in the session it was posed in', () => {
		const sessions = buildSessions({
			problems: [problem({ problemId: 'a', posedAt: T0 }), problem({ problemId: 'b', posedAt: T0 + 30 * HOUR })],
			records: [record({ problemId: 'a', at: T0 + 24 * HOUR })],
		})
		expect(sessions.map((s) => s.entries.map((e) => [e.key, e.outcome]))).toEqual([
			[['b', 'unsolved']],
			[['a', 'independent']],
		])
		expect(sessions[1].endAt).toBe(T0)
	})

	it('returns no sessions for an empty record', () => {
		expect(buildSessions({ problems: [], records: [] })).toEqual([])
	})
})
