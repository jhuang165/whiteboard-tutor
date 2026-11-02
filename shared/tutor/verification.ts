/**
 * Answer verification for posed problems (pedagogy-spec V1, V2). The worker solves each
 * problem with code execution and keeps the answer server-side; the client only learns
 * whether the problem checked out.
 */

/** Where a problem frame's check stands, shown on the frame. */
export type VerificationStatus = 'pending' | 'checked' | 'flawed' | 'failed'

/** The worker's private solution, attached to the tutor's prompt and never sent to the client. */
export interface ProblemVerification {
	status: 'checked' | 'flawed'
	/** The final answer, exact where possible (a fraction, then a decimal). */
	answer: string
	/** A few lines on how it was solved, for grading the student's method. */
	method: string
	/** Why the problem is flawed (V2), or an empty string. */
	issue: string
	/** Whether code actually ran. False through the dev bridge, which has no sandbox. */
	checkedWithCode: boolean
}

export interface VerifyRequest {
	learnerId: string
	problemId: string
	title: string
	statement: string
	concept: string
}

export interface VerifyResponse {
	status: Exclude<VerificationStatus, 'pending'>
	checkedWithCode: boolean
	/** Set when the problem is flawed. */
	issue?: string
	/** Set when the check itself failed. */
	error?: string
}

/** Structured output schema for the verifier's final answer. */
export const VERIFY_OUTPUT_SCHEMA = {
	type: 'object',
	properties: {
		status: { type: 'string', enum: ['checked', 'flawed'] },
		answer: { type: 'string' },
		method: { type: 'string' },
		issue: { type: 'string' },
	},
	required: ['status', 'answer', 'method', 'issue'],
	additionalProperties: false,
} as const
