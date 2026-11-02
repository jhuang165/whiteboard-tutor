import { DurableObject } from 'cloudflare:workers'
import { AutoRouter, error } from 'itty-router'
import { AgentAction } from '../../shared/types/AgentAction'
import { AgentPrompt } from '../../shared/types/AgentPrompt'
import { Streaming } from '../../shared/types/Streaming'
import { Environment } from '../environment'
import { AgentService } from './AgentService'
import { getLearnerStub, isLearnerId } from './LearnerDurableObject'

export class AgentDurableObject extends DurableObject<Environment> {
	service: AgentService

	constructor(ctx: DurableObjectState, env: Environment) {
		super(ctx, env)
		this.service = new AgentService(this.env) // swap this with your own service
	}

	private readonly router = AutoRouter({
		catch: (e) => {
			console.error(e)
			return error(e)
		},
	}).post('/stream', (request) => this.stream(request))

	// `fetch` is the entry point for all requests to the Durable Object
	override fetch(request: Request): Response | Promise<Response> {
		return this.router.fetch(request)
	}

	/**
	 * Stream changes from the model.
	 *
	 * @param request - The request object containing the prompt.
	 * @returns A Promise that resolves to a Response object containing the streamed changes.
	 */
	private async stream(request: Request): Promise<Response> {
		const encoder = new TextEncoder()
		const { readable, writable } = new TransformStream()
		const writer = writable.getWriter()

		const response: { changes: Streaming<AgentAction>[] } = { changes: [] }

		;(async () => {
			try {
				const prompt = (await request.json()) as AgentPrompt
				await attachLearnerContext(this.env, prompt)

				for await (const change of this.service.stream(prompt)) {
					response.changes.push(change)
					const data = `data: ${JSON.stringify(change)}\n\n`
					await writer.write(encoder.encode(data))
					await writer.ready
				}
				await writer.close()
			} catch (error: any) {
				console.error('Stream error:', error)

				// Send error through the stream
				const errorData = `data: ${JSON.stringify({ error: error.message })}\n\n`
				try {
					await writer.write(encoder.encode(errorData))
					await writer.close()
				} catch (writeError) {
					await writer.abort(writeError)
				}
			}
		})()

		return new Response(readable, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache, no-transform',
				Connection: 'keep-alive',
				'X-Accel-Buffering': 'no',
				'Transfer-Encoding': 'chunked',
				'Access-Control-Allow-Origin': '*',
				'Access-Control-Allow-Methods': 'POST, OPTIONS',
				'Access-Control-Allow-Headers': 'Content-Type',
			},
		})
	}
}

/**
 * Add what only the worker holds: the learner's evidence summary, and the checked answer to
 * the current problem. Any `verified` the client sent is dropped, so the answer the tutor
 * grades against always comes from the learner store.
 */
async function attachLearnerContext(env: Environment, prompt: AgentPrompt) {
	const problem = prompt.problem?.problem
	if (problem) problem.verified = null

	const learner = prompt.learner
	if (!learner || !isLearnerId(learner.learnerId)) return
	const stub = getLearnerStub(env, learner.learnerId)
	try {
		const [summary, verified] = await Promise.all([
			stub.getSummary(),
			problem ? stub.getVerification(problem.problemId) : Promise.resolve(null),
		])
		learner.summary = summary
		if (problem) problem.verified = verified
	} catch (error) {
		// A missing record should not block the turn; the tutor falls back to solving it (V1).
		console.error('learner context error:', error)
	}
}
