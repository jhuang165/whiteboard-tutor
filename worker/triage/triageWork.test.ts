import { describe, expect, it } from 'vitest'
import { TriageShape } from '../../shared/tutor/triage'
import { buildTriageRequest, checkDecision, parseTriageOutput, TRIAGE_MODEL } from './triageWork'

const IMAGE = 'data:image/jpeg;base64,/9j/AAAA'
const shapes: TriageShape[] = [
	{ id: 'line1', author: 'student', type: 'draw', x: 0, y: 100, w: 200, h: 40 },
	{ id: 'line2', author: 'student', type: 'draw', x: 0, y: 150, w: 200, h: 40 },
	{ id: 'hint', author: 'tutor', type: 'unknown', text: 'tutor hint', x: 220, y: 100, w: 100, h: 40 },
]
const input = {
	problemId: 'p1',
	title: 'Two dice',
	statement: 'P(sum = 7)?',
	image: IMAGE,
	shapes,
	verified: { status: 'checked' as const, answer: '1/6', method: 'Count 6 of 36.', issue: '', checkedWithCode: true },
}

describe('buildTriageRequest', () => {
	it('uses Sonnet 5.5 at low effort with a strict schema and fallbacks', () => {
		const request = buildTriageRequest(input)
		expect(request.model).toBe(TRIAGE_MODEL)
		expect(TRIAGE_MODEL).toBe('claude-sonnet-5-5')
		expect(request.thinking).toEqual({ type: 'adaptive' })
		expect(request.output_config?.effort).toBe('low')
		expect(request.output_config?.format).toMatchObject({
			type: 'json_schema',
			schema: { additionalProperties: false, required: ['intervene', 'reason', 'shapeId'] },
		})
		expect(request.fallbacks).toBe('default')
		expect(request).not.toHaveProperty('temperature')
	})

	it('sends the image first, then the problem, the reference, and the shapes', () => {
		const [message] = buildTriageRequest(input).messages
		const content = message.content as { type: string; text?: string; source?: { media_type: string } }[]
		expect(content[0]).toMatchObject({ type: 'image', source: { media_type: 'image/jpeg' } })
		expect(content[1].text).toContain('P(sum = 7)?')
		expect(content[1].text).toContain('Reference answer: 1/6')
		expect(content[1].text).toContain('"id":"line2"')
	})

	it('says when there is no reference answer', () => {
		const [message] = buildTriageRequest({ ...input, verified: null }).messages
		const content = message.content as { text?: string }[]
		expect(content[1].text).toContain('No reference answer')
	})
})

describe('parseTriageOutput', () => {
	it('reads the last JSON text block', () => {
		const decision = { intervene: true, reason: 'Line 1 adds the probabilities.', shapeId: 'line1' }
		expect(parseTriageOutput([{ type: 'text', text: 'thinking' }, { type: 'text', text: JSON.stringify(decision) }])).toEqual(
			decision
		)
	})

	it('returns null without a decision', () => {
		expect(parseTriageOutput([{ type: 'text', text: '{"reason": "x"}' }])).toBeNull()
		expect(parseTriageOutput([])).toBeNull()
	})
})

describe('checkDecision', () => {
	it('keeps a yes on a student shape', () => {
		const decision = { intervene: true, reason: 'r', shapeId: 'line1' }
		expect(checkDecision(decision, input)).toEqual(decision)
	})

	it('turns a yes on a tutor or unknown shape into a no', () => {
		expect(checkDecision({ intervene: true, reason: 'r', shapeId: 'hint' }, input).intervene).toBe(false)
		expect(checkDecision({ intervene: true, reason: 'r', shapeId: 'nope' }, input).intervene).toBe(false)
	})

	it('clears the shape on a no', () => {
		expect(checkDecision({ intervene: false, reason: 'r', shapeId: 'line1' }, input).shapeId).toBe('')
	})
})
