import type { DiagramKind } from '../../shared/diagram/DiagramSpec'
import type { BlurryShape } from '../../shared/format/BlurryShape'
import type { AgentModelName } from '../../shared/models'
import type { ProblemPart } from '../../shared/schema/PromptPartDefinitions'
import type { ConceptSummary } from '../../shared/tutor/evidence'
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
	/** On a `quiz` case, the due review the student started from the review queue (L4). */
	reviewConcept?: string
	/** On a `watch` case, what the triage check flagged (M8). */
	watchReason?: string
	/** The student's message. Defaults to the pressed button's message. */
	message?: string
	/** Defaults to the app's default model. */
	model?: AgentModelName
	/**
	 * A problem posed in a problem frame, if the case has one. Its shapeId must not be on the
	 * board. Set `verified` to the checked answer the worker would attach.
	 */
	problem?: NonNullable<ProblemPart['problem']>
	/** The learner's evidence summary, as the worker would attach it. Defaults to none. */
	learnerSummary?: ConceptSummary[]
	/**
	 * Earlier turns in this chat, oldest first, for cases that depend on what the tutor already
	 * said (a second hint, Wait-what). The current message is not part of it.
	 */
	history?: EvalHistoryTurn[]
	/**
	 * A PNG of the student's view, as a file in `evals/fixtures/`, for cases that need the tutor
	 * to read ink. Without one the model reads the board from the shape list only.
	 */
	screenshot?: string
	/** Student shapes, as the tutor sees them. Ids are simple ids, without `shape:`. */
	board: BoardShape[]
	expect: EvalExpectations
}

export type BoardShape = Omit<BlurryShape, 'type'> & { type?: BlurryShape['type'] }

/** A student message, or the actions of a tutor turn (as the model streamed them). */
export type EvalHistoryTurn =
	| { role: 'student'; message: string }
	| { role: 'tutor'; actions: ({ _type: string } & Record<string, unknown>)[] }

export type ExpectedVerdict = 'correct' | 'incorrect' | 'none'

export interface EvalExpectations {
	/** Whether doing nothing is a valid reply, as on a Watch turn the tutor disagrees with (M8). */
	allowNoActions?: boolean
	/**
	 * The single verdict the tutor must give, or `none` for no verdict at all. A list allows any
	 * of them, such as `["none", "correct"]` for "anything but an incorrect verdict".
	 */
	verdict?: ExpectedVerdict | ExpectedVerdict[]
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
	/** How many `pose-problem` actions the turn must contain, each with a concept, title, and statement (M4). */
	posesProblem?: number
	/** The concept slugs a posed problem may test, such as the one the learner's record points at (M4). */
	posesConceptIn?: string[]
	/** Most new tutor marks allowed (C4). */
	maxMarks?: number
	/** Strings that must not appear in student-visible text, such as the final answer. */
	forbidden?: string[]
	/**
	 * Content the turn must show the student: each group is a list of alternatives, and at
	 * least one string from every group must appear (such as the answer on a D1 request).
	 */
	required?: string[][]
	/**
	 * Student ink shapes the turn must transcribe before judging (C3). The check also fails
	 * an incorrect verdict or error mark on a shape whose read was low confidence.
	 */
	transcribes?: string[]
	/**
	 * Diagram kinds the turn may draw with `diagram` (M6): at least one diagram of one of these
	 * kinds, and every diagram must parse and lay out cleanly.
	 */
	diagram?: DiagramKind[]
}
