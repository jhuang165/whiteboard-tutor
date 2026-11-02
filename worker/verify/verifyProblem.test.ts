import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it } from 'vitest'
import { buildVerifyRequest, parseVerifyOutput, usedCodeExecution, verifyProblem, VERIFY_MODEL } from './verifyProblem'

type Block = Anthropic.Messages.ContentBlock

const text = (value: string) => ({ type: 'text', text: value, citations: null }) as unknown as Block
const bashResult = (return_code: number) =>
	({
		type: 'bash_code_execution_tool_result',
		tool_use_id: 'srvtoolu_1',
		content: { type: 'bash_code_execution_result', stdout: '1/6', stderr: '', return_code, content: [] },
	}) as unknown as Block

const answer = { status: 'checked', answer: '1/6 ≈ 0.1667', method: 'Count 6 of 36 outcomes.', issue: '' }

describe('buildVerifyRequest', () => {
	it('uses code execution, high effort, and a strict JSON schema', () => {
		const request = buildVerifyRequest('Two dice: P(sum = 7)?')
		expect(request.model).toBe(VERIFY_MODEL)
		expect(request.thinking).toEqual({ type: 'adaptive' })
		expect(request.tools).toEqual([{ type: 'code_execution_20260521', name: 'code_execution' }])
		expect(request.output_config?.effort).toBe('high')
		expect(request.output_config?.format).toMatchObject({
			type: 'json_schema',
			schema: { additionalProperties: false, required: ['status', 'answer', 'method', 'issue'] },
		})
		expect(request.messages).toEqual([{ role: 'user', content: 'Problem:\n\nTwo dice: P(sum = 7)?' }])
	})
})

describe('parseVerifyOutput', () => {
	it('reads the last text block that matches the schema', () => {
		const content = [text('Let me compute this.'), bashResult(0), text(JSON.stringify(answer))]
		expect(parseVerifyOutput(content)).toEqual(answer)
	})

	it('tolerates prose around the JSON', () => {
		expect(parseVerifyOutput([text(`Here it is:\n${JSON.stringify(answer)}\nDone.`)])).toEqual(answer)
	})

	it('rejects replies without a valid status', () => {
		expect(parseVerifyOutput([text('{"status": "maybe", "answer": "x", "method": "y"}')])).toBeNull()
		expect(parseVerifyOutput([text('no json here')])).toBeNull()
	})
})

describe('usedCodeExecution', () => {
	it('counts only runs that exited 0', () => {
		expect(usedCodeExecution([bashResult(0)])).toBe(true)
		expect(usedCodeExecution([bashResult(1)])).toBe(false)
		expect(usedCodeExecution([text('just prose')])).toBe(false)
	})
})

describe('verifyProblem', () => {
	/** A client whose `messages.stream().finalMessage()` returns the given messages in order. */
	function fakeClient(messages: Partial<Anthropic.Messages.Message>[]) {
		const calls: Anthropic.Messages.MessageStreamParams[] = []
		const client = {
			messages: {
				stream(params: Anthropic.Messages.MessageStreamParams) {
					calls.push(structuredClone(params))
					const message = messages[calls.length - 1]
					return {
						finalMessage: async () => ({
							model: VERIFY_MODEL,
							usage: { input_tokens: 1, output_tokens: 1 },
							...message,
						}),
					}
				},
			},
		} as unknown as Anthropic
		return { client, calls }
	}

	it('resumes after pause_turn and reports whether code ran', async () => {
		const paused = [text('Checking.'), bashResult(0)]
		const { client, calls } = fakeClient([
			{ stop_reason: 'pause_turn', content: paused },
			{ stop_reason: 'end_turn', content: [text(JSON.stringify(answer))] },
		])
		const result = await verifyProblem(client, 'Two dice: P(sum = 7)?')
		expect(result).toEqual({ ...answer, checkedWithCode: true })
		expect(calls).toHaveLength(2)
		expect(calls[1].messages.at(-1)).toEqual({ role: 'assistant', content: paused })
	})

	it('marks an answer found without code', async () => {
		const { client } = fakeClient([{ stop_reason: 'end_turn', content: [text(JSON.stringify(answer))] }])
		expect((await verifyProblem(client, 'p')).checkedWithCode).toBe(false)
	})

	it('throws on a refusal or a reply that is not the schema', async () => {
		await expect(verifyProblem(fakeClient([{ stop_reason: 'refusal', content: [] }]).client, 'p')).rejects.toThrow(
			'declined'
		)
		await expect(
			verifyProblem(fakeClient([{ stop_reason: 'end_turn', content: [text('6/36')] }]).client, 'p')
		).rejects.toThrow('expected JSON')
	})
})
