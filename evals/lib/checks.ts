import type { EvalCase } from './EvalCase'

/** A completed action from the model, loosely typed so a malformed one still gets judged. */
export type EvalAction = { _type: string } & Record<string, unknown>

export interface CheckResult {
	check: string
	rule: string
	pass: boolean
	detail: string
}

/** Actions that put a new mark on the board (C4). */
const MARK_ACTIONS = new Set(['hint', 'mark-error', 'verdict', 'pose-problem', 'write-math', 'create', 'pen'])

/** Fields the student can read: chat text, board text, labels, and the action summaries the chat shows. */
const VISIBLE_KEYS = new Set(['text', 'label', 'intent'])

/**
 * Board content the student reads that isn't the tutor asking them something: math and posed
 * problems. Checked for leaks, not counted as questions.
 */
const CONTENT_KEYS = new Set(['latex', 'title', 'statement'])

/**
 * Every deterministic check that the case's expectations ask for. `allowedActions` is the
 * working mode's action list.
 */
export function runChecks(evalCase: EvalCase, actions: EvalAction[], allowedActions: readonly string[]): CheckResult[] {
	const expect = evalCase.expect
	const results: CheckResult[] = [checkAllowedActions(actions, allowedActions)]

	if (expect.verdict) results.push(checkVerdict(actions, expect.verdict))
	if (expect.markErrorOn) results.push(checkMarkError(actions, expect.markErrorOn, expect.errorKind))
	if (expect.hints !== undefined) results.push(checkHints(actions, expect.hints, expect.hintRungs, expect.hintAnchorIn))
	if (expect.maxQuestions !== undefined) results.push(checkQuestions(actions, expect.maxQuestions))
	if (expect.posesProblem !== undefined) results.push(checkPosedProblems(actions, expect.posesProblem))
	if (expect.maxMarks !== undefined) results.push(checkMarks(actions, expect.maxMarks))
	if (expect.forbidden?.length) results.push(checkNoLeak(actions, expect.forbidden))

	return results
}

export function checkAllowedActions(actions: EvalAction[], allowed: readonly string[]): CheckResult {
	const extra = actions.map((a) => a._type).filter((type) => !allowed.includes(type))
	return {
		check: 'only-mode-actions',
		rule: 'C1',
		pass: extra.length === 0,
		detail: extra.length === 0 ? 'every action is in the working mode' : `actions outside the mode: ${extra.join(', ')}`,
	}
}

export function checkVerdict(actions: EvalAction[], expected: 'correct' | 'incorrect' | 'none'): CheckResult {
	const verdicts = actions.filter((a) => a._type === 'verdict').map((a) => String(a.verdict))
	const pass = expected === 'none' ? verdicts.length === 0 : verdicts.length === 1 && verdicts[0] === expected
	return {
		check: 'verdict',
		rule: 'M3',
		pass,
		detail: `expected ${expected === 'none' ? 'no verdict' : `one ${expected} verdict`}, got [${verdicts.join(', ')}]`,
	}
}

export function checkMarkError(
	actions: EvalAction[],
	expectedShape: string,
	expectedKind?: 'slip' | 'misconception'
): CheckResult {
	const marks = actions.filter((a) => a._type === 'mark-error')
	const got = marks.map((m) => `${simpleId(m.shapeId)} (${String(m.errorKind)})`).join(', ')

	if (expectedShape === 'none') {
		return { check: 'earliest-error', rule: 'M3', pass: marks.length === 0, detail: `expected no error mark, got [${got}]` }
	}

	const [mark] = marks
	const onShape = marks.length === 1 && simpleId(mark.shapeId) === expectedShape
	const kindOk = !expectedKind || mark?.errorKind === expectedKind
	return {
		check: 'earliest-error',
		rule: expectedKind ? 'M3, E1' : 'M3',
		pass: onShape && kindOk,
		detail: `expected one mark on ${expectedShape}${expectedKind ? ` (${expectedKind})` : ''}, got [${got}]`,
	}
}

export function checkHints(
	actions: EvalAction[],
	expectedCount: number,
	rungs?: string[],
	anchors?: string[]
): CheckResult {
	const hints = actions.filter((a) => a._type === 'hint')
	const problems: string[] = []
	if (hints.length !== expectedCount) problems.push(`expected ${expectedCount} hint(s), got ${hints.length}`)
	for (const hint of hints) {
		if (rungs && !rungs.includes(String(hint.rung))) problems.push(`rung ${String(hint.rung)} not in ${rungs.join('/')}`)
		const anchor = simpleId(hint.anchorShapeId)
		if (anchors && !anchors.includes(anchor)) problems.push(`anchored to ${anchor || 'nothing'}, not ${anchors.join('/')}`)
	}
	const summary = hints.map((h) => `${String(h.rung)} on ${simpleId(h.anchorShapeId)}`).join(', ')
	return {
		check: 'one-hint-rung',
		rule: 'H, C2',
		pass: problems.length === 0,
		detail: problems.length === 0 ? `hints: [${summary}]` : problems.join('; '),
	}
}

export function checkQuestions(actions: EvalAction[], max: number): CheckResult {
	const questions = findQuestions(actions)
	return {
		check: 'question-budget',
		rule: max === 0 ? 'Q2' : 'Q1',
		pass: questions.length <= max,
		detail: `${questions.length} question(s), max ${max}${questions.length ? `: ${questions.map((q) => `"${q}"`).join(' | ')}` : ''}`,
	}
}

export function checkPosedProblems(actions: EvalAction[], expectedCount: number): CheckResult {
	const posed = actions.filter((a) => a._type === 'pose-problem')
	const problems: string[] = []
	if (posed.length !== expectedCount) problems.push(`expected ${expectedCount} posed problem(s), got ${posed.length}`)
	for (const action of posed) {
		const missing = ['concept', 'title', 'statement'].filter((key) => !String(action[key] ?? '').trim())
		if (missing.length) problems.push(`a problem is missing ${missing.join(', ')}`)
	}
	return {
		check: 'poses-problem',
		rule: 'M4',
		pass: problems.length === 0,
		detail:
			problems.length === 0
				? `posed: [${posed.map((a) => `${String(a.concept)}: ${String(a.title)}`).join('; ')}]`
				: problems.join('; '),
	}
}

export function checkMarks(actions: EvalAction[], max: number): CheckResult {
	const marks = actions.filter((a) => MARK_ACTIONS.has(a._type)).map((a) => a._type)
	return {
		check: 'mark-budget',
		rule: 'C4',
		pass: marks.length <= max,
		detail: `${marks.length} new mark(s), max ${max}${marks.length ? `: ${marks.join(', ')}` : ''}`,
	}
}

export function checkNoLeak(actions: EvalAction[], forbidden: string[]): CheckResult {
	const text = [...visibleText(actions), ...visibleText(actions, CONTENT_KEYS)].join('\n')
	const leaked = forbidden.filter((value) => containsValue(text, value))
	return {
		check: 'no-answer-leak',
		rule: 'M2, H',
		pass: leaked.length === 0,
		detail: leaked.length === 0 ? `none of ${forbidden.join(', ')} appear` : `leaked: ${leaked.join(', ')}`,
	}
}

/**
 * Distinct questions in the student-visible text. A question the tutor repeats, such as a
 * mark's label echoed in its intent, counts once.
 */
export function findQuestions(actions: EvalAction[]): string[] {
	const questions = new Map<string, string>()
	for (const text of visibleText(actions)) {
		// A sentence ends at ?, !, a newline, or a period not inside a number like 0.1.
		for (const match of text.matchAll(/(?:[^.?!\n]|\.(?=\d))*\?/g)) {
			const question = match[0].trim()
			const key = question.toLowerCase().replace(/[^a-z0-9|()]+/g, ' ').trim()
			if (key && !questions.has(key)) questions.set(key, question)
		}
	}
	return [...questions.values()]
}

/** The student-visible strings in every action except `think`, which the chat collapses. */
export function visibleText(actions: EvalAction[], keys: ReadonlySet<string> = VISIBLE_KEYS): string[] {
	const out: string[] = []
	const walk = (value: unknown, key?: string) => {
		if (typeof value === 'string') {
			if (key && keys.has(key)) out.push(value)
		} else if (Array.isArray(value)) {
			value.forEach((item) => walk(item, key))
		} else if (value && typeof value === 'object') {
			for (const [k, v] of Object.entries(value)) walk(v, k)
		}
	}
	for (const action of actions) if (action._type !== 'think') walk(action)
	return out
}

/**
 * Whether `text` contains `value` as a whole value: "0.19" matches "is 0.19." but not
 * "10.19" or "0.195".
 */
export function containsValue(text: string, value: string): boolean {
	const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
	const before = /^[\d.]/.test(value) ? '(?<![\\d.])' : ''
	const after = /[\d.]$/.test(value) ? '(?!\\d)' : ''
	return new RegExp(`${before}${escaped}${after}`, 'i').test(text)
}

function simpleId(id: unknown): string {
	return typeof id === 'string' ? id.replace(/^shape:/, '') : ''
}
