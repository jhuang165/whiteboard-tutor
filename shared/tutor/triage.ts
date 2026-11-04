/**
 * Proactive watching (PLAN §3, pedagogy-spec W). When the student opts in and pauses, a cheap
 * triage call decides whether the tutor should step in. The default is no.
 */

/** One shape in the problem's work area, as the triage model sees it. */
export interface TriageShape {
	/** The simple id the tutor's shape list uses, so a flagged shape can be marked. */
	id: string
	author: 'student' | 'tutor'
	type: string
	/** Typed text or the tutor's note. Handwriting has none: read it from the image. */
	text?: string
	x: number
	y: number
	w: number
	h: number
}

export interface TriageRequest {
	learnerId: string
	problemId: string
	title: string
	statement: string
	/** A JPEG data URL of the problem frame. */
	image: string
	shapes: TriageShape[]
}

export interface TriageDecision {
	intervene: boolean
	/** One sentence on the error, or on why not to step in. Passed to the tutor turn. */
	reason: string
	/** The student shape with the earliest error, or an empty string. */
	shapeId: string
}

export interface TriageResponse extends TriageDecision {
	/** Set when triage itself failed; `intervene` is then false. */
	error?: string
}

/** Structured output schema for the triage decision. */
export const TRIAGE_OUTPUT_SCHEMA = {
	type: 'object',
	properties: {
		intervene: { type: 'boolean' },
		reason: { type: 'string' },
		shapeId: { type: 'string' },
	},
	required: ['intervene', 'reason', 'shapeId'],
	additionalProperties: false,
} as const

/** The longest triage reason passed into a tutor turn. */
export const MAX_WATCH_REASON = 300

/** Trim a triage reason to one plain line for the tutor's prompt. */
export function cleanWatchReason(reason: string): string {
	const line = reason.replace(/\s+/g, ' ').trim()
	return line.length > MAX_WATCH_REASON ? `${line.slice(0, MAX_WATCH_REASON - 1)}…` : line
}
