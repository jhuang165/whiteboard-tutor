import { ExecutionContext } from '@cloudflare/workers-types'
import { WorkerEntrypoint } from 'cloudflare:workers'
import { AutoRouter, cors, error, IRequest } from 'itty-router'
import { Environment } from './environment'
import { getEvidence, getHistory, postEvidence } from './routes/evidence'
import { stream } from './routes/stream'
import { verify } from './routes/verify'

const { preflight, corsify } = cors({ origin: '*' })

const router = AutoRouter<IRequest, [env: Environment, ctx: ExecutionContext]>({
	before: [preflight],
	finally: [corsify],
	catch: (e) => {
		console.error(e)
		return error(e)
	},
})
	.post('/stream', stream)
	.post('/verify', verify)
	.post('/evidence', postEvidence)
	.get('/evidence', getEvidence)
	.get('/history', getHistory)

export default class extends WorkerEntrypoint<Environment> {
	override fetch(request: Request): Promise<Response> {
		return router.fetch(request, this.env, this.ctx)
	}
}

// Make the durable objects available to the cloudflare worker
export { AgentDurableObject } from './do/AgentDurableObject'
export { LearnerDurableObject } from './do/LearnerDurableObject'
