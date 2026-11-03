import { conceptSlug, EvidenceLevel, EvidenceRecord } from './evidence'
import type { VerificationStatus } from './verification'

/**
 * Session history: the problems a learner was posed and the evidence they left, grouped into
 * sessions. The learner store sends problems without their checked answers.
 */

/** A posed problem as the learner store lists it. Never carries the checked answer. */
export interface HistoryProblem {
	problemId: string
	title: string
	statement: string
	concept: string
	/** Unix ms. */
	posedAt: number
	verification: VerificationStatus
	/** Why the check flagged the problem, when it did. */
	issue: string
}

export interface HistoryResponse {
	problems: HistoryProblem[]
	records: EvidenceRecord[]
}

/** How a problem went: its best evidence level, or not solved, or a flawed problem (V2). */
export type HistoryOutcome = EvidenceLevel | 'unsolved' | 'flawed'

export interface HistoryEntry {
	/** A posed problem, or an explanation outside any problem. */
	kind: 'problem' | 'explanation'
	key: string
	concept: string
	/** Null for an explanation, or for evidence about a problem the store no longer lists. */
	problem: HistoryProblem | null
	problemId: string | null
	outcome: HistoryOutcome
	/** Hint rungs opened before the solve (L2). */
	hintRungs: string[]
	startAt: number
	endAt: number
}

export interface HistorySession {
	id: string
	startAt: number
	endAt: number
	/** Oldest first. */
	entries: HistoryEntry[]
}

/** A pause this long between pieces of work starts a new session. */
export const SESSION_GAP_MS = 2 * 60 * 60 * 1000

const SOLVED_RANK: Partial<Record<EvidenceLevel, number>> = { assisted: 1, independent: 2, retained: 3 }

/** Problems and explanations as entries, oldest first. */
export function buildHistoryEntries({ problems, records }: HistoryResponse): HistoryEntry[] {
	const byProblem = new Map<string, EvidenceRecord[]>()
	const loose: EvidenceRecord[] = []
	for (const r of records) {
		if (r.problemId === null) loose.push(r)
		else byProblem.set(r.problemId, [...(byProblem.get(r.problemId) ?? []), r])
	}

	const entries: HistoryEntry[] = problems.map((problem) =>
		problemEntry(problem.problemId, conceptSlug(problem.concept), problem, byProblem.get(problem.problemId) ?? [])
	)
	// Evidence for a problem the store doesn't list, such as one whose check never saved.
	const listed = new Set(problems.map((p) => p.problemId))
	for (const [problemId, list] of byProblem) {
		if (!listed.has(problemId)) entries.push(problemEntry(problemId, list[0].concept, null, list))
	}
	for (const r of loose) {
		entries.push({
			kind: 'explanation',
			key: r.id,
			concept: r.concept,
			problem: null,
			problemId: null,
			outcome: r.level,
			hintRungs: [],
			startAt: r.at,
			endAt: r.at,
		})
	}
	return entries.sort((a, b) => a.startAt - b.startAt)
}

function problemEntry(
	problemId: string,
	concept: string,
	problem: HistoryProblem | null,
	records: EvidenceRecord[]
): HistoryEntry {
	const solves = records.filter((r) => SOLVED_RANK[r.level] !== undefined)
	const best = solves.reduce<EvidenceRecord | null>(
		(best, r) => (!best || SOLVED_RANK[r.level]! > SOLVED_RANK[best.level]! ? r : best),
		null
	)
	const times = records.map((r) => r.at)
	const startAt = problem?.posedAt ?? Math.min(...times)
	return {
		kind: 'problem',
		key: problemId,
		concept,
		problem,
		problemId,
		outcome:
			problem?.verification === 'flawed'
				? 'flawed'
				: best
					? best.level
					: records.length > 0
						? 'exposure'
						: 'unsolved',
		hintRungs: best?.hintRungs ?? [],
		startAt,
		endAt: Math.max(startAt, ...times),
	}
}

/**
 * Entries grouped into sessions, newest session first. A session is a run of activity (a
 * problem posed, a record stored) with no pause longer than `gapMs`. An entry belongs to the
 * session it started in, so a problem posed one day and solved the next stays with its day.
 */
export function buildSessions(history: HistoryResponse, gapMs = SESSION_GAP_MS): HistorySession[] {
	const entries = buildHistoryEntries(history)
	const activity = [
		...entries.map((e) => ({ at: e.startAt, entry: e as HistoryEntry | null })),
		...history.records.map((r) => ({ at: r.at, entry: null })),
	].sort((a, b) => a.at - b.at || (a.entry ? -1 : 1))

	const sessions: HistorySession[] = []
	for (const { at, entry } of activity) {
		let current = sessions.at(-1)
		if (!current || at - current.endAt > gapMs) {
			// A record alone can't open a session: its entry already started in an earlier one.
			if (!entry) continue
			current = { id: entry.key, startAt: at, endAt: at, entries: [] }
			sessions.push(current)
		}
		current.endAt = at
		if (entry) current.entries.push(entry)
	}
	return sessions.reverse()
}
