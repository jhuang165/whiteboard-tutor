import { getAgentModeDefinition } from '../../client/modes/AgentModeDefinitions'
import { readFileSync } from 'node:fs'
import type { BlurryShape } from '../../shared/format/BlurryShape'
import { DEFAULT_MODEL_NAME } from '../../shared/models'
import { TUTOR_BUTTONS, WATCH_MESSAGE } from '../../shared/tutor/TutorIntent'
import type { AgentPrompt } from '../../shared/types/AgentPrompt'
import type { ChatHistoryItem } from '../../shared/types/ChatHistoryItem'
import type { EvalCase, EvalHistoryTurn } from './EvalCase'

const MARGIN = 200
const EVAL_LEARNER_ID = '00000000-0000-4000-8000-000000000000'

/**
 * The prompt the client would send for this case, built without a browser. It has the same
 * parts as the working mode, with these differences from a live turn: the screenshot and the
 * chat history are only there when the case sets them, and the learner record and checked
 * answer come from the case instead of the learner store.
 */
export function buildCasePrompt(evalCase: EvalCase): AgentPrompt {
	const mode = getAgentModeDefinition('working')
	if (!mode.active) throw new Error('working mode should be active')

	const shapes: BlurryShape[] = evalCase.board.map((shape) => ({ type: 'text', ...shape }))
	const bounds = viewportAround(shapes)
	const message =
		evalCase.message ??
		(evalCase.intent === 'watch' ? WATCH_MESSAGE : undefined) ??
		TUTOR_BUTTONS.find((button) => button.intent === evalCase.intent)?.message ??
		''
	// A Watch turn isn't from the student; the app sends it as another agent's message.
	const source = evalCase.intent === 'watch' ? 'other-agent' : 'user'

	const prompt: Partial<AgentPrompt> = {
		mode: { type: 'mode', modeType: mode.type, partTypes: [...mode.parts], actionTypes: [...mode.actions] },
		debug: { type: 'debug', logSystemPrompt: false, logMessages: false },
		modelName: { type: 'modelName', modelName: evalCase.model ?? DEFAULT_MODEL_NAME },
		messages: { type: 'messages', agentMessages: [message], requestSource: source },
		data: { type: 'data', data: [] },
		contextItems: { type: 'contextItems', items: [], requestSource: source },
		learner: { type: 'learner', learnerId: EVAL_LEARNER_ID, summary: evalCase.learnerSummary ?? [] },
		problem: { type: 'problem', problem: evalCase.problem ?? null },
		tutorTurn: {
			type: 'tutorTurn',
			intent: evalCase.intent,
			hintsGiven: evalCase.hintsGiven ?? 0,
			...(evalCase.reviewConcept ? { reviewConcept: evalCase.reviewConcept } : {}),
			...(evalCase.watchReason ? { watchReason: evalCase.watchReason } : {}),
		},
		screenshot: { type: 'screenshot', screenshot: evalCase.screenshot ? loadFixture(evalCase.screenshot) : '' },
		userViewportBounds: { type: 'userViewportBounds', userBounds: bounds },
		agentViewportBounds: { type: 'agentViewportBounds', agentBounds: bounds },
		blurryShapes: { type: 'blurryShapes', shapes },
		peripheralShapes: { type: 'peripheralShapes', clusters: [] },
		selectedShapes: { type: 'selectedShapes', shapeIds: [] },
		chatHistory: { type: 'chatHistory', history: (evalCase.history ?? []).flatMap(toHistoryItems) },
		userActionHistory: { type: 'userActionHistory', added: [], removed: [], updated: [] },
		canvasLints: { type: 'canvasLints', lints: [] },
		time: { type: 'time', time: 'Sunday, November 1, 2026, 7:00 PM' },
	}

	// The client sends only the working mode's parts, which leaves out `todoList`.
	return prompt as AgentPrompt
}

/** A PNG in `evals/fixtures/` as the data URL the screenshot part carries. */
function loadFixture(file: string): string {
	const data = readFileSync(new URL(`../fixtures/${file}`, import.meta.url))
	return `data:image/png;base64,${data.toString('base64')}`
}

/** A case's history turn as the client's chat history stores it: one item per tutor action. */
function toHistoryItems(turn: EvalHistoryTurn): ChatHistoryItem[] {
	if (turn.role === 'student') {
		return [
			{
				type: 'prompt',
				promptSource: 'user',
				agentFacingMessage: turn.message,
				userFacingMessage: turn.message,
				contextItems: [],
				selectedShapes: [],
			},
		]
	}
	return turn.actions.map((action) => ({
		type: 'action',
		action: { ...action, complete: true, time: 0 } as unknown as Extract<ChatHistoryItem, { type: 'action' }>['action'],
		diff: { added: {}, updated: {}, removed: {} },
		acceptance: 'accepted',
	}))
}

function viewportAround(shapes: BlurryShape[]) {
	if (shapes.length === 0) return { x: 0, y: 0, w: 1200, h: 800 }
	const minX = Math.min(...shapes.map((s) => s.x))
	const minY = Math.min(...shapes.map((s) => s.y))
	const maxX = Math.max(...shapes.map((s) => s.x + s.w))
	const maxY = Math.max(...shapes.map((s) => s.y + s.h))
	return { x: minX - MARGIN, y: minY - MARGIN, w: maxX - minX + 2 * MARGIN, h: maxY - minY + 2 * MARGIN }
}
