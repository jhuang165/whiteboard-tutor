import { toRichText } from 'tldraw'
import { MarkErrorAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import {
	getAnchorBox,
	lockShapes,
	moveBeside,
	newTutorShapeId,
	resolveStudentShapeId,
	TUTOR_INK,
	tutorMeta,
} from '../tutor/tutorMarks'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

/** Padding between the student's shape and the circle drawn around it. */
const CIRCLE_PADDING = 8

/**
 * Circle the earliest substantive error and label it as a slip or a misconception
 * (pedagogy-spec M3, E1). The circle goes around the student's ink and the label beside it;
 * neither covers the work.
 */
export const MarkErrorActionUtil = registerActionUtil(
	class MarkErrorActionUtil extends AgentActionUtil<MarkErrorAction> {
		static override type = 'mark-error' as const

		override getInfo(action: Streaming<MarkErrorAction>) {
			return {
				icon: 'target' as const,
				description: action.label ?? action.intent ?? '',
				summary: action.errorKind ? `Marked a ${action.errorKind}` : 'Marked an error',
			}
		}

		override sanitizeAction(action: Streaming<MarkErrorAction>, helpers: AgentHelpers) {
			// Only student work can be marked wrong, and only shapes that exist.
			if (action.complete && !resolveStudentShapeId(this.editor, helpers, action.shapeId)) {
				return null
			}
			return action
		}

		override applyAction(action: Streaming<MarkErrorAction>, helpers: AgentHelpers) {
			if (!action.complete || !action.label) return
			const { editor } = this

			const targetId = resolveStudentShapeId(editor, helpers, action.shapeId)
			if (!targetId) return
			const target = getAnchorBox(editor, [targetId])
			const kind = action.errorKind ?? 'slip'
			const meta = tutorMeta('error', `error mark (${kind}) on ${action.shapeId}`)

			// An ellipse through the corners of a w×h box is √2 times larger on each axis.
			const w = target.w * Math.SQRT2 + CIRCLE_PADDING * 2
			const h = target.h * Math.SQRT2 + CIRCLE_PADDING * 2
			const circleId = newTutorShapeId(helpers, 'error-circle')
			editor.createShape({
				id: circleId,
				type: 'geo',
				x: target.x + target.w / 2 - w / 2,
				y: target.y + target.h / 2 - h / 2,
				meta,
				props: {
					geo: 'ellipse',
					w,
					h,
					color: TUTOR_INK.error,
					fill: 'none',
					dash: 'draw',
					size: 's',
				},
			})

			const labelId = newTutorShapeId(helpers, 'error-label')
			editor.createShape({
				id: labelId,
				type: 'text',
				x: target.x,
				y: target.y,
				meta,
				props: {
					color: TUTOR_INK.error,
					size: 's',
					font: 'draw',
					autoSize: true,
					richText: toRichText(`${kind}: ${action.label}`),
				},
			})
			moveBeside(editor, labelId, getAnchorBox(editor, [circleId]), 12)

			lockShapes(editor, [circleId, labelId])
		}
	}
)
