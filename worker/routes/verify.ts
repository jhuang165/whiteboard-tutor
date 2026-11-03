import { ExecutionContext } from '@cloudflare/workers-types'
import { IRequest, json } from 'itty-router'
import { z } from 'zod'
import { VerifyResponse } from '../../shared/tutor/verification'
import { createAnthropicClient } from '../anthropicClient'
import { getLearnerStub, isLearnerId } from '../do/LearnerDurableObject'
import { Environment } from '../environment'
import { verifyProblem } from '../verify/verifyProblem'

const VerifyBody = z.object({
	learnerId: z.string().refine(isLearnerId),
	problemId: z.string().min(1).max(64),
	title: z.string().max(200),
	statement: z.string().min(1).max(4000),
	concept: z.string().min(1).max(80),
})

/**
 * Solve a posed problem with code execution and store the answer in the learner's store
 * (pedagogy-spec V1, V2). The reply says only whether it checked out: the answer stays
 * server-side and reaches the tutor through its prompt.
 */
export async function verify(request: IRequest, env: Environment, ctx: ExecutionContext) {
	const parsed = VerifyBody.safeParse(await request.json().catch(() => null))
	if (!parsed.success) {
		return json({ status: 'failed', checkedWithCode: false, error: 'Bad request' } satisfies VerifyResponse, {
			status: 400,
		})
	}
	const { learnerId, problemId, title, statement, concept } = parsed.data

	const learner = getLearnerStub(env, learnerId)
	await learner.notePosed({ problemId, concept, title, statement })

	const check = (async () => {
		try {
			const result = await verifyProblem(createAnthropicClient(env), title ? `${title}\n\n${statement}` : statement)
			await learner.saveVerification({ problemId, concept, title, statement }, result)
			return result
		} catch (error) {
			await learner.noteCheckFailed(problemId).catch(() => {})
			throw error
		}
	})()
	// Finish and store the check even if the browser stops waiting for it.
	ctx.waitUntil(check.catch(() => {}))

	try {
		const result = await check
		return json({
			status: result.status,
			checkedWithCode: result.checkedWithCode,
			...(result.status === 'flawed' ? { issue: result.issue } : {}),
		} satisfies VerifyResponse)
	} catch (error) {
		console.error('verify error:', error)
		const message = error instanceof Error ? error.message : String(error)
		return json({ status: 'failed', checkedWithCode: false, error: message } satisfies VerifyResponse)
	}
}
