import { useEffect, useState } from 'react'
import { Editor, useValue } from 'tldraw'
import { buildSessions, HistoryEntry, HistoryOutcome, HistorySession } from '../../shared/tutor/history'
import { useAgent } from '../agent/TldrawAgentAppProvider'
import { renderTextWithMath } from '../shapes/latex'
import { ProblemFrameShape } from '../shapes/ProblemFrameShapeUtil'
import { EVIDENCE_EVENT, fetchHistory } from '../tutor/learnerApi'
import { getProblemState, ProblemState } from '../tutor/problemState'
import { LEVEL_LABELS } from './EvidencePanel'

const OUTCOME_LABELS: Record<HistoryOutcome, string> = {
	...LEVEL_LABELS,
	exposure: 'Talked through',
	unsolved: 'Not solved',
	flawed: "Flawed problem, doesn't count",
}

/**
 * Past sessions, newest first: each problem the learner was posed, how it went, and the hints
 * it took, plus explanations given outside a problem. Problems still on the board can be
 * shown there. Covers the whole app while open; Escape or Close returns to the board.
 */
export function HistoryPage({ onClose }: { onClose: () => void }) {
	const agent = useAgent()
	const editor = agent.editor
	const [sessions, setSessions] = useState<HistorySession[] | null>(null)
	const [failed, setFailed] = useState(false)

	useEffect(() => {
		let cancelled = false
		const load = () =>
			fetchHistory()
				.then((history) => {
					if (cancelled) return
					setSessions(buildSessions(history))
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

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
		window.addEventListener('keydown', onKey)
		return () => window.removeEventListener('keydown', onKey)
	}, [onClose])

	const frames = useValue('problemFramesOnBoard', () => getProblemFrames(editor), [editor])

	const showOnBoard = (frame: ProblemFrameShape) => {
		const pageId = editor.getAncestorPageId(frame)
		if (pageId && pageId !== editor.getCurrentPageId()) editor.setCurrentPage(pageId)
		const bounds = editor.getShapePageBounds(frame)
		if (bounds) editor.zoomToBounds(bounds, { inset: 64, targetZoom: 1, animation: { duration: 400 } })
		onClose()
	}

	return (
		<div className="history-page" role="dialog" aria-label="Session history">
			<div className="history-header">
				<h2>Session history</h2>
				<button type="button" className="history-close" onClick={onClose}>
					Close
				</button>
			</div>
			<div className="history-body">
				{failed ? (
					<p className="history-empty">History isn't available right now.</p>
				) : !sessions ? (
					<p className="history-empty">Loading…</p>
				) : sessions.length === 0 ? (
					<p className="history-empty">No sessions yet. Press Quiz me to get a problem.</p>
				) : (
					sessions.map((session) => (
						<section key={session.id} className="history-session">
							<h3>
								{formatSessionTime(session)}
								<span className="history-session-count">{describeSession(session)}</span>
							</h3>
							<ul className="history-entries">
								{session.entries.map((entry) => (
									<EntryRow
										key={entry.key}
										entry={entry}
										frame={entry.problemId ? frames.get(entry.problemId) : undefined}
										onShow={showOnBoard}
									/>
								))}
							</ul>
						</section>
					))
				)}
			</div>
		</div>
	)
}

function EntryRow({
	entry,
	frame,
	onShow,
}: {
	entry: HistoryEntry
	frame?: { shape: ProblemFrameShape; state: ProblemState }
	onShow: (frame: ProblemFrameShape) => void
}) {
	const concept = entry.concept.replace(/-/g, ' ')
	// An unsolved problem still on the board shows the hints opened so far.
	const hintRungs = entry.outcome === 'unsolved' && frame ? frame.state.hintRungs : entry.hintRungs
	const title =
		entry.kind === 'explanation'
			? `Explanation: ${concept}`
			: entry.problem?.title || frame?.shape.props.title || `A problem on ${concept}`

	return (
		<li className="history-entry">
			<div className="history-entry-top">
				<span className="history-entry-title" dangerouslySetInnerHTML={{ __html: renderTextWithMath(title) }} />
				<span className="history-outcome" data-outcome={entry.outcome}>
					{entry.kind === 'explanation' ? 'Seen' : OUTCOME_LABELS[entry.outcome]}
				</span>
			</div>
			{entry.problem?.statement && (
				<div
					className="history-entry-statement"
					dangerouslySetInnerHTML={{ __html: renderTextWithMath(entry.problem.statement) }}
				/>
			)}
			<div className="history-entry-meta">
				<span className="history-entry-concept">{concept}</span>
				<span>{formatTime(entry.startAt)}</span>
				{hintRungs.length > 0 && <span>Hints: {hintRungs.join(', ')}</span>}
				{entry.outcome === 'flawed' && entry.problem?.issue && <span>{entry.problem.issue}</span>}
				{frame && (
					<button type="button" className="history-show" onClick={() => onShow(frame.shape)}>
						Show on board
					</button>
				)}
			</div>
		</li>
	)
}

/** Problem frames on any page, by problem id. */
function getProblemFrames(editor: Editor) {
	const frames = new Map<string, { shape: ProblemFrameShape; state: ProblemState }>()
	for (const page of editor.getPages()) {
		for (const id of editor.getPageShapeIds(page)) {
			const shape = editor.getShape(id)
			if (!shape || !editor.isShapeOfType<ProblemFrameShape>(shape, 'problem-frame')) continue
			const state = getProblemState(shape)
			frames.set(state.problemId, { shape, state })
		}
	}
	return frames
}

function describeSession(session: HistorySession): string {
	const problems = session.entries.filter((e) => e.kind === 'problem')
	const own = problems.filter((e) => e.outcome === 'independent' || e.outcome === 'retained').length
	const helped = problems.filter((e) => e.outcome === 'assisted').length
	const parts = []
	if (problems.length) parts.push(`${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}`)
	if (own) parts.push(`${own} on your own`)
	if (helped) parts.push(`${helped} with help`)
	const explanations = session.entries.length - problems.length
	if (explanations) parts.push(`${explanations} ${explanations === 1 ? 'explanation' : 'explanations'}`)
	return parts.join(' · ')
}

function formatSessionTime(session: HistorySession): string {
	const day = new Date(session.startAt).toLocaleDateString(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
	})
	const start = formatTime(session.startAt)
	const end = formatTime(session.endAt)
	return start === end ? `${day}, ${start}` : `${day}, ${start} – ${end}`
}

function formatTime(ms: number): string {
	return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}
