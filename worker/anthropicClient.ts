import Anthropic from '@anthropic-ai/sdk'
import { normalizeAnthropicBaseUrl } from './do/anthropicRequest'
import { Environment } from './environment'

/** The Anthropic client, with every setting explicit so the SDK never reads ANTHROPIC_* from a host shell. */
export function createAnthropicClient(env: Environment): Anthropic {
	return new Anthropic({
		// null, not undefined: undefined makes the SDK read ANTHROPIC_API_KEY from the environment.
		apiKey: env.ANTHROPIC_API_KEY || null,
		authToken: null,
		baseURL: normalizeAnthropicBaseUrl(env.ANTHROPIC_BASE_URL),
	})
}
