import { useEffect, useState } from 'react'
import { ConceptSummary, summarizeEvidence } from '../../shared/tutor/evidence'
import { EVIDENCE_EVENT, fetchEvidence } from './learnerApi'

/**
 * The learner's evidence by concept, reloaded after each new record. `summary` is null while
 * loading; `failed` is set when the learner store can't be reached.
 */
export function useLearnerSummary() {
	const [summary, setSummary] = useState<ConceptSummary[] | null>(null)
	const [failed, setFailed] = useState(false)

	useEffect(() => {
		let cancelled = false
		const load = () =>
			fetchEvidence()
				.then((records) => {
					if (cancelled) return
					setSummary(summarizeEvidence(records))
					setFailed(false)
				})
				.catch(() => !cancelled && setFailed(true))
		load()
		window.addEventListener(EVIDENCE_EVENT, load)
		return () => {
			cancelled = true
			window.removeEventListener(EVIDENCE_EVENT, load)
		}
	}, [])

	return { summary, failed }
}

/** The current time, updated every `intervalMs`, so due dates come due while the page is open. */
export function useNow(intervalMs = 60_000) {
	const [now, setNow] = useState(() => Date.now())
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), intervalMs)
		return () => clearInterval(timer)
	}, [intervalMs])
	return now
}
