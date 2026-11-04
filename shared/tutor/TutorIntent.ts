/**
 * What the student asked for on this turn. A button press names it directly; a typed
 * message is `chat`, and the tutor infers the mode from the message (pedagogy-spec M7).
 * `watch` is the one turn the student didn't ask for: proactive watching flagged an error (M8).
 */
export const TUTOR_INTENTS = ['chat', 'explain', 'hint', 'check', 'wait-what', 'quiz', 'watch'] as const

export type TutorIntent = (typeof TUTOR_INTENTS)[number]

export function isTutorIntent(value: unknown): value is TutorIntent {
	return typeof value === 'string' && (TUTOR_INTENTS as readonly string[]).includes(value)
}

/**
 * The prompt message on a Watch turn, which the student didn't send. The chat shows
 * `WATCH_CHAT_LINE` instead.
 */
export const WATCH_MESSAGE = '(The student did not send a message. Proactive watching started this turn.)'
export const WATCH_CHAT_LINE = 'Looking over your work…'

/** The tutor buttons, in display order, with the message shown in the chat when pressed. */
export const TUTOR_BUTTONS: { intent: Exclude<TutorIntent, 'chat' | 'watch'>; label: string; message: string }[] =
	[
		{ intent: 'explain', label: 'Explain', message: 'Explain this to me.' },
		{ intent: 'hint', label: 'Hint', message: 'Can I get a hint?' },
		{ intent: 'check', label: 'Check', message: 'Check my work.' },
		{ intent: 'wait-what', label: 'Wait, what?', message: "Wait, what? I didn't follow that." },
		{ intent: 'quiz', label: 'Quiz me', message: 'Give me a practice problem.' },
	]
