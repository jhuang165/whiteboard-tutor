import { getAgentModeDefinition } from '../../client/modes/AgentModeDefinitions'
import type { BlurryShape } from '../../shared/format/BlurryShape'
import { DEFAULT_MODEL_NAME } from '../../shared/models'
import { TUTOR_BUTTONS } from '../../shared/tutor/TutorIntent'
import type { AgentPrompt } from '../../shared/types/AgentPrompt'
import type { EvalCase } from './EvalCase'

const MARGIN = 200

/**
 * The prompt the client would send for this case, built without a browser. It has the same
 * parts as the working mode, with two differences from a live turn: no screenshot (the
 * model reads the board from the shape list) and no chat history.
 */
export function buildCasePrompt(evalCase: EvalCase): AgentPrompt {
	const mode = getAgentModeDefinition('working')
	if (!mode.active) throw new Error('working mode should be active')

	const shapes: BlurryShape[] = evalCase.board.map((shape) => ({ type: 'text', ...shape }))
	const bounds = viewportAround(shapes)
	const message =
		evalCase.message ?? TUTOR_BUTTONS.find((button) => button.intent === evalCase.intent)?.message ?? ''

	const prompt: Partial<AgentPrompt> = {
		mode: { type: 'mode', modeType: mode.type, partTypes: [...mode.parts], actionTypes: [...mode.actions] },
		debug: { type: 'debug', logSystemPrompt: false, logMessages: false },
		modelName: { type: 'modelName', modelName: evalCase.model ?? DEFAULT_MODEL_NAME },
		messages: { type: 'messages', agentMessages: [message], requestSource: 'user' },
		data: { type: 'data', data: [] },
		contextItems: { type: 'contextItems', items: [], requestSource: 'user' },
		tutorTurn: { type: 'tutorTurn', intent: evalCase.intent, hintsGiven: evalCase.hintsGiven ?? 0 },
		screenshot: { type: 'screenshot', screenshot: '' },
		userViewportBounds: { type: 'userViewportBounds', userBounds: bounds },
		agentViewportBounds: { type: 'agentViewportBounds', agentBounds: bounds },
		blurryShapes: { type: 'blurryShapes', shapes },
		peripheralShapes: { type: 'peripheralShapes', clusters: [] },
		selectedShapes: { type: 'selectedShapes', shapeIds: [] },
		chatHistory: { type: 'chatHistory', history: [] },
		userActionHistory: { type: 'userActionHistory', added: [], removed: [], updated: [] },
		canvasLints: { type: 'canvasLints', lints: [] },
		time: { type: 'time', time: 'Sunday, November 1, 2026, 7:00 PM' },
	}

	// The client sends only the working mode's parts, which leaves out `todoList`.
	return prompt as AgentPrompt
}

function viewportAround(shapes: BlurryShape[]) {
	if (shapes.length === 0) return { x: 0, y: 0, w: 1200, h: 800 }
	const minX = Math.min(...shapes.map((s) => s.x))
	const minY = Math.min(...shapes.map((s) => s.y))
	const maxX = Math.max(...shapes.map((s) => s.x + s.w))
	const maxY = Math.max(...shapes.map((s) => s.y + s.h))
	return { x: minX - MARGIN, y: minY - MARGIN, w: maxX - minX + 2 * MARGIN, h: maxY - minY + 2 * MARGIN }
}
