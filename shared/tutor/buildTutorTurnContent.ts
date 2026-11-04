import { conceptSlug } from './evidence'
import type { TutorIntent } from './TutorIntent'

export interface TutorTurnState {
	intent: TutorIntent
	/** Hint presses before this one, since the last new chat. */
	hintsGiven: number
	/** On a Quiz turn, the due review the student chose to start (L4). */
	reviewConcept?: string
}

/**
 * Per-turn tutor instructions, sent as user content after the cached system prompt.
 * Rule ids refer to `.claude/skills/pedagogy-spec/SKILL.md`; the full rules are in the
 * system prompt, so this only names the mode and the turn-specific state.
 */
export function buildTutorTurnContent({ intent, hintsGiven, reviewConcept }: TutorTurnState): string[] {
	switch (intent) {
		case 'chat':
			return [
				'Tutor turn: the student typed a message (no button). Infer the mode from it: a how/why question is M1 Concept, work in progress is M2 Problem, a request to check is M3 Review. If you cannot tell, ask one short routing question (M7).',
			]
		case 'explain':
			return [
				'Tutor turn: the student pressed **Explain**. Use M1 Concept: intuition, then a small concrete example, then the formal statement with its assumptions. Ask zero questions (Q2).',
			]
		case 'hint': {
			const ordinal = hintsGiven + 1
			return [
				`Tutor turn: the student pressed **Hint**. Use M2 Problem. This is hint request #${ordinal} since this chat started${hintsGiven > 0 ? '; read the chat history for the rungs you already gave and go one rung further, or drop a rung if they seem frustrated' : '; enter the ladder at the rung that matches where they are stuck'}. Give exactly one rung (H), as one hint on the board next to the stuck step (C2, C4), then stop. Do not reveal the answer below H5.`,
			]
		}
		case 'check':
			return [
				'Tutor turn: the student pressed **Check**. Use M3 Review. Transcribe the handwriting you are judging first, and confirm any unsure read before marking it wrong (C3). Give a verdict, then mark only the earliest substantive error and classify it as a slip or a misconception (E1). If the work is correct, say so specifically (T). Leave a sound method intact.',
			]
		case 'wait-what':
			return [
				'Tutor turn: the student pressed **Wait, what?**. Use M6: re-explain your most recent point in a different representation (table, graph, tree, area model, number line, reduced sample space, or a worked numeric example). Pick one you have not used yet in this chat, and put it on the board: a tree, table, Venn diagram, number line, graph, or matrix goes in one `diagram`. Keep the meaning and the assumptions. Do not repeat the same explanation louder (E3).',
			]
		case 'quiz':
			if (reviewConcept) {
				// The client sends the slug; normalize it so only a slug reaches the prompt.
				const concept = conceptSlug(reviewConcept)
				return [
					`Tutor turn: the student started a **scheduled review** of \`${concept}\`. Use M4 Quiz: pose exactly one practice problem with \`pose-problem\` that tests \`${concept}\`, and set its \`concept\` to exactly \`${concept}\`, then stop. A review checks retention (L4), so make it a new problem in a different setting from the ones they have solved, at about the difficulty of their last clean solve. Solve it yourself first (V1); it is also checked with code before you grade it. Give no hint, method, or answer. Any chat message is one short line with no question.`,
				]
			}
			return [
				"Tutor turn: the student pressed **Quiz me**. Use M4 Quiz: pose exactly one practice problem with `pose-problem`, then stop. Choose its concept from the learner's record: a review that is due first, then a concept they have only seen or solved with help, then the topic they are working on now. Match the difficulty to their recent work. Solve it yourself first (V1); it is also checked with code before you grade it. Give no hint, method, or answer. Any chat message is one short line with no question.",
			]
	}
}
