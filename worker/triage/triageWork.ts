import type Anthropic from '@anthropic-ai/sdk'
import { SERVER_FALLBACK_BETA, toImageBlock } from '../do/anthropicRequest'
import { TRIAGE_OUTPUT_SCHEMA, TriageDecision, TriageRequest } from '../../shared/tutor/triage'
import type { ProblemVerification } from '../../shared/tutor/verification'

/** Triage runs on Sonnet 5.5 at low effort (PLAN §8 #3, decided 2026-11-04). */
export const TRIAGE_MODEL = 'claude-sonnet-5-5'
const MAX_TOKENS = 4000

const TRIAGE_SYSTEM_PROMPT = `You watch a student's handwritten work on a whiteboard math problem and decide whether their tutor should interrupt. The student did not ask for help. Interrupting someone who is thinking is costly, so the default answer is no.

Set "intervene" to true only when all of these hold:
- A line of the student's work has a clear, substantive error: a wrong step, a wrong value, or a misapplied rule that the final answer depends on. Not notation, not style, not a step they skipped, and not a method that differs from the reference but is valid.
- The student has moved past it: there is at least one later line of work after the wrong line. An error on the last line may be one they are still fixing, so leave it.
- The tutor has not already marked that error (tutor shapes are listed with author "tutor").
- You can read the handwriting well enough to be sure. If a read could go another way, do not intervene.

Otherwise set "intervene" to false. A correct answer, correct work in progress, a slow start, scratch work, or an empty board are all no.

"reason" is one plain sentence for the tutor: when intervening, which line is wrong and why, without the correct value; otherwise, why not. "shapeId" is the id of the student shape that holds the earliest error when intervening, from the shape list, else an empty string.

The reference answer and method are for checking only. Never put the answer in "reason".`

export interface TriageInput extends Omit<TriageRequest, 'learnerId' | 'image'> {
	/** Always sent by the app. Eval cases with typed work only can leave it out. */
	image?: string
	verified: ProblemVerification | null
}

export function buildTriageRequest(input: TriageInput): Anthropic.Beta.Messages.MessageCreateParamsNonStreaming {
	const { title, statement, shapes, verified, image } = input
	const reference = verified
		? `Reference answer: ${verified.answer}\nReference method: ${verified.method}`
		: 'No reference answer is available; judge the work on its own.'
	const text = [
		`Problem${title ? `: ${title}` : ''}\n\n${statement}`,
		reference,
		`Shapes in the work area, top to bottom (x, y, w, h in page units):\n${JSON.stringify(shapes)}`,
		image
			? 'The image shows the problem frame: the statement at the top and the work below it.'
			: 'There is no image: all of the work is typed text in the shape list.',
	].join('\n\n')
	const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [{ type: 'text', text }]
	if (image) content.unshift(toImageBlock(image))

	return {
		model: TRIAGE_MODEL,
		max_tokens: MAX_TOKENS,
		system: TRIAGE_SYSTEM_PROMPT,
		messages: [{ role: 'user', content }],
		thinking: { type: 'adaptive' },
		output_config: { effort: 'low', format: { type: 'json_schema', schema: { ...TRIAGE_OUTPUT_SCHEMA } } },
		betas: [SERVER_FALLBACK_BETA],
		fallbacks: 'default',
	}
}

/** Ask the triage model whether to step in. A shapeId not on the board turns a yes into a no. */
export async function triageWork(client: Anthropic, input: TriageInput): Promise<TriageDecision> {
	const request = buildTriageRequest(input)
	const message = await client.beta.messages.stream(request).finalMessage()
	const { usage } = message
	console.log(
		`[usage] triage ${message.model}: in ${usage.input_tokens}, out ${usage.output_tokens}, stop ${message.stop_reason}`
	)
	if (message.stop_reason === 'refusal') throw new Error('Triage declined this work')
	if (message.stop_reason === 'max_tokens') throw new Error('Triage ran out of tokens')

	const decision = parseTriageOutput(message.content)
	if (!decision) throw new Error('The triage reply was not the expected JSON')
	return checkDecision(decision, input)
}

/** Only a student shape in the list can be flagged, so the tutor turn has something to mark. */
export function checkDecision(decision: TriageDecision, input: Pick<TriageInput, 'shapes'>): TriageDecision {
	if (!decision.intervene) return { ...decision, shapeId: '' }
	const flagged = input.shapes.find((shape) => shape.id === decision.shapeId && shape.author === 'student')
	if (!flagged) return { intervene: false, reason: `Flagged an unknown shape: ${decision.reason}`, shapeId: '' }
	return decision
}

/** The decision from the last text block that parses as the schema. */
export function parseTriageOutput(content: { type: string; text?: string }[]): TriageDecision | null {
	const texts = content.filter((b) => b.type === 'text' && typeof b.text === 'string').map((b) => b.text as string)
	for (const text of texts.reverse()) {
		const start = text.indexOf('{')
		const end = text.lastIndexOf('}')
		if (start === -1 || end <= start) continue
		try {
			const value = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
			if (typeof value.intervene !== 'boolean' || typeof value.reason !== 'string') continue
			return {
				intervene: value.intervene,
				reason: value.reason,
				shapeId: typeof value.shapeId === 'string' ? value.shapeId : '',
			}
		} catch {
			continue
		}
	}
	return null
}
