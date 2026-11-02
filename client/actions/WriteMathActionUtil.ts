import { createShapeId } from 'tldraw'
import { WriteMathAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { measureHtml, renderLatex } from '../shapes/latex'
import { MATH_CLASS, MathShape } from '../shapes/MathShapeUtil'
import {
	getAnchorBox,
	lockShapes,
	moveBeside,
	newTutorShapeId,
	TUTOR_INK,
	tutorMeta,
} from '../tutor/tutorMarks'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

/** One typeset formula in tutor ink, beside the shape it belongs to. */
export const WriteMathActionUtil = registerActionUtil(
	class WriteMathActionUtil extends AgentActionUtil<WriteMathAction> {
		static override type = 'write-math' as const

		override getInfo(action: Streaming<WriteMathAction>) {
			return {
				icon: 'pencil' as const,
				description: action.intent ?? '',
				summary: 'Wrote math',
			}
		}

		override applyAction(action: Streaming<WriteMathAction>, helpers: AgentHelpers) {
			if (!action.complete || !action.latex) return
			const { editor } = this

			// The anchor may be a student shape or one of the tutor's own (a hint, a problem).
			const anchorId = action.anchorShapeId ? helpers.ensureShapeIdExists(action.anchorShapeId) : null
			const anchor = getAnchorBox(editor, anchorId ? [createShapeId(anchorId)] : [])
			const latex = action.latex.trim().replace(/^\$+|\$+$/g, '')
			const { w, h } = measureHtml(renderLatex(latex, true), MATH_CLASS)

			const id = newTutorShapeId(helpers, 'math')
			editor.createShape<MathShape>({
				id,
				type: 'math',
				x: anchor.x,
				y: anchor.y,
				meta: tutorMeta('math', 'math'),
				props: { w: w || 40, h: h || 40, latex, color: TUTOR_INK.pointer },
			})
			moveBeside(editor, id, anchor, 16)
			lockShapes(editor, [id])
		}
	}
)
