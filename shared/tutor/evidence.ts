/**
 * Evidence levels (pedagogy-spec L). The level is decided here, from what the client counted
 * (hints opened, earlier wrong checks), never by the model, so an assisted solve can't be
 * logged as independent.
 */
export const EVIDENCE_LEVELS = ['exposure', 'assisted', 'independent', 'retained'] as const

export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number]

export interface EvidenceRecord {
	id: string
	/** A short concept slug, such as `bayes-rule`. */
	concept: string
	level: EvidenceLevel
	/** The problem the record is about. Null for an explanation outside a problem. */
	problemId: string | null
	/** Hint ladder rungs opened on the problem, in order (L2). */
	hintRungs: string[]
	/** Unix ms. */
	at: number
}

/** What the client reports. The learner store turns it into a record with `toEvidenceRecord`. */
export type EvidenceEvent =
	| { kind: 'exposure'; concept: string; problemId: string | null }
	| {
			kind: 'solved'
			concept: string
			problemId: string
			hintRungs: string[]
			/** Checks on this problem that came back incorrect before this one. */
			incorrectChecks: number
	  }

const DAY = 24 * 60 * 60 * 1000

/** Proposed review spacing in days, after each independent or retained solve (L4). */
export const REVIEW_DAYS = [1, 3, 7, 21] as const

/** Normalize a concept name to a slug, so `Bayes' rule` and `bayes-rule` match. */
export function conceptSlug(concept: string): string {
	return (
		concept
			.toLowerCase()
			.replace(/['’]/g, '')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'general'
	)
}

/**
 * The level for an event, given the learner's earlier records.
 *
 * - Any hint, or an earlier wrong check (the error mark is help), makes a solve assisted.
 * - A clean solve is retained when an independent or retained solve of the same concept is at
 *   least a day old; otherwise it is independent.
 */
export function classifyEvidence(event: EvidenceEvent, history: EvidenceRecord[], now: number): EvidenceLevel {
	if (event.kind === 'exposure') return 'exposure'
	if (event.hintRungs.length > 0 || event.incorrectChecks > 0) return 'assisted'
	const concept = conceptSlug(event.concept)
	const earlier = history.some(
		(r) =>
			r.concept === concept &&
			(r.level === 'independent' || r.level === 'retained') &&
			r.problemId !== event.problemId &&
			now - r.at >= DAY
	)
	return earlier ? 'retained' : 'independent'
}

/** Build the record to store, or null when the learner already has one for this problem and level. */
export function toEvidenceRecord(
	event: EvidenceEvent,
	history: EvidenceRecord[],
	now: number,
	id: string
): EvidenceRecord | null {
	const concept = conceptSlug(event.concept)
	const level = classifyEvidence(event, history, now)
	// One record per concept per problem and level: a re-check of a solved problem adds nothing,
	// and repeated explanations of the same problem count once.
	const duplicate = history.some(
		(r) => r.concept === concept && r.level === level && event.problemId !== null && r.problemId === event.problemId
	)
	if (duplicate) return null
	return {
		id,
		concept,
		level,
		problemId: event.problemId,
		hintRungs: event.kind === 'solved' ? event.hintRungs : [],
		at: now,
	}
}

export interface ConceptSummary {
	concept: string
	/** The strongest level reached so far. */
	best: EvidenceLevel
	independent: number
	assisted: number
	exposures: number
	lastAt: number
	/** When the next review is due (Unix ms), once there is an independent solve. */
	reviewDueAt: number | null
}

const RANK: Record<EvidenceLevel, number> = { exposure: 0, assisted: 1, independent: 2, retained: 3 }

/** Per-concept summary, most recent first. */
export function summarizeEvidence(records: EvidenceRecord[]): ConceptSummary[] {
	const byConcept = new Map<string, EvidenceRecord[]>()
	for (const r of records) byConcept.set(r.concept, [...(byConcept.get(r.concept) ?? []), r])

	const summaries: ConceptSummary[] = []
	for (const [concept, list] of byConcept) {
		const sorted = [...list].sort((a, b) => a.at - b.at)
		const clean = sorted.filter((r) => r.level === 'independent' || r.level === 'retained')
		const last = clean.at(-1)
		const step = REVIEW_DAYS[Math.min(clean.length, REVIEW_DAYS.length) - 1]
		summaries.push({
			concept,
			best: sorted.reduce<EvidenceLevel>((best, r) => (RANK[r.level] > RANK[best] ? r.level : best), 'exposure'),
			independent: clean.length,
			assisted: sorted.filter((r) => r.level === 'assisted').length,
			exposures: sorted.filter((r) => r.level === 'exposure').length,
			lastAt: sorted.at(-1)!.at,
			reviewDueAt: last && step ? last.at + step * DAY : null,
		})
	}
	return summaries.sort((a, b) => b.lastAt - a.lastAt)
}

/** Concepts whose review is due by `now`, most overdue first (L4). */
export function getDueReviews(summary: ConceptSummary[], now: number): ConceptSummary[] {
	return summary
		.filter((c) => c.reviewDueAt !== null && c.reviewDueAt <= now)
		.sort((a, b) => a.reviewDueAt! - b.reviewDueAt!)
}
