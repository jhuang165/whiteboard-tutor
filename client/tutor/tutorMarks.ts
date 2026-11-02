import { Box, createShapeId, Editor, TLShapeId } from 'tldraw'
import { PlacementBox, placeBeside, unionBoxes } from '../../shared/tutor/placeBeside'
import { SimpleShapeId } from '../../shared/types/ids-schema'
import { AgentHelpers } from '../AgentHelpers'

/**
 * Tutor ink: the colors the tutor's own marks use, so they read apart from the student's
 * (PLAN §3 "Two inks"). Students write in black by default.
 */
export const TUTOR_INK = {
	hint: 'light-violet',
	pointer: 'violet',
	error: 'red',
	correct: 'green',
	incorrect: 'red',
} as const

export type TutorMarkKind = 'hint' | 'error' | 'verdict' | 'drawing'

/**
 * Meta for a tutor mark. `note` is shown to the model in its shape list, so it can tell its
 * own marks from the student's work.
 */
export function tutorMeta(kind: TutorMarkKind, note: string) {
	const text = note.replace(/^tutor\b:?\s*/i, '')
	return { author: 'tutor', tutorKind: kind, note: text ? `tutor ${text}` : 'tutor' }
}

/** Whether a shape is a tutor mark rather than student work. */
export function isTutorShape(editor: Editor, id: TLShapeId) {
	return editor.getShape(id)?.meta.author === 'tutor'
}

/** A fresh id for a tutor mark, readable in the model's shape list (`hint`, `hint-1`, ...). */
export function newTutorShapeId(helpers: AgentHelpers, base: string): TLShapeId {
	return createShapeId(helpers.ensureShapeIdIsUnique(base as SimpleShapeId))
}

/** Page bounds of every shape on the current page except `exclude`. */
export function getBoardObstacles(editor: Editor, exclude: TLShapeId[] = []): PlacementBox[] {
	return editor
		.getCurrentPageShapes()
		.filter((shape) => !exclude.includes(shape.id))
		.map((shape) => editor.getShapePageBounds(shape))
		.filter((box): box is Box => !!box)
		.map(toPlacementBox)
}

/**
 * The area a tutor mark should sit next to: the union of the given shapes' bounds, or the
 * middle of the student's viewport when none of them exist.
 */
export function getAnchorBox(editor: Editor, ids: TLShapeId[]): PlacementBox {
	const boxes = ids
		.map((id) => editor.getShapePageBounds(id))
		.filter((box): box is Box => !!box)
		.map(toPlacementBox)
	const union = unionBoxes(boxes)
	if (union) return union
	const center = editor.getViewportPageBounds().center
	return { x: center.x, y: center.y, w: 0, h: 0 }
}

/**
 * Move an already-created shape beside `anchor`, clear of everything else on the board.
 * The shape is measured after creation, so text and notes are placed at their real size.
 */
export function moveBeside(editor: Editor, id: TLShapeId, anchor: PlacementBox, gap?: number) {
	const bounds = editor.getShapePageBounds(id)
	if (!bounds) return
	const spot = placeBeside(anchor, { w: bounds.w, h: bounds.h }, getBoardObstacles(editor, [id]), {
		gap,
	})
	const shape = editor.getShape(id)!
	editor.updateShape({
		id,
		type: shape.type,
		x: shape.x + (spot.x - bounds.x),
		y: shape.y + (spot.y - bounds.y),
	})
}

/** Draw a tutor arrow from one shape to another, bound at both ends. */
export function connectWithArrow(
	editor: Editor,
	arrowId: TLShapeId,
	fromId: TLShapeId,
	toId: TLShapeId,
	meta: ReturnType<typeof tutorMeta>
) {
	const from = editor.getShapePageBounds(fromId)
	const to = editor.getShapePageBounds(toId)
	if (!from || !to) return

	editor.createShape({
		id: arrowId,
		type: 'arrow',
		x: from.center.x,
		y: from.center.y,
		meta,
		props: {
			color: TUTOR_INK.pointer,
			size: 's',
			dash: 'draw',
			start: { x: 0, y: 0 },
			end: { x: to.center.x - from.center.x, y: to.center.y - from.center.y },
		},
	})
	for (const [terminal, target] of [
		['start', fromId],
		['end', toId],
	] as const) {
		editor.createBinding({
			type: 'arrow',
			fromId: arrowId,
			toId: target,
			props: { terminal, normalizedAnchor: { x: 0.5, y: 0.5 }, isExact: false, isPrecise: false },
		})
	}
}

/** Lock tutor marks so the student can't nudge or erase them by accident (C1). */
export function lockShapes(editor: Editor, ids: TLShapeId[]) {
	editor.updateShapes(
		ids
			.map((id) => editor.getShape(id))
			.filter((shape) => !!shape)
			.map((shape) => ({ id: shape.id, type: shape.type, isLocked: true }))
	)
}

/** Resolve a model-given shape id to a real student shape, or null. */
export function resolveStudentShapeId(
	editor: Editor,
	helpers: AgentHelpers,
	id: SimpleShapeId | undefined
): TLShapeId | null {
	if (!id) return null
	const real = helpers.ensureShapeIdExists(id)
	if (!real) return null
	const shapeId = createShapeId(real)
	return isTutorShape(editor, shapeId) ? null : shapeId
}

function toPlacementBox(box: Box): PlacementBox {
	return { x: box.x, y: box.y, w: box.w, h: box.h }
}
