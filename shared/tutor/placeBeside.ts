/** An axis-aligned box in page coordinates. */
export interface PlacementBox {
	x: number
	y: number
	w: number
	h: number
}

export type PlacementSide = 'right' | 'below' | 'left' | 'above'

const SIDES: PlacementSide[] = ['right', 'below', 'left', 'above']

/**
 * Find a spot for a tutor mark of `size` next to `anchor` that overlaps none of `obstacles`
 * (the student's ink and earlier tutor marks), so the tutor never writes over student work
 * (pedagogy-spec C1, C2).
 *
 * Tries each side in order, top- or left-aligned with the anchor, then steps outward from
 * the anchor in `gap`-sized rings. With `within` (a problem frame's work area), spots inside it
 * win over spots outside. Falls back to the right side if nothing is free within `maxRings`.
 */
export function placeBeside(
	anchor: PlacementBox,
	size: { w: number; h: number },
	obstacles: PlacementBox[],
	{ gap = 24, maxRings = 12, within }: { gap?: number; maxRings?: number; within?: PlacementBox } = {}
): PlacementBox & { side: PlacementSide } {
	const inside = (box: PlacementBox) => !within || contains(within, box)
	for (const wantInside of within ? [true, false] : [false]) {
		for (let ring = 0; ring <= maxRings; ring++) {
			const offset = gap + ring * gap
			for (const side of SIDES) {
				const box = boxOnSide(anchor, size, side, offset)
				if (wantInside && within && !contains(within, box)) continue
				if (!obstacles.some((o) => overlaps(box, o, gap / 2))) return { ...box, side }
			}
		}
	}
	return { ...boxOnSide(anchor, size, 'right', gap), side: 'right' }
}

function boxOnSide(
	anchor: PlacementBox,
	size: { w: number; h: number },
	side: PlacementSide,
	offset: number
): PlacementBox {
	switch (side) {
		case 'right':
			return { x: anchor.x + anchor.w + offset, y: anchor.y, ...size }
		case 'left':
			return { x: anchor.x - offset - size.w, y: anchor.y, ...size }
		case 'below':
			return { x: anchor.x, y: anchor.y + anchor.h + offset, ...size }
		case 'above':
			return { x: anchor.x, y: anchor.y - offset - size.h, ...size }
	}
}

/** Whether two boxes overlap once `a` is grown by `margin` on every side. */
export function overlaps(a: PlacementBox, b: PlacementBox, margin = 0): boolean {
	return (
		a.x - margin < b.x + b.w &&
		a.x + a.w + margin > b.x &&
		a.y - margin < b.y + b.h &&
		a.y + a.h + margin > b.y
	)
}

/** The smallest box containing every box in `boxes`, or null if there are none. */
export function unionBoxes(boxes: PlacementBox[]): PlacementBox | null {
	if (boxes.length === 0) return null
	const minX = Math.min(...boxes.map((b) => b.x))
	const minY = Math.min(...boxes.map((b) => b.y))
	const maxX = Math.max(...boxes.map((b) => b.x + b.w))
	const maxY = Math.max(...boxes.map((b) => b.y + b.h))
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/** Whether `inner` lies entirely inside `outer`. */
function contains(outer: PlacementBox, inner: PlacementBox): boolean {
	return (
		inner.x >= outer.x &&
		inner.y >= outer.y &&
		inner.x + inner.w <= outer.x + outer.w &&
		inner.y + inner.h <= outer.y + outer.h
	)
}
