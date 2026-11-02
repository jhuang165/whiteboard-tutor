import { toRichText } from 'tldraw'
import { HintAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { noteHint } from '../tutor/problemTracking'
import {
	connectWithArrow,
	getAnchorBox,
	lockShapes,
	moveBeside,
	newTutorShapeId,
	resolveStudentShapeId,
	TUTOR_INK,
	tutorMeta,
} from '../tutor/tutorMarks'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

/**
 * One hint ladder rung as a card beside the student's work, with an arrow to the shape it
 * is about (pedagogy-spec H, C2, C4).
 */
export const HintActionUtil = registerActionUtil(
	class HintActionUtil extends AgentActionUtil<HintAction> {
		static override type = 'hint' as const

		override getInfo(action: Streaming<HintAction>) {
			return {
				icon: 'note' as const,
				description: action.text ?? action.intent ?? '',
				summary: action.rung ? `Hint (${action.rung})` : 'Hint',
			}
		}

		override applyAction(action: Streaming<HintAction>, helpers: AgentHelpers) {
			// Place the card once, when it's whole, rather than reflowing it while it streams.
			if (!action.complete || !action.text) return
			const { editor } = this

			const anchorId = resolveStudentShapeId(editor, helpers, action.anchorShapeId)
			const anchor = getAnchorBox(editor, anchorId ? [anchorId] : [])
			const meta = tutorMeta('hint', `hint ${action.rung ?? ''}`.trim())

			const cardId = newTutorShapeId(helpers, 'hint')
			editor.createShape({
				id: cardId,
				type: 'note',
				x: anchor.x,
				y: anchor.y,
				meta,
				props: { color: TUTOR_INK.hint, size: 's', richText: toRichText(action.text) },
			})
			moveBeside(editor, cardId, anchor)

			const ids = [cardId]
			if (anchorId) {
				const arrowId = newTutorShapeId(helpers, 'hint-arrow')
				connectWithArrow(editor, arrowId, cardId, anchorId, meta)
				ids.push(arrowId)
			}
			lockShapes(editor, ids)
			noteHint(editor, action.rung ?? 'H?')
		}
	}
)
