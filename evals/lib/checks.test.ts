import { describe, expect, it } from 'vitest'
import {
	checkAllowedActions,
	checkHints,
	checkMarkError,
	checkMarks,
	checkNoLeak,
	checkQuestions,
	checkVerdict,
	containsValue,
	type EvalAction,
	findQuestions,
} from './checks'

const verdict = (v: string): EvalAction => ({ _type: 'verdict', intent: 'Judge the work', verdict: v, shapeIds: ['line1'] })
const markError = (shapeId: string, errorKind = 'slip', label = 'recheck this'): EvalAction => ({
	_type: 'mark-error',
	intent: 'Mark the error',
	shapeId,
	errorKind,
	label,
})
const hint = (rung: string, anchorShapeId: string, text = 'Look at the second line.'): EvalAction => ({
	_type: 'hint',
	intent: 'Hint',
	rung,
	text,
	anchorShapeId,
})
const message = (text: string): EvalAction => ({ _type: 'message', text })

describe('containsValue', () => {
	it('matches whole numbers only', () => {
		expect(containsValue('so P(B) is 0.19.', '0.19')).toBe(true)
		expect(containsValue('10.19 is wrong', '0.19')).toBe(false)
		expect(containsValue('about 0.195', '0.19')).toBe(false)
		expect(containsValue('it is 12/19', '12/19')).toBe(true)
		expect(containsValue('it is 112/19', '12/19')).toBe(false)
	})
})

describe('findQuestions', () => {
	it('counts a repeated question once and skips think text', () => {
		const actions = [
			markError('line2', 'misconception', 'Does B only happen when A happens?'),
			{ ...markError('line2'), intent: 'Does B only happen when A happens?' },
			{ _type: 'think', text: 'Is this right? Maybe?' },
			message('Good start. What happens when A is false?'),
		]
		expect(findQuestions(actions)).toEqual(['Does B only happen when A happens?', 'What happens when A is false?'])
	})

	it('keeps decimals inside a question', () => {
		expect(findQuestions([message('It gives P(B|not A) = 0.1, so what is missing?')])).toEqual([
			'It gives P(B|not A) = 0.1, so what is missing?',
		])
	})
})

describe('checks', () => {
	it('verdict wants exactly one of the expected kind', () => {
		expect(checkVerdict([verdict('incorrect')], 'incorrect').pass).toBe(true)
		expect(checkVerdict([verdict('correct')], 'incorrect').pass).toBe(false)
		expect(checkVerdict([verdict('incorrect'), verdict('incorrect')], 'incorrect').pass).toBe(false)
		expect(checkVerdict([], 'none').pass).toBe(true)
	})

	it('mark-error must target the earliest error with the right kind', () => {
		expect(checkMarkError([markError('line2', 'slip')], 'line2', 'slip').pass).toBe(true)
		expect(checkMarkError([markError('shape:line2', 'slip')], 'line2', 'slip').pass).toBe(true)
		expect(checkMarkError([markError('line3', 'slip')], 'line2', 'slip').pass).toBe(false)
		expect(checkMarkError([markError('line2', 'misconception')], 'line2', 'slip').pass).toBe(false)
		expect(checkMarkError([], 'none').pass).toBe(true)
		expect(checkMarkError([markError('line2')], 'none').pass).toBe(false)
	})

	it('hints check count, rung, and anchor', () => {
		expect(checkHints([hint('H2', 'line2')], 1, ['H1', 'H2'], ['line2']).pass).toBe(true)
		expect(checkHints([hint('H5', 'line2')], 1, ['H1', 'H2'], ['line2']).pass).toBe(false)
		expect(checkHints([hint('H1', 'problem')], 1, ['H1'], ['line2']).pass).toBe(false)
		expect(checkHints([hint('H1', 'line2'), hint('H2', 'line2')], 1).pass).toBe(false)
	})

	it('question budget counts across actions', () => {
		const actions = [message('What is P(not A)?'), hint('H2', 'line2', 'Which cases make B happen?')]
		expect(checkQuestions(actions, 1).pass).toBe(false)
		expect(checkQuestions([message('Here is why.')], 0).pass).toBe(true)
	})

	it('mark budget counts new board marks only', () => {
		expect(checkMarks([message('hi'), hint('H1', 'line2')], 1).pass).toBe(true)
		expect(checkMarks([hint('H1', 'line2'), verdict('incorrect')], 1).pass).toBe(false)
	})

	it('no-leak looks at visible text, not think', () => {
		expect(checkNoLeak([{ _type: 'think', text: 'answer is 0.19' }], ['0.19']).pass).toBe(true)
		expect(checkNoLeak([message('P(B) should be 0.19')], ['0.19']).pass).toBe(false)
		expect(checkNoLeak([markError('line2', 'slip', 'sum is 21')], ['21']).pass).toBe(false)
	})

	it('flags actions outside the mode', () => {
		expect(checkAllowedActions([message('x'), { _type: 'delete' }], ['message']).pass).toBe(false)
	})
})
