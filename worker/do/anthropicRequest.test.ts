import { describe, expect, it } from 'vitest'
import { AGENT_MODEL_DEFINITIONS, type AnthropicModelDefinition } from '../../shared/models'
import type { AgentPrompt } from '../../shared/types/AgentPrompt'
import {
	buildAnthropicRequest,
	getTurnEffort,
	normalizeAnthropicBaseUrl,
	SERVER_FALLBACK_BETA,
	toAnthropicMessages,
} from './anthropicRequest'

const opus = AGENT_MODEL_DEFINITIONS['claude-opus-5-5'] as AnthropicModelDefinition
const haiku = AGENT_MODEL_DEFINITIONS['claude-haiku-5-5'] as AnthropicModelDefinition

const turn = (intent?: string) =>
	(intent ? { tutorTurn: { type: 'tutorTurn', intent, hintsGiven: 0 } } : {}) as unknown as AgentPrompt

describe('getTurnEffort', () => {
	it('picks effort from the tutor button', () => {
		expect(getTurnEffort(turn('hint'), opus)).toBe('low')
		expect(getTurnEffort(turn('explain'), opus)).toBe('medium')
		expect(getTurnEffort(turn('wait-what'), opus)).toBe('medium')
		expect(getTurnEffort(turn('check'), opus)).toBe('medium')
		expect(getTurnEffort(turn('quiz'), opus)).toBe('medium')
	})

	it("keeps the model's default for chat and non-tutor turns", () => {
		expect(getTurnEffort(turn('chat'), haiku)).toBe('low')
		expect(getTurnEffort(turn(), opus)).toBe('medium')
	})
})

describe('buildAnthropicRequest', () => {
	it('caches the system prompt and sets thinking, effort, and fallbacks', () => {
		const request = buildAnthropicRequest(opus, 'rules', [{ role: 'user', content: [{ type: 'text', text: 'hi' }], priority: 0 }], 'low')
		expect(request.system).toEqual([{ type: 'text', text: 'rules', cache_control: { type: 'ephemeral' } }])
		expect(request.thinking).toEqual({ type: 'adaptive' })
		expect(request.output_config).toEqual({ effort: 'low' })
		expect(request.betas).toEqual([SERVER_FALLBACK_BETA])
		expect(request.fallbacks).toBe('default')
		expect(request).not.toHaveProperty('temperature')
	})

	it('leaves fallbacks off for Haiku 5.5, which has none', () => {
		const request = buildAnthropicRequest(haiku, 'rules', [], 'low')
		expect(request).not.toHaveProperty('fallbacks')
		expect(request).not.toHaveProperty('betas')
	})
})

describe('toAnthropicMessages', () => {
	it('turns data URLs into base64 image blocks', () => {
		const [message] = toAnthropicMessages([
			{
				role: 'user',
				priority: 0,
				content: [
					{ type: 'image', image: 'data:image/png;base64,AAAA' },
					{ type: 'text', text: 'board' },
				],
			},
		])
		expect(message.content).toEqual([
			{ type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'AAAA' } },
			{ type: 'text', text: 'board' },
		])
	})
})

describe('normalizeAnthropicBaseUrl', () => {
	it('accepts the old /v1 form and defaults to the API', () => {
		expect(normalizeAnthropicBaseUrl('http://127.0.0.1:8790/v1')).toBe('http://127.0.0.1:8790')
		expect(normalizeAnthropicBaseUrl('http://127.0.0.1:8790/')).toBe('http://127.0.0.1:8790')
		expect(normalizeAnthropicBaseUrl(undefined)).toBe('https://api.anthropic.com')
	})
})
