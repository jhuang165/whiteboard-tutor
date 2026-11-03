import { FocusedShape } from './FocusedShape'

export interface BlurryShape {
	shapeId: string
	text?: string
	/** The shape's `meta.note`, when it has one. Tutor marks start theirs with "tutor". */
	note?: string
	type: FocusedShape['_type']
	x: number
	y: number
	w: number
	h: number
}
