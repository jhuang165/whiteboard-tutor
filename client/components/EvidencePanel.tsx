import { useEffect, useState } from 'react'
import { ConceptSummary, EvidenceLevel, summarizeEvidence } from '../../shared/tutor/evidence'
import { EVIDENCE_EVENT, fetchEvidence } from '../tutor/learnerApi'

const LEVEL_LABELS: Record<EvidenceLevel, string> = {
	exposure: 'Seen',
	assisted: 'Solved with help',
	independent: 'Solved on your own',
	retained: 'Retained',
}

/**
 * The learner's evidence by concept (pedagogy-spec L1 to L4): the best level so far, the
 * counts behind it, and when a review is due. It refreshes after each new record.
 */
export function EvidencePanel() {
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

	const now = Date.now()
	return (
		<details className="evidence-panel">
			<summary>Progress{summary && summary.length > 0 ? ` (${summary.length})` : ''}</summary>
			{failed ? (
				<p className="evidence-empty">Progress isn't available right now.</p>
			) : !summary ? (
				<p className="evidence-empty">Loading…</p>
			) : summary.length === 0 ? (
				<p className="evidence-empty">Nothing yet. Solve a problem or press Quiz me.</p>
			) : (
				<ul className="evidence-list">
					{summary.map((c) => (
						<li key={c.concept} className="evidence-row">
							<span className="evidence-concept">{c.concept.replace(/-/g, ' ')}</span>
							<span className="evidence-level" data-level={c.best}>
								{LEVEL_LABELS[c.best]}
							</span>
							<span className="evidence-detail">
								{describeCounts(c)}
								{c.reviewDueAt !== null && (c.reviewDueAt <= now ? ' · review due' : ` · review ${formatDay(c.reviewDueAt)}`)}
							</span>
						</li>
					))}
				</ul>
			)}
		</details>
	)
}

function describeCounts(c: ConceptSummary): string {
	const parts = []
	if (c.independent) parts.push(`${c.independent} on your own`)
	if (c.assisted) parts.push(`${c.assisted} with help`)
	if (c.exposures) parts.push(`${c.exposures} seen`)
	return parts.join(', ')
}

function formatDay(ms: number): string {
	return new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
