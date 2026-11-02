import { Box } from 'tldraw'
import { PoseProblemAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { measureHtml, renderTextWithMath } from '../shapes/latex'
import {
	PROBLEM_FRAME_WIDTH,
	PROBLEM_HEADER_CLASS,
	PROBLEM_WORK_HEIGHT,
	ProblemFrameShape,
} from '../shapes/ProblemFrameShapeUtil'
import { lockShapes, newTutorShapeId, tutorMeta } from '../tutor/tutorMarks'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

const GAP = 120

/**
 * One problem in a problem frame, placed to the right of everything already on the board.
 * The view moves to it and the student gets the pen (pedagogy-spec M4).
 */
export const PoseProblemActionUtil = registerActionUtil(
	class PoseProblemActionUtil extends AgentActionUtil<PoseProblemAction> {
		static override type = 'pose-problem' as const

		override getInfo(action: Streaming<PoseProblemAction>) {
			return {
				icon: 'note' as const,
				// The chat shows plain text, so drop the LaTeX markers.
				description: (action.statement ?? action.intent ?? '').replace(/\$|\\(?=[%$])/g, ''),
				summary: action.title ? `Posed ${action.title}` : 'Posed a problem',
			}
		}

		override applyAction(action: Streaming<PoseProblemAction>, helpers: AgentHelpers) {
			if (!action.complete || !action.statement) return
			const { editor } = this
			const title = action.title || 'Problem'

			// Measure the header now so the frame is placed at its real size.
			const headerHtml = `<div class="tutor-problem-title">${renderTextWithMath(title)}</div>${renderTextWithMath(action.statement)}`
			const headerH = measureHtml(headerHtml, PROBLEM_HEADER_CLASS, PROBLEM_FRAME_WIDTH - 4).h || 80
			const h = headerH + PROBLEM_WORK_HEIGHT

			const content = editor.getCurrentPageBounds()
			const point = content
				? { x: content.maxX + GAP, y: content.minY }
				: {
						x: editor.getViewportPageBounds().center.x - PROBLEM_FRAME_WIDTH / 2,
						y: editor.getViewportPageBounds().center.y - h / 2,
					}

			const id = newTutorShapeId(helpers, 'problem')
			editor.createShape<ProblemFrameShape>({
				id,
				type: 'problem-frame',
				...point,
				meta: { ...tutorMeta('problem', `problem frame: ${title}`), posedAt: Date.now() },
				props: { w: PROBLEM_FRAME_WIDTH, h, headerH, title, statement: action.statement },
			})
			editor.sendToBack([id])
			lockShapes(editor, [id])

			editor.zoomToBounds(new Box(point.x, point.y, PROBLEM_FRAME_WIDTH, h), {
				inset: 64,
				targetZoom: 1,
				animation: { duration: 400 },
			})
			editor.setCurrentTool('draw')
		}
	}
)
