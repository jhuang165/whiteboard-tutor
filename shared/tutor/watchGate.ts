/**
 * When proactive watching may ask triage about the student's work (PLAN §3, pedagogy-spec M8).
 * Every condition leans toward staying quiet: triage costs money, and a tutor that interrupts
 * often teaches the student to wait for it.
 */

/** Quiet time after the last board change before triage runs. */
export const WATCH_IDLE_MS = 6000
/** Least time between two triage calls. */
export const WATCH_COOLDOWN_MS = 30_000
export const MAX_TRIAGES_PER_PROBLEM = 8
export const MAX_WATCH_TURNS_PER_PROBLEM = 2
/** "Moved past" an error needs at least a second piece of work. */
export const MIN_STUDENT_SHAPES = 2

export interface WatchSnapshot {
	problemId: string
	status: 'open' | 'solved' | 'flawed'
	verification: 'pending' | 'checked' | 'flawed' | 'failed'
	studentShapes: number
	/** A hash of the student's work in the frame, to skip work triage already saw. */
	signature: string
	/** False while a pen stroke is still being drawn. */
	inkComplete: boolean
	/** Whether any tutor request is running. */
	generating: boolean
}

export interface WatchLog {
	triages: number
	interventions: number
	lastSignature: string
}

export type WatchGateResult = { ok: true } | { ok: false; why: string }

export function checkWatchGate(
	snapshot: WatchSnapshot,
	log: WatchLog | undefined,
	lastTriageAt: number,
	now: number
): WatchGateResult {
	if (snapshot.generating) return { ok: false, why: 'the tutor is busy' }
	if (snapshot.status !== 'open') return { ok: false, why: 'the problem is not open' }
	if (snapshot.verification !== 'checked') return { ok: false, why: 'the answer is not checked yet' }
	if (!snapshot.inkComplete) return { ok: false, why: 'a stroke is in progress' }
	if (snapshot.studentShapes < MIN_STUDENT_SHAPES) return { ok: false, why: 'not enough work yet' }
	if (now - lastTriageAt < WATCH_COOLDOWN_MS) return { ok: false, why: 'cooling down' }
	if (log) {
		if (log.lastSignature === snapshot.signature) return { ok: false, why: 'no new work' }
		if (log.interventions >= MAX_WATCH_TURNS_PER_PROBLEM) return { ok: false, why: 'stepped in enough on this problem' }
		if (log.triages >= MAX_TRIAGES_PER_PROBLEM) return { ok: false, why: 'triage cap for this problem' }
	}
	return { ok: true }
}

/** A short, stable hash of a string (FNV-1a), for work signatures. */
export function hashString(value: string): string {
	let hash = 0x811c9dc5
	for (let i = 0; i < value.length; i++) {
		hash ^= value.charCodeAt(i)
		hash = Math.imul(hash, 0x01000193)
	}
	return (hash >>> 0).toString(36)
}
