import type Anthropic from '@anthropic-ai/sdk'
import type { AnthropicEffort, AnthropicModelDefinition } from '../../shared/models'
import type { TutorTurnPart } from '../../shared/schema/PromptPartDefinitions'
import type { TutorIntent } from '../../shared/tutor/TutorIntent'
import type { AgentMessage } from '../../shared/types/AgentMessage'
import type { AgentPrompt } from '../../shared/types/AgentPrompt'

/**
 * Effort per tutor button (anthropic-backend skill): `low` for hints, `medium` for
 * explaining and reviewing. A chat turn keeps the model's default.
 */
const TUTOR_EFFORT: Partial<Record<TutorIntent, AnthropicEffort>> = {
	hint: 'low',
	explain: 'medium',
	'wait-what': 'medium',
	check: 'medium',
}

export const SERVER_FALLBACK_BETA = 'server-side-fallback-2026-07-01'

const MAX_TOKENS = 16000

export function getTurnEffort(prompt: AgentPrompt, definition: AnthropicModelDefinition): AnthropicEffort | undefined {
	if (!definition.effort) return undefined
	const intent = (prompt.tutorTurn as TutorTurnPart | undefined)?.intent
	return (intent && TUTOR_EFFORT[intent]) || definition.effort
}

/**
 * The Messages API request for one turn. The system prompt (action schemas and the tutor
 * rules) carries the only cache breakpoint; the per-turn parts follow it as user content.
 */
export function buildAnthropicRequest(
	definition: AnthropicModelDefinition,
	systemPrompt: string,
	messages: AgentMessage[],
	effort: AnthropicEffort | undefined
): Anthropic.Beta.Messages.MessageCreateParamsStreaming {
	return {
		model: definition.id,
		max_tokens: MAX_TOKENS,
		stream: true,
		system: [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
		messages: toAnthropicMessages(messages),
		thinking: definition.thinking === 'adaptive' ? { type: 'adaptive' } : { type: 'disabled' },
		...(effort ? { output_config: { effort } } : {}),
		...(definition.serverFallback ? { betas: [SERVER_FALLBACK_BETA], fallbacks: 'default' as const } : {}),
	}
}

export function toAnthropicMessages(messages: AgentMessage[]): Anthropic.Beta.Messages.BetaMessageParam[] {
	return messages.map((message) => ({
		role: message.role,
		content: message.content.map((item): Anthropic.Beta.Messages.BetaContentBlockParam => {
			if (item.type === 'image' && item.image) return toImageBlock(item.image)
			return { type: 'text', text: item.text ?? '' }
		}),
	}))
}

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'] as const
type ImageType = (typeof IMAGE_TYPES)[number]

/** A `data:image/...;base64,` URL from the screenshot part becomes a base64 image block. */
function toImageBlock(dataUrl: string): Anthropic.Beta.Messages.BetaImageBlockParam {
	const match = /^data:(image\/[a-z+]+);base64,(.*)$/s.exec(dataUrl)
	if (!match || !IMAGE_TYPES.includes(match[1] as ImageType)) {
		throw new Error(`Unsupported image for the Anthropic API: ${dataUrl.slice(0, 40)}`)
	}
	return { type: 'image', source: { type: 'base64', media_type: match[1] as ImageType, data: match[2] } }
}

/**
 * The official SDK appends `/v1/messages` itself, while the AI SDK wanted the base URL to end
 * in `/v1`. Accept either form in `.dev.vars`.
 */
export function normalizeAnthropicBaseUrl(url: string | undefined): string {
	return (url || 'https://api.anthropic.com').replace(/\/v1\/?$/, '').replace(/\/$/, '')
}
