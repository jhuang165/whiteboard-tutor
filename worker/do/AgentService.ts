import Anthropic from '@anthropic-ai/sdk'
import {
	createGoogleGenerativeAI,
	GoogleGenerativeAIProvider,
	GoogleGenerativeAIProviderOptions,
} from '@ai-sdk/google'
import { createOpenAI, OpenAIProvider, OpenAIResponsesProviderOptions } from '@ai-sdk/openai'
import { LanguageModel, ModelMessage, streamText } from 'ai'
import {
	AgentModelDefinition,
	AgentModelName,
	AnthropicEffort,
	AnthropicModelDefinition,
	getAgentModelDefinition,
	isValidModelName,
} from '../../shared/models'
import { DebugPart } from '../../shared/schema/PromptPartDefinitions'
import { AgentAction } from '../../shared/types/AgentAction'
import { AgentMessage } from '../../shared/types/AgentMessage'
import { AgentPrompt } from '../../shared/types/AgentPrompt'
import { Streaming } from '../../shared/types/Streaming'
import { Environment } from '../environment'
import { buildAgentMessages, toModelMessages } from '../prompt/buildMessages'
import { buildSystemPrompt } from '../prompt/buildSystemPrompt'
import { getModelName } from '../prompt/getModelName'
import { createAnthropicClient } from '../anthropicClient'
import { buildAnthropicRequest, getTurnEffort } from './anthropicRequest'
import { closeAndParseJson } from './closeAndParseJson'

export class AgentService {
	openai: OpenAIProvider
	anthropic: Anthropic
	google: GoogleGenerativeAIProvider

	constructor(env: Environment) {
		this.openai = createOpenAI({ apiKey: env.OPENAI_API_KEY })
		this.anthropic = createAnthropicClient(env)
		this.google = createGoogleGenerativeAI({ apiKey: env.GOOGLE_API_KEY })
	}

	/** An AI SDK model, for the OpenAI and Google providers. */
	getModel(modelName: AgentModelName): LanguageModel {
		const modelDefinition = getAgentModelDefinition(modelName)
		switch (modelDefinition.provider) {
			case 'openai':
				return this.openai(modelDefinition.id)
			case 'google':
				return this.google(modelDefinition.id)
			case 'anthropic':
				throw new Error('Anthropic models use the official SDK, not the AI SDK')
		}
	}

	async *stream(prompt: AgentPrompt): AsyncGenerator<Streaming<AgentAction>> {
		try {
			for await (const event of this.streamActions(prompt)) {
				yield event
			}
		} catch (error: any) {
			console.error('Stream error:', error)
			throw error
		}
	}

	private async *streamActions(prompt: AgentPrompt): AsyncGenerator<Streaming<AgentAction>> {
		const modelName = getModelName(prompt)
		if (!isValidModelName(modelName)) {
			throw new Error(`Model ${modelName} is not in AGENT_MODEL_DEFINITIONS`)
		}

		const modelDefinition = getAgentModelDefinition(modelName)
		const systemPrompt = buildSystemPrompt(prompt)
		const promptMessages = buildAgentMessages(prompt)

		// Check for debug flags and log if enabled
		const debugPart = prompt.debug as DebugPart | undefined
		if (debugPart) {
			if (debugPart.logSystemPrompt) {
				const promptWithoutSchema = buildSystemPrompt(prompt, { withSchema: false })
				console.log('[DEBUG] System Prompt (without schema):\n', promptWithoutSchema)
			}
			if (debugPart.logMessages) {
				console.log('[DEBUG] Messages:\n', JSON.stringify(promptMessages, null, 2))
			}
		}

		try {
			const textStream =
				modelDefinition.provider === 'anthropic'
					? this.streamAnthropicText(
							modelDefinition,
							systemPrompt,
							promptMessages,
							getTurnEffort(prompt, modelDefinition)
						)
					: this.streamAiSdkText(modelDefinition, systemPrompt, promptMessages)
			yield* parseActionStream(textStream, modelDefinition.supportsPrefill ? PREFILL : '')
		} catch (error: any) {
			console.error('streamActions error:', error)
			throw error
		}
	}

	/** Claude through the official SDK: adaptive thinking, effort, a cached system prompt, fallbacks. */
	private async *streamAnthropicText(
		definition: AnthropicModelDefinition,
		systemPrompt: string,
		messages: AgentMessage[],
		effort: AnthropicEffort | undefined
	): AsyncGenerator<string> {
		const request = buildAnthropicRequest(definition, systemPrompt, messages, effort)
		const stream = this.anthropic.beta.messages.stream(request)
		for await (const event of stream) {
			if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
				yield event.delta.text
			}
		}

		const message = await stream.finalMessage()
		const { usage } = message
		console.log(
			`[usage] ${message.model} effort ${effort ?? 'default'}: in ${usage.input_tokens}, ` +
				`cache read ${usage.cache_read_input_tokens ?? 0}, cache write ${usage.cache_creation_input_tokens ?? 0}, ` +
				`out ${usage.output_tokens}, stop ${message.stop_reason}`
		)
		if (message.content.some((block) => block.type === 'fallback')) {
			console.warn(`[fallback] ${definition.id} declined; ${message.model} continued`)
		}
		// With fallbacks on, a refusal here means every model in the chain declined.
		if (message.stop_reason === 'refusal') {
			const category = message.stop_details?.category ?? 'unspecified'
			throw new Error(`The model declined this turn (refusal category: ${category}).`)
		}
		if (message.stop_reason === 'max_tokens') {
			console.warn('[usage] hit max_tokens; the last action may be cut off')
		}
	}

	/** OpenAI and Google models stay on the Vercel AI SDK. */
	private async *streamAiSdkText(
		definition: AgentModelDefinition,
		systemPrompt: string,
		agentMessages: AgentMessage[]
	): AsyncGenerator<string> {
		const model = this.getModel(definition.name)
		const messages: ModelMessage[] = [
			{ role: 'system', content: systemPrompt },
			...toModelMessages(agentMessages),
		]

		// Prefill the assistant turn to force the JSON start, where the model allows it.
		if (definition.supportsPrefill) {
			messages.push({ role: 'assistant', content: PREFILL })
		}

		// streamText reports API errors only through onError and then ends the stream quietly,
		// so keep the error and rethrow it after the stream ends.
		let streamError: unknown = null
		const { textStream } = streamText({
			model,
			messages,
			maxOutputTokens: 8192,
			...(definition.supportsTemperature ? { temperature: 0 } : {}),
			providerOptions: getProviderOptions(definition),
			onAbort() {
				console.warn('Stream actions aborted')
			},
			onError: ({ error }) => {
				console.error('Stream text error:', error)
				streamError ??= error
			},
		})
		yield* textStream
		if (streamError) throw streamError
	}
}

/** The start of the JSON reply, for models that accept a prefilled assistant turn. */
const PREFILL = '{"actions": [{"_type":'

/**
 * Turn the model's streaming JSON text into actions. Each action is yielded as it grows
 * (`complete: false`), then once more with `complete: true` when the next one starts or
 * the stream ends.
 */
async function* parseActionStream(
	textStream: AsyncIterable<string>,
	prefill: string
): AsyncGenerator<Streaming<AgentAction>> {
	let buffer = prefill
	let cursor = 0
	let maybeIncompleteAction: AgentAction | null = null

	let startTime = Date.now()
	for await (const text of textStream) {
		buffer += text
		const partialObject = closeAndParseJson(buffer)
		if (!partialObject) continue

		const actions = partialObject.actions
		if (!Array.isArray(actions)) continue
		if (actions.length === 0) continue

		// If the events list is ahead of the cursor, we know we've completed the current event
		// We can complete the event and move the cursor forward
		if (actions.length > cursor) {
			const action = actions[cursor - 1] as AgentAction
			if (action) {
				yield {
					...action,
					complete: true,
					time: Date.now() - startTime,
				}
				maybeIncompleteAction = null
			}
			cursor++
		}

		// Now let's check the (potentially new) current event
		// And let's yield it in its (potentially incomplete) state
		const action = actions[cursor - 1] as AgentAction
		if (action) {
			// If we don't have an incomplete event yet, this is the start of a new one
			if (!maybeIncompleteAction) {
				startTime = Date.now()
			}

			maybeIncompleteAction = action

			// Yield the potentially incomplete event
			yield {
				...action,
				complete: false,
				time: Date.now() - startTime,
			}
		}
	}

	// If we've finished receiving events, but there's still an incomplete event, we need to complete it
	if (maybeIncompleteAction) {
		yield {
			...maybeIncompleteAction,
			complete: true,
			time: Date.now() - startTime,
		}
	}
}

type StreamTextProviderOptions = NonNullable<Parameters<typeof streamText>[0]['providerOptions']>

/**
 * Map a model definition's reasoning preferences to AI SDK provider options. Only the
 * matching provider's options are set; the SDK ignores the rest. Anthropic models don't go
 * through the AI SDK.
 */
function getProviderOptions(definition: AgentModelDefinition): StreamTextProviderOptions {
	switch (definition.provider) {
		case 'anthropic':
			return {}
		case 'google':
			return {
				google: {
					thinkingConfig: { thinkingLevel: definition.thinkingLevel },
				} satisfies GoogleGenerativeAIProviderOptions,
			}
		case 'openai':
			return {
				openai: {
					reasoningEffort: definition.reasoningEffort,
				} satisfies OpenAIResponsesProviderOptions,
			}
	}
}
