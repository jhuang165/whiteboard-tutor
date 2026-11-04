import { createShapeId } from 'tldraw'
import { DIAGRAM_KIND_NAMES, DiagramSpecSchema } from '../../shared/diagram/DiagramSpec'
import { layoutDiagram } from '../../shared/diagram/layout'
import { DiagramAction } from '../../shared/schema/AgentActionSchemas'
import { Streaming } from '../../shared/types/Streaming'
import { AgentHelpers } from '../AgentHelpers'
import { DiagramShape } from '../shapes/DiagramShapeUtil'
import { getAnchorBox, lockShapes, moveBeside, newTutorShapeId, tutorMeta } from '../tutor/tutorMarks'
import { AgentActionUtil, registerActionUtil } from './AgentActionUtil'

/**
 * One diagram from the representation library (PLAN §3): the model sends a structured spec,
 * and the layout draws it, so a tree or a table comes out tidy instead of hand-drawn line
 * by line. Used for M6 re-explanations above all.
 */
export const DiagramActionUtil = registerActionUtil(
	class DiagramActionUtil extends AgentActionUtil<DiagramAction> {
		static override type = 'diagram' as const

		override getInfo(action: Streaming<DiagramAction>) {
			const kind = action.diagram?.kind
			const name = kind && kind in DIAGRAM_KIND_NAMES ? DIAGRAM_KIND_NAMES[kind] : 'diagram'
			return {
				icon: 'pencil' as const,
				description: action.title || action.intent || '',
				summary: `Drew a ${name}`,
			}
		}

		override applyAction(action: Streaming<DiagramAction>, helpers: AgentHelpers) {
			if (!action.complete) return
			// Nothing checks actions against their schema on the way in, so check the spec here.
			const parsed = DiagramSpecSchema.safeParse(action.diagram)
			if (!parsed.success) {
				console.warn('[diagram] dropped a diagram that does not match its schema', parsed.error.issues)
				return
			}
			const spec = parsed.data
			const title = action.title ?? ''
			const layout = layoutDiagram(spec, title)
			if (layout.warnings.length) console.warn('[diagram]', layout.warnings.join('; '))

			const { editor } = this
			const anchorId = action.anchorShapeId ? helpers.ensureShapeIdExists(action.anchorShapeId) : null
			const anchor = getAnchorBox(editor, anchorId ? [createShapeId(anchorId)] : [])
			const id = newTutorShapeId(helpers, 'diagram')
			editor.createShape<DiagramShape>({
				id,
				type: 'diagram',
				x: anchor.x,
				y: anchor.y,
				meta: tutorMeta('diagram', `diagram (${DIAGRAM_KIND_NAMES[spec.kind]})`),
				props: { w: layout.w, h: layout.h, spec: JSON.stringify(spec), title },
			})
			moveBeside(editor, id, anchor, 20)
			lockShapes(editor, [id])
		}
	}
)
