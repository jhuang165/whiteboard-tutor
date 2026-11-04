import { Editor, TLShapeId } from 'tldraw'
import { recordEvidence, verifyProblem } from './learnerApi'
import { getProblemState, isInWorkArea, updateProblemState } from './problemState'
import { getLatestProblemFrame } from './tutorMarks'

/**
 * What tutor turns do to the current problem: hints and wrong checks are counted, a correct
 * verdict solves it, and solves and explanations become evidence (pedagogy-spec M4, V, L).
 * The client counts; the worker decides the evidence level.
 */

/** Check a newly posed problem in the background and show the result on its frame. */
export async function checkPosedProblem(
	editor: Editor,
	frameId: TLShapeId,
	problem: { problemId: string; title: string; statement: string; concept: string }
) {
	const result = await verifyProblem(problem)
	updateProblemState(editor, frameId, {
		verification: result.status,
		checkedWithCode: result.checkedWithCode,
		issue: result.issue ?? '',
		...(result.status === 'flawed' ? { status: 'flawed' as const } : {}),
	})
	if (result.error) console.error('Answer check failed:', result.error)
}

/** A hint while a problem is open makes any later solve of it assisted (L2). */
export function noteHint(editor: Editor, rung: string) {
	const frame = getLatestProblemFrame(editor)
	if (!frame) return
	const state = getProblemState(frame)
	if (state.status !== 'open') return
	updateProblemState(editor, frame.id, { hintRungs: [...state.hintRungs, rung] })
}

/**
 * An error mark the student didn't ask for (a Watch turn, M8) on work in the open problem is
 * help, like a hint: a later solve is assisted (L2). It is filed as the `watch` rung.
 */
export function noteWatchMark(editor: Editor, targetId: TLShapeId) {
	const frame = getLatestProblemFrame(editor)
	if (!frame) return
	const state = getProblemState(frame)
	if (state.status !== 'open' || !isInWorkArea(editor, frame, targetId)) return
	updateProblemState(editor, frame.id, { hintRungs: [...state.hintRungs, 'watch'] })
}

/**
 * A verdict on work in the current problem's work area grades the attempt. A correct one
 * solves the problem and records evidence; an incorrect one counts as help for the next try.
 */
export function noteVerdict(editor: Editor, verdict: 'correct' | 'incorrect', workIds: TLShapeId[]) {
	const frame = getLatestProblemFrame(editor)
	if (!frame) return
	const state = getProblemState(frame)
	if (state.status !== 'open') return
	if (!workIds.some((id) => isInWorkArea(editor, frame, id))) return

	if (verdict === 'incorrect') {
		updateProblemState(editor, frame.id, { incorrectChecks: state.incorrectChecks + 1 })
		return
	}
	updateProblemState(editor, frame.id, { status: 'solved' })
	void recordEvidence({
		kind: 'solved',
		concept: state.concept,
		problemId: state.problemId,
		hintRungs: state.hintRungs,
		incorrectChecks: state.incorrectChecks,
	})
}

/**
 * An explanation (Explain or Wait-what) is exposure to the current problem's concept (L1).
 * Without a posed problem there is no concept to file it under, so nothing is recorded.
 */
export function noteExposure(editor: Editor) {
	const frame = getLatestProblemFrame(editor)
	if (!frame) return
	const state = getProblemState(frame)
	if (state.status === 'flawed') return
	void recordEvidence({ kind: 'exposure', concept: state.concept, problemId: state.problemId })
}
