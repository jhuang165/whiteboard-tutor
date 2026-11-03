import { Editor, TLShapeId } from 'tldraw'
import { TranscribeAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { measureHtml, renderLatex } from '../shapes/latex'
import { TRANSCRIPTION_CLASS, TranscriptionShape } from '../shapes/TranscriptionShapeUtil'
import { getAnchorBox, lockShapes, moveBeside, newTutorShapeId, resolveStudentShapeId, tutorMeta } from '../tutor/tutorMarks'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

/**
 * "Here's what I read" before judging handwriting (pedagogy-spec C3): a faint chip with the
 * tutor's reading of one line of student ink, placed beside it. Not a judgment, so it
 * doesn't count toward the one-mark budget (C4).
 */
export const TranscribeActionUtil = registerActionUtil(
	class TranscribeActionUtil extends AgentActionUtil<TranscribeAction> {
		static override type = 'transcribe' as const

		override getInfo(action: Streaming<TranscribeAction>) {
			return {
				icon: 'pencil' as const,
				description: action.intent ?? '',
				summary: action.confidence === 'low' ? 'Transcribed (not sure)' : 'Transcribed',
			}
		}

		override sanitizeAction(action: Streaming<TranscribeAction>, helpers: AgentHelpers) {
			// A read is of student ink, so it needs at least one student shape that exists.
			if (action.complete && getStudentShapeIds(this.editor, helpers, action).length === 0) return null
			return action
		}

		override applyAction(action: Streaming<TranscribeAction>, helpers: AgentHelpers) {
			if (!action.complete || !action.latex) return
			const { editor } = this

			const sourceIds = getStudentShapeIds(this.editor, helpers, action)
			const anchor = getAnchorBox(editor, sourceIds)
			const latex = action.latex.trim().replace(/^\$+|\$+$/g, '')
			const confidence = action.confidence === 'low' ? 'low' : 'high'
			const unsure = confidence === 'low' ? (action.unsure ?? '').trim() : ''
			const { w, h } = measureHtml(renderLatex(latex, false), TRANSCRIPTION_CLASS)

			const id = newTutorShapeId(helpers, 'transcription')
			editor.createShape<TranscriptionShape>({
				id,
				type: 'transcription',
				x: anchor.x,
				y: anchor.y,
				meta: tutorMeta('transcription', `transcription of ${action.shapeIds.join(', ')}`),
				props: { w: w || 80, h: h || 40, latex, confidence, unsure, correction: '' },
			})
			moveBeside(editor, id, anchor, 8)
			lockShapes(editor, [id])
		}
	}
)

function getStudentShapeIds(editor: Editor, helpers: AgentHelpers, action: Streaming<TranscribeAction>): TLShapeId[] {
	return (action.shapeIds ?? [])
		.map((id) => resolveStudentShapeId(editor, helpers, id))
		.filter((id): id is TLShapeId => id !== null)
}
