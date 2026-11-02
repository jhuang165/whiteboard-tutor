import type { LearnerDurableObject } from './do/LearnerDurableObject'

export interface Environment {
	AGENT_DURABLE_OBJECT: DurableObjectNamespace
	LEARNER_DURABLE_OBJECT: DurableObjectNamespace<LearnerDurableObject>
	OPENAI_API_KEY: string
	ANTHROPIC_API_KEY: string
	/** Dev only: point at the local Claude Code bridge (`npm run bridge`) instead of the API. */
	ANTHROPIC_BASE_URL?: string
	GOOGLE_API_KEY: string
}
