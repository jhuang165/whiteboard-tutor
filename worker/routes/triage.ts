import { IRequest, json } from 'itty-router'
import { z } from 'zod'
import { TriageResponse } from '../../shared/tutor/triage'
import { createAnthropicClient } from '../anthropicClient'
import { getLearnerStub, isLearnerId } from '../do/LearnerDurableObject'
import { Environment } from '../environment'
import { triageWork } from '../triage/triageWork'

/** About 3 MB of base64: a frame-sized JPEG is far smaller. */
const MAX_IMAGE_CHARS = 4_000_000

const TriageShapeBody = z.object({
	id: z.string().min(1).max(64),
	author: z.enum(['student', 'tutor']),
	type: z.string().max(40),
	text: z.string().max(2000).optional(),
	x: z.number(),
	y: z.number(),
	w: z.number(),
	h: z.number(),
})

const TriageBody = z.object({
	learnerId: z.string().refine(isLearnerId),
	problemId: z.string().min(1).max(64),
	title: z.string().max(200),
	statement: z.string().min(1).max(4000),
	image: z.string().startsWith('data:image/jpeg;base64,').max(MAX_IMAGE_CHARS),
	shapes: z.array(TriageShapeBody).max(200),
})

const NO: TriageResponse = { intervene: false, reason: '', shapeId: '' }

/**
 * Proactive watching (pedagogy-spec W1): should the tutor step in on this work? The checked
 * answer comes from the learner store, never from the client. Any failure is a no.
 */
export async function triage(request: IRequest, env: Environment) {
	const parsed = TriageBody.safeParse(await request.json().catch(() => null))
	if (!parsed.success) return json({ ...NO, error: 'Bad request' } satisfies TriageResponse, { status: 400 })
	const { learnerId, ...work } = parsed.data

	try {
		const verified = await getLearnerStub(env, learnerId).getVerification(work.problemId)
		// A flawed problem is the tutor's mistake, not the student's (V2): nothing to flag.
		if (verified?.status === 'flawed') return json({ ...NO, reason: 'The problem is flawed' })
		const decision = await triageWork(createAnthropicClient(env), { ...work, verified })
		return json(decision satisfies TriageResponse)
	} catch (error) {
		console.error('triage error:', error)
		const message = error instanceof Error ? error.message : String(error)
		return json({ ...NO, error: message } satisfies TriageResponse)
	}
}
