import { describe, expect, it } from 'vitest'
import { checkWatchGate, hashString, MAX_TRIAGES_PER_PROBLEM, MAX_WATCH_TURNS_PER_PROBLEM, WATCH_COOLDOWN_MS, WatchSnapshot } from './watchGate'

const ready: WatchSnapshot = {
	problemId: 'p1',
	status: 'open',
	verification: 'checked',
	studentShapes: 3,
	signature: 'abc',
	inkComplete: true,
	generating: false,
}
const NOW = 100_000

describe('checkWatchGate', () => {
	it('allows triage on new, finished work in an open, checked problem', () => {
		expect(checkWatchGate(ready, undefined, 0, NOW)).toEqual({ ok: true })
	})

	it.each([
		['busy', { generating: true }],
		['solved', { status: 'solved' as const }],
		['unchecked', { verification: 'pending' as const }],
		['mid-stroke', { inkComplete: false }],
		['one line only', { studentShapes: 1 }],
	])('stays quiet when %s', (_, patch) => {
		expect(checkWatchGate({ ...ready, ...patch }, undefined, 0, NOW).ok).toBe(false)
	})

	it('waits out the cooldown', () => {
		expect(checkWatchGate(ready, undefined, NOW - WATCH_COOLDOWN_MS + 1, NOW).ok).toBe(false)
		expect(checkWatchGate(ready, undefined, NOW - WATCH_COOLDOWN_MS, NOW).ok).toBe(true)
	})

	it('skips work it already triaged', () => {
		expect(checkWatchGate(ready, { triages: 1, interventions: 0, lastSignature: 'abc' }, 0, NOW).ok).toBe(false)
		expect(checkWatchGate(ready, { triages: 1, interventions: 0, lastSignature: 'old' }, 0, NOW).ok).toBe(true)
	})

	it('caps triage calls and interventions per problem', () => {
		const log = { triages: 0, interventions: MAX_WATCH_TURNS_PER_PROBLEM, lastSignature: '' }
		expect(checkWatchGate(ready, log, 0, NOW).ok).toBe(false)
		expect(checkWatchGate(ready, { ...log, interventions: 0, triages: MAX_TRIAGES_PER_PROBLEM }, 0, NOW).ok).toBe(false)
	})
})

describe('hashString', () => {
	it('is stable and tells different work apart', () => {
		expect(hashString('a')).toBe(hashString('a'))
		expect(hashString('a')).not.toBe(hashString('b'))
	})
})
