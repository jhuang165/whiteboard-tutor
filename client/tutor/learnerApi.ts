import type { EvidenceEvent, EvidenceRecord } from '../../shared/tutor/evidence'
import type { HistoryResponse } from '../../shared/tutor/history'
import type { TriageRequest, TriageResponse } from '../../shared/tutor/triage'
import type { VerifyRequest, VerifyResponse } from '../../shared/tutor/verification'

const LEARNER_ID_KEY = 'whiteboard-tutor:learner-id'

/**
 * An anonymous learner id kept in this browser. There are no accounts yet (PLAN §8 #2), so
 * clearing site data starts a new record.
 */
export function getLearnerId(): string {
	let id = localStorage.getItem(LEARNER_ID_KEY)
	if (!id) {
		id = crypto.randomUUID()
		localStorage.setItem(LEARNER_ID_KEY, id)
	}
	return id
}

/**
 * How long the frame waits before showing the check as failed. The worker still stores a late
 * answer, and the tutor reads it from the learner store, so a slow check is not lost.
 */
const VERIFY_TIMEOUT_MS = 5 * 60 * 1000

/** Ask the worker to solve and check a posed problem. Resolves when the check is done. */
export async function verifyProblem(request: Omit<VerifyRequest, 'learnerId'>): Promise<VerifyResponse> {
	try {
		const res = await fetch('/verify', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...request, learnerId: getLearnerId() } satisfies VerifyRequest),
			signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
		})
		if (!res.ok) return { status: 'failed', checkedWithCode: false, error: await res.text() }
		return (await res.json()) as VerifyResponse
	} catch (error) {
		return { status: 'failed', checkedWithCode: false, error: String(error) }
	}
}

const TRIAGE_TIMEOUT_MS = 60 * 1000

/** Ask the worker whether the tutor should step in on this work (M8). Any failure is a no. */
export async function triageWork(request: Omit<TriageRequest, 'learnerId'>): Promise<TriageResponse> {
	try {
		const res = await fetch('/triage', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ...request, learnerId: getLearnerId() } satisfies TriageRequest),
			signal: AbortSignal.timeout(TRIAGE_TIMEOUT_MS),
		})
		const body = (await res.json().catch(() => null)) as TriageResponse | null
		return body ?? { intervene: false, reason: '', shapeId: '', error: `HTTP ${res.status}` }
	} catch (error) {
		return { intervene: false, reason: '', shapeId: '', error: String(error) }
	}
}

/** Report something that counts as evidence. The worker decides the level. */
export async function recordEvidence(event: EvidenceEvent): Promise<EvidenceRecord | null> {
	try {
		const res = await fetch('/evidence', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ learnerId: getLearnerId(), event }),
		})
		if (!res.ok) throw new Error(await res.text())
		const { record } = (await res.json()) as { record: EvidenceRecord | null }
		if (record) window.dispatchEvent(new CustomEvent(EVIDENCE_EVENT))
		return record
	} catch (error) {
		console.error('Could not record evidence:', error)
		return null
	}
}

/** Every evidence record for this learner, newest first. */
export async function fetchEvidence(): Promise<EvidenceRecord[]> {
	const res = await fetch(`/evidence?learnerId=${encodeURIComponent(getLearnerId())}`)
	if (!res.ok) throw new Error(await res.text())
	const { records } = (await res.json()) as { records: EvidenceRecord[] }
	return records
}

/** Posed problems (without answers) and evidence records, for session history. */
export async function fetchHistory(): Promise<HistoryResponse> {
	const res = await fetch(`/history?learnerId=${encodeURIComponent(getLearnerId())}`)
	if (!res.ok) throw new Error(await res.text())
	return (await res.json()) as HistoryResponse
}

/** Fired on `window` after a new evidence record is stored. */
export const EVIDENCE_EVENT = 'tutor-evidence-recorded'
