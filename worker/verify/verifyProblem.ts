import type Anthropic from '@anthropic-ai/sdk'
import { ProblemVerification, VERIFY_OUTPUT_SCHEMA } from '../../shared/tutor/verification'

/** The verifier runs on the strongest model at high effort (anthropic-backend skill, `/verify`). */
export const VERIFY_MODEL = 'claude-opus-5-5'
const MAX_TOKENS = 16000
/** Server-side tool loops stop with `pause_turn` after 10 iterations; resume this many times. */
const MAX_CONTINUATIONS = 3

const VERIFY_SYSTEM_PROMPT = `You check practice problems for a probability and statistics tutor before a student is graded on them.

Solve the problem yourself, independently. Then verify the answer with code: exact enumeration or exact arithmetic (fractions, sympy) where possible, and simulation only as a cross-check. Report the answer exactly (a fraction first, then a decimal to 4 places when that helps).

Set status to "flawed" if the problem is ambiguous, under-specified, inconsistent, or has no single correct answer; put one plain sentence on what is wrong in "issue", addressed to the student. Otherwise set status to "checked" and leave "issue" empty.

"method" is two to four short sentences: the approach and the key intermediate values, so a tutor can compare a student's method to it.`

export function buildVerifyRequest(statement: string): Anthropic.Messages.MessageStreamParams {
	return {
		model: VERIFY_MODEL,
		max_tokens: MAX_TOKENS,
		system: VERIFY_SYSTEM_PROMPT,
		messages: [{ role: 'user', content: `Problem:\n\n${statement}` }],
		thinking: { type: 'adaptive' },
		output_config: { effort: 'high', format: { type: 'json_schema', schema: { ...VERIFY_OUTPUT_SCHEMA } } },
		tools: [{ type: 'code_execution_20260521', name: 'code_execution' }],
	}
}

/**
 * Solve and check a problem. Resumes `pause_turn` stops from the server-side tool loop, then
 * reads the structured answer from the last text block.
 */
export async function verifyProblem(client: Anthropic, statement: string): Promise<ProblemVerification> {
	const request = buildVerifyRequest(statement)
	const messages = [...request.messages]
	let message: Anthropic.Messages.Message | null = null
	let ranCode = false

	for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
		message = await client.messages.stream({ ...request, messages }).finalMessage()
		ranCode ||= usedCodeExecution(message.content)
		logUsage(message)
		if (message.stop_reason !== 'pause_turn') break
		// Send the paused turn back as is; the API resumes from its trailing tool call.
		messages.push({ role: 'assistant', content: message.content as Anthropic.Messages.ContentBlockParam[] })
	}

	if (!message) throw new Error('The verifier returned no message')
	if (message.stop_reason === 'refusal') throw new Error('The verifier declined this problem')
	if (message.stop_reason === 'pause_turn') throw new Error('The verifier did not finish')
	if (message.stop_reason === 'max_tokens') throw new Error('The verifier ran out of tokens')

	const output = parseVerifyOutput(message.content)
	if (!output) throw new Error('The verifier reply was not the expected JSON')
	return { ...output, checkedWithCode: ranCode }
}

/** True when at least one code execution finished with exit code 0. */
export function usedCodeExecution(content: Anthropic.Messages.ContentBlock[]): boolean {
	return content.some(
		(block) =>
			block.type === 'bash_code_execution_tool_result' &&
			block.content.type === 'bash_code_execution_result' &&
			block.content.return_code === 0
	)
}

/**
 * The structured answer: the last text block that parses as the schema. Text before tool
 * calls can be plain prose, so earlier blocks are only a fallback.
 */
export function parseVerifyOutput(
	content: Anthropic.Messages.ContentBlock[]
): Omit<ProblemVerification, 'checkedWithCode'> | null {
	const texts = content.filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text').map((b) => b.text)
	for (const text of texts.reverse()) {
		const start = text.indexOf('{')
		const end = text.lastIndexOf('}')
		if (start === -1 || end <= start) continue
		try {
			const value = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
			if (value.status !== 'checked' && value.status !== 'flawed') continue
			if (typeof value.answer !== 'string' || typeof value.method !== 'string') continue
			return {
				status: value.status,
				answer: value.answer,
				method: value.method,
				issue: typeof value.issue === 'string' ? value.issue : '',
			}
		} catch {
			continue
		}
	}
	return null
}

function logUsage(message: Anthropic.Messages.Message) {
	const { usage } = message
	console.log(
		`[usage] verify ${message.model}: in ${usage.input_tokens}, out ${usage.output_tokens}, ` +
			`stop ${message.stop_reason}`
	)
}
