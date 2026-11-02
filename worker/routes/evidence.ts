import { error, IRequest, json } from 'itty-router'
import { z } from 'zod'
import { getLearnerStub, isLearnerId } from '../do/LearnerDurableObject'
import { Environment } from '../environment'

const Concept = z.string().min(1).max(80)
const ProblemId = z.string().min(1).max(64)

const EvidenceBody = z.object({
	learnerId: z.string().refine(isLearnerId),
	event: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('exposure'), concept: Concept, problemId: ProblemId.nullable() }),
		z.object({
			kind: z.literal('solved'),
			concept: Concept,
			problemId: ProblemId,
			hintRungs: z.array(z.string().max(8)).max(20),
			incorrectChecks: z.number().int().min(0).max(100),
		}),
	]),
})

/** Record an evidence event (pedagogy-spec L). The learner store decides the level. */
export async function postEvidence(request: IRequest, env: Environment) {
	const parsed = EvidenceBody.safeParse(await request.json().catch(() => null))
	if (!parsed.success) return error(400, 'Bad request')
	const record = await getLearnerStub(env, parsed.data.learnerId).recordEvidence(parsed.data.event)
	return json({ record })
}

/** A learner's evidence records, newest first. */
export async function getEvidence(request: IRequest, env: Environment) {
	const learnerId = request.query.learnerId
	if (!isLearnerId(learnerId)) return error(400, 'Bad request')
	const records = await getLearnerStub(env, learnerId).listEvidence()
	return json({ records })
}
