/**
 * What the student asked for on this turn. A button press names it directly; a typed
 * message is `chat`, and the tutor infers the mode from the message (pedagogy-spec M7).
 */
export const TUTOR_INTENTS = ['chat', 'explain', 'hint', 'check', 'wait-what', 'quiz'] as const

export type TutorIntent = (typeof TUTOR_INTENTS)[number]

export function isTutorIntent(value: unknown): value is TutorIntent {
	return typeof value === 'string' && (TUTOR_INTENTS as readonly string[]).includes(value)
}

/** The tutor buttons, in display order, with the message shown in the chat when pressed. */
export const TUTOR_BUTTONS: { intent: Exclude<TutorIntent, 'chat'>; label: string; message: string }[] =
	[
		{ intent: 'explain', label: 'Explain', message: 'Explain this to me.' },
		{ intent: 'hint', label: 'Hint', message: 'Can I get a hint?' },
		{ intent: 'check', label: 'Check', message: 'Check my work.' },
		{ intent: 'wait-what', label: 'Wait, what?', message: "Wait, what? I didn't follow that." },
		{ intent: 'quiz', label: 'Quiz me', message: 'Give me a practice problem.' },
	]
