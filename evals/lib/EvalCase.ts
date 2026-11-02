import type { BlurryShape } from '../../shared/format/BlurryShape'
import type { AgentModelName } from '../../shared/models'
import type { TutorIntent } from '../../shared/tutor/TutorIntent'

/**
 * One eval case: a board of student work, the button the student pressed, and what the
 * tutor must and must not do in reply. Stored as `evals/cases/<id>.json`.
 */
export interface EvalCase {
	id: string
	description: string
	/** pedagogy-spec rule ids this case tests. */
	rules: string[]
	intent: TutorIntent
	/** Hint presses before this turn (the hint ladder state). */
	hintsGiven?: number
	/** The student's message. Defaults to the pressed button's message. */
	message?: string
	/** Defaults to the app's default model. */
	model?: AgentModelName
	/** Student shapes, as the tutor sees them. Ids are simple ids, without `shape:`. */
	board: BoardShape[]
	expect: EvalExpectations
}

export type BoardShape = Omit<BlurryShape, 'type'> & { type?: BlurryShape['type'] }

export interface EvalExpectations {
	/** The single verdict the tutor must give, or `none` for no verdict at all. */
	verdict?: 'correct' | 'incorrect' | 'none'
	/** The student shape the single `mark-error` must target, or `none` for no mark. */
	markErrorOn?: string | 'none'
	errorKind?: 'slip' | 'misconception'
	/** How many `hint` actions the turn must contain. */
	hints?: number
	/** Rungs a hint may use. */
	hintRungs?: string[]
	/** Student shapes a hint may anchor to. */
	hintAnchorIn?: string[]
	/** Most questions allowed across the turn's student-visible text (Q1, Q2). */
	maxQuestions?: number
	/** Most new tutor marks allowed (C4). */
	maxMarks?: number
	/** Strings that must not appear in student-visible text, such as the final answer. */
	forbidden?: string[]
}
