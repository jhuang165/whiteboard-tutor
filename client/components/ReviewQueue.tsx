import { useState } from 'react'
import { useValue } from 'tldraw'
import { getDueReviews } from '../../shared/tutor/evidence'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { getProblemState } from '../tutor/problemState'
import { getLatestProblemFrame } from '../tutor/tutorMarks'
import { useLearnerSummary, useNow } from '../tutor/useLearnerSummary'

/**
 * Offers the most overdue review without being asked (pedagogy-spec L4). Starting it is a
 * Quiz me turn pinned to that concept, so a clean solve can count as retained. It hides
 * while the tutor is working, while that concept's problem is open on the board, and for
 * the rest of the page visit once the student picks Later.
 */
export function ReviewQueue({ onStart }: { onStart: (concept: string, message: string) => void }) {
	const agent = useAgent()
	const { summary } = useLearnerSummary()
	const now = useNow()
	const [snoozed, setSnoozed] = useState<string[]>([])

	const isGenerating = useValue('isGenerating', () => agent.requests.isGenerating(), [agent])
	const openConcept = useValue(
		'openProblemConcept',
		() => {
			const frame = getLatestProblemFrame(agent.editor)
			if (!frame) return null
			const state = getProblemState(frame)
			return state.status === 'open' ? state.concept : null
		},
		[agent]
	)

	if (!summary || isGenerating) return null
	const due = getDueReviews(summary, now).filter((c) => c.concept !== openConcept && !snoozed.includes(c.concept))
	if (due.length === 0) return null

	const [next] = due
	const name = next.concept.replace(/-/g, ' ')
	return (
		<div className="review-queue" role="status">
			<span className="review-queue-text">
				Review due: <strong>{name}</strong>
				{due.length > 1 && <span className="review-queue-more"> +{due.length - 1} more</span>}
			</span>
			<button
				type="button"
				className="review-queue-start"
				onClick={() => onStart(next.concept, `Give me a review problem on ${name}.`)}
			>
				Review now
			</button>
			<button type="button" className="review-queue-later" onClick={() => setSnoozed((s) => [...s, next.concept])}>
				Later
			</button>
		</div>
	)
}
