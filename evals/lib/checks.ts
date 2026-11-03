import type { EvalCase, ExpectedVerdict } from './EvalCase'

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
const VISIBLE_KEYS = new Set(['text', 'label', 'intent', 'unsure'])

/**
 * The field each action's chat line shows in place of its `intent` (its util's `getInfo`).
 * When that field is set, the intent never reaches the student.
 */
const SHOWN_INSTEAD_OF_INTENT: Record<string, string> = {
	hint: 'text',
	'mark-error': 'label',
	'pose-problem': 'statement',
}

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
	if (expect.posesProblem !== undefined) results.push(checkPosedProblems(actions, expect.posesProblem, expect.posesConceptIn))
	if (expect.maxMarks !== undefined) results.push(checkMarks(actions, expect.maxMarks))
	if (expect.forbidden?.length) results.push(checkNoLeak(actions, expect.forbidden))
	if (expect.required?.length) results.push(checkRequired(actions, expect.required, evalCase.rules))
	if (expect.transcribes?.length) results.push(checkTranscription(actions, expect.transcribes))

	return results
}

/**
 * C3: every listed ink shape is transcribed before the first verdict or error mark, and no
 * incorrect verdict or error mark rests on a low-confidence read.
 */
export function checkTranscription(actions: EvalAction[], shapes: string[]): CheckResult {
	const problems: string[] = []
	const reads = actions.filter((a) => a._type === 'transcribe')
	const readIds = (a: EvalAction) => (Array.isArray(a.shapeIds) ? a.shapeIds.map(String) : [])

	const missing = shapes.filter((id) => !reads.some((r) => readIds(r).includes(id)))
	if (missing.length) problems.push(`not transcribed: ${missing.join(', ')}`)

	const firstRead = actions.findIndex((a) => a._type === 'transcribe')
	const firstJudgment = actions.findIndex((a) => a._type === 'verdict' || a._type === 'mark-error')
	if (firstJudgment !== -1 && (firstRead === -1 || firstRead > firstJudgment)) {
		problems.push('judged before transcribing')
	}

	const unsure = new Set(reads.filter((r) => r.confidence === 'low').flatMap(readIds))
	const judgedUnsure = actions.filter(
		(a) =>
			(a._type === 'mark-error' && unsure.has(String(a.shapeId))) ||
			(a._type === 'verdict' && a.verdict === 'incorrect' && readIds(a).some((id) => unsure.has(id)))
	)
	if (judgedUnsure.length) problems.push(`marked wrong on a low-confidence read: ${judgedUnsure.map((a) => a._type).join(', ')}`)

	return {
		check: 'transcribes-first',
		rule: 'C3',
		pass: problems.length === 0,
		detail: problems.length ? problems.join('; ') : `transcribed ${shapes.join(', ')} before judging`,
	}
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

export function checkVerdict(actions: EvalAction[], expected: ExpectedVerdict | ExpectedVerdict[]): CheckResult {
	const allowed = Array.isArray(expected) ? expected : [expected]
	const verdicts = actions.filter((a) => a._type === 'verdict').map((a) => String(a.verdict))
	const pass =
		verdicts.length === 0
			? allowed.includes('none')
			: verdicts.length === 1 && allowed.includes(verdicts[0] as ExpectedVerdict)
	const describe = allowed.map((v) => (v === 'none' ? 'no verdict' : `one ${v} verdict`)).join(' or ')
	return {
		check: 'verdict',
		rule: 'M3',
		pass,
		detail: `expected ${describe}, got [${verdicts.join(', ')}]`,
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

export function checkPosedProblems(actions: EvalAction[], expectedCount: number, conceptIn?: string[]): CheckResult {
	const posed = actions.filter((a) => a._type === 'pose-problem')
	const problems: string[] = []
	if (posed.length !== expectedCount) problems.push(`expected ${expectedCount} posed problem(s), got ${posed.length}`)
	for (const action of posed) {
		const missing = ['concept', 'title', 'statement'].filter((key) => !String(action[key] ?? '').trim())
		if (missing.length) problems.push(`a problem is missing ${missing.join(', ')}`)
		if (conceptIn && !conceptIn.includes(String(action.concept ?? ''))) {
			problems.push(`concept "${String(action.concept)}" is not one of ${conceptIn.join(', ')}`)
		}
		// A title names the problem; "Problem 3" doesn't tell problems apart later.
		if (/^\s*(practice\s+|review\s+)?(problem|question|quiz)\s*#?\d*\s*$/i.test(String(action.title ?? ''))) {
			problems.push(`title "${String(action.title)}" doesn't name the problem`)
		}
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

/** Each group needs at least one of its strings somewhere the student can read (D1, C3, M6). */
export function checkRequired(actions: EvalAction[], groups: string[][], rules: string[]): CheckResult {
	const text = [...visibleText(actions), ...visibleText(actions, CONTENT_KEYS)].join('\n')
	const missing = groups.filter((group) => !group.some((value) => containsValue(text, value)))
	return {
		check: 'required-content',
		rule: rules.filter((r) => ['D1', 'C3', 'M6'].includes(r)).join(', ') || 'D1',
		pass: missing.length === 0,
		detail:
			missing.length === 0
				? `shows ${groups.map((g) => g.find((v) => containsValue(text, v))).join(', ')}`
				: `missing any of: ${missing.map((g) => g.join(' / ')).join('; ')}`,
	}
}

/**
 * Distinct questions in the student-visible text. A question the tutor repeats, such as a
 * mark's label echoed in its intent, counts once. An intent the chat doesn't show is skipped
 * here; the leak checks still read it, to stay strict.
 */
export function findQuestions(actions: EvalAction[]): string[] {
	const questions = new Map<string, string>()
	for (const text of visibleText(actions.map(withoutHiddenIntent))) {
		// A sentence ends at ?, !, a newline, or a period not inside a number like 0.1.
		for (const match of text.matchAll(/(?:[^.?!\n]|\.(?=\d))*\?/g)) {
			const question = match[0].trim()
			const key = question.toLowerCase().replace(/[^a-z0-9|()]+/g, ' ').trim()
			if (key && !questions.has(key)) questions.set(key, question)
		}
	}
	return [...questions.values()]
}

function withoutHiddenIntent(action: EvalAction): EvalAction {
	const shown = SHOWN_INSTEAD_OF_INTENT[action._type]
	if (!shown || typeof action[shown] !== 'string' || action[shown] === '') return action
	const { intent: _hidden, ...rest } = action
	return rest as EvalAction
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
