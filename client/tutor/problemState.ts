import { Editor, TLShapeId } from 'tldraw'
import type { ProblemStatus } from '../../shared/schema/PromptPartDefinitions'
import type { VerificationStatus } from '../../shared/tutor/verification'
import type { ProblemFrameShape } from '../shapes/ProblemFrameShapeUtil'

/**
 * A posed problem's attempt state, kept in its frame's meta so it lives with the board.
 * The checked answer is not here: it stays in the worker's learner store.
 */
export interface ProblemState {
	problemId: string
	concept: string
	posedAt: number
	status: ProblemStatus
	hintRungs: string[]
	incorrectChecks: number
	verification: VerificationStatus
	checkedWithCode: boolean
	/** Why the check flagged the problem, when it did. */
	issue: string
}

/** The frame's state, with defaults for frames posed before this state existed. */
export function getProblemState(frame: ProblemFrameShape): ProblemState {
	const meta = frame.meta as Partial<ProblemState>
	return {
		problemId: typeof meta.problemId === 'string' ? meta.problemId : frame.id,
		concept: typeof meta.concept === 'string' ? meta.concept : 'general',
		posedAt: Number(meta.posedAt ?? 0),
		status: meta.status ?? 'open',
		hintRungs: Array.isArray(meta.hintRungs) ? meta.hintRungs : [],
		incorrectChecks: Number(meta.incorrectChecks ?? 0),
		verification: meta.verification ?? 'failed',
		checkedWithCode: meta.checkedWithCode === true,
		issue: typeof meta.issue === 'string' ? meta.issue : '',
	}
}

/** Update a frame's state. The frame is locked, so this ignores the lock, and it skips undo. */
export function updateProblemState(editor: Editor, id: TLShapeId, patch: Partial<ProblemState>) {
	const frame = editor.getShape<ProblemFrameShape>(id)
	if (!frame) return
	editor.run(
		() =>
			editor.updateShape<ProblemFrameShape>({
				id,
				type: 'problem-frame',
				meta: { ...frame.meta, ...patch },
			}),
		{ ignoreShapeLock: true, history: 'ignore' }
	)
}

/** The frame's work area in page space: everything below the header. */
export function getWorkArea(editor: Editor, frame: ProblemFrameShape) {
	const box = editor.getShapePageBounds(frame)
	if (!box) return null
	return { x: box.x, y: box.y + frame.props.headerH, w: box.w, h: box.h - frame.props.headerH }
}

/** Whether a shape's center lies in the frame's work area. */
export function isInWorkArea(editor: Editor, frame: ProblemFrameShape, shapeId: TLShapeId) {
	const work = getWorkArea(editor, frame)
	const box = editor.getShapePageBounds(shapeId)
	if (!work || !box) return false
	const { x, y } = box.center
	return x >= work.x && x <= work.x + work.w && y >= work.y && y <= work.y + work.h
}
