export type AgentModelName = keyof typeof AGENT_MODEL_DEFINITIONS
export type AgentModelProvider = 'openai' | 'anthropic' | 'google'

/** Adaptive-thinking mode passed to the Anthropic provider. */
export type AnthropicThinking = 'adaptive' | 'disabled'

/** Effort level passed to the Anthropic provider (Opus 4.6+/Sonnet 4.6+; not supported on Haiku 4.5). */
export type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Reasoning effort passed to the OpenAI provider. */
export type OpenAIReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** Thinking level passed to the Google provider. */
export type GeminiThinkingLevel = 'low' | 'medium' | 'high'

interface BaseAgentModelDefinition {
	name: AgentModelName
	id: string

	/**
	 * Whether the model accepts a prefilled assistant turn to force the JSON start.
	 * Opus 4.6+ and Sonnet 4.6+ reject last-assistant-turn prefills (400).
	 */
	supportsPrefill: boolean

	/**
	 * Whether the model accepts a `temperature` sampling parameter.
	 * Opus 4.7+ and Sonnet 5 removed `temperature`/`top_p`/`top_k` (sending them is a 400).
	 */
	supportsTemperature: boolean
}

export interface AnthropicModelDefinition extends BaseAgentModelDefinition {
	provider: 'anthropic'
	thinking: AnthropicThinking
	/**
	 * Default effort level; omit for models that don't support it (e.g. Haiku 4.5). A tutor
	 * turn can override it by intent (see `worker/do/anthropicRequest.ts`).
	 */
	effort?: AnthropicEffort
	/**
	 * Whether to send server-side `fallbacks: "default"`, which reruns a refused request on
	 * another model. Haiku 5.5 has no server-side fallback.
	 */
	serverFallback: boolean
}

export interface GoogleModelDefinition extends BaseAgentModelDefinition {
	provider: 'google'
	thinkingLevel: GeminiThinkingLevel
}

export interface OpenAIModelDefinition extends BaseAgentModelDefinition {
	provider: 'openai'
	reasoningEffort: OpenAIReasoningEffort
}

export type AgentModelDefinition =
	| AnthropicModelDefinition
	| GoogleModelDefinition
	| OpenAIModelDefinition

export const AGENT_MODEL_DEFINITIONS = {
	// Anthropic models
	// 5.5 models: thinking can't be disabled (adaptive only), and prefill and
	// temperature are rejected. Opus 5.5 and Haiku 5.5 default to `medium` effort,
	// so effort is always set explicitly.
	'claude-opus-5-5': {
		name: 'claude-opus-5-5',
		id: 'claude-opus-5-5',
		provider: 'anthropic',
		supportsPrefill: false,
		supportsTemperature: false,
		thinking: 'adaptive',
		effort: 'medium',
		serverFallback: true,
	},

	'claude-sonnet-5-5': {
		name: 'claude-sonnet-5-5',
		id: 'claude-sonnet-5-5',
		provider: 'anthropic',
		supportsPrefill: false,
		supportsTemperature: false,
		thinking: 'adaptive',
		effort: 'low',
		serverFallback: true,
	},

	'claude-haiku-5-5': {
		name: 'claude-haiku-5-5',
		id: 'claude-haiku-5-5',
		provider: 'anthropic',
		supportsPrefill: false,
		supportsTemperature: false,
		thinking: 'adaptive',
		effort: 'low',
		serverFallback: false,
	},

	'claude-opus-5': {
		name: 'claude-opus-5',
		id: 'claude-opus-5',
		provider: 'anthropic',
		supportsPrefill: false,
		supportsTemperature: false,
		thinking: 'adaptive',
		effort: 'medium',
		serverFallback: true,
	},

	'claude-sonnet-5': {
		name: 'claude-sonnet-5',
		id: 'claude-sonnet-5',
		provider: 'anthropic',
		supportsPrefill: false,
		supportsTemperature: false,
		thinking: 'adaptive',
		effort: 'low',
		serverFallback: false,
	},


	// Google models
	'gemini-3.8-flash': {
		name: 'gemini-3.8-flash',
		id: 'gemini-3.8-flash',
		provider: 'google',
		supportsPrefill: false,
		supportsTemperature: false,
		thinkingLevel: 'low',
	},

	// OpenAI models
	'gpt-5.6-sol': {
		name: 'gpt-5.6-sol',
		id: 'gpt-5.6-sol',
		provider: 'openai',
		supportsPrefill: false,
		supportsTemperature: false,
		reasoningEffort: 'medium',
	},

	'gpt-5.6-terra': {
		name: 'gpt-5.6-terra',
		id: 'gpt-5.6-terra',
		provider: 'openai',
		supportsPrefill: false,
		supportsTemperature: false,
		reasoningEffort: 'high',
	},

	'gpt-5.6-luna': {
		name: 'gpt-5.6-luna',
		id: 'gpt-5.6-luna',
		provider: 'openai',
		supportsPrefill: false,
		supportsTemperature: false,
		reasoningEffort: 'max',
	},
} as const

export const DEFAULT_MODEL_NAME: AgentModelName = 'claude-opus-5-5'

/**
 * Check if a string is a valid AgentModelName.
 */
export function isValidModelName(value: string | undefined): value is AgentModelName {
	return !!value && value in AGENT_MODEL_DEFINITIONS
}

/**
 * Get the full information about a model from its name.
 * @param modelName - The name of the model.
 * @returns The full definition of the model.
 */
export function getAgentModelDefinition(modelName: AgentModelName): AgentModelDefinition {
	const definition = AGENT_MODEL_DEFINITIONS[modelName]
	if (!definition) {
		throw new Error(`Model ${modelName} not found`)
	}
	return definition
}
