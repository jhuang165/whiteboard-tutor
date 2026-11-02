import { TLShapeId } from 'tldraw'
import { VerdictAction } from '../../shared/schema/AgentActionSchemas'
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

const STAMP_SIZE = 48

/** A ✓ or ✗ stamp beside the student work being judged (pedagogy-spec M3). */
export const VerdictActionUtil = registerActionUtil(
	class VerdictActionUtil extends AgentActionUtil<VerdictAction> {
		static override type = 'verdict' as const

		override getInfo(action: Streaming<VerdictAction>) {
			return {
				icon: 'eye' as const,
				description: action.intent ?? '',
				summary: action.verdict ? `Verdict: ${action.verdict}` : 'Verdict',
			}
		}

		override applyAction(action: Streaming<VerdictAction>, helpers: AgentHelpers) {
			if (!action.complete || !action.verdict) return
			const { editor } = this

			const workIds = (action.shapeIds ?? [])
				.map((id) => resolveStudentShapeId(editor, helpers, id))
				.filter((id): id is TLShapeId => !!id)
			const work = getAnchorBox(editor, workIds)
			const correct = action.verdict === 'correct'

			const stampId = newTutorShapeId(helpers, 'verdict')
			editor.createShape({
				id: stampId,
				type: 'geo',
				x: work.x + work.w,
				y: work.y,
				meta: tutorMeta('verdict', `verdict: ${action.verdict}`),
				props: {
					geo: correct ? 'check-box' : 'x-box',
					w: STAMP_SIZE,
					h: STAMP_SIZE,
					color: correct ? TUTOR_INK.correct : TUTOR_INK.incorrect,
					fill: 'none',
					dash: 'draw',
					size: 'm',
				},
			})
			moveBeside(editor, stampId, work, 16)
			lockShapes(editor, [stampId])
		}
	}
)
