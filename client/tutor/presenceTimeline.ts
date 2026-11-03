/**
 * Timing and geometry for tutor presence (PLAN §3 "Tutor presence"): the tutor's cursor
 * travels to each new mark, then the mark is revealed in the direction it would be written
 * while the cursor moves along it. Pure, so it can be tested without an editor.
 */

export interface Point {
	x: number
	y: number
}

export interface Rect extends Point {
	w: number
	h: number
}

/** 1 writes left to right, -1 right to left (an arrow drawn leftward). */
export type WriteDirection = 1 | -1

const TRAVEL_MIN_MS = 160
const TRAVEL_MAX_MS = 420
const WRITE_MIN_MS = 260
const WRITE_MAX_MS = 800

/** How long the cursor takes to cross `screenDistance` pixels to the next mark. */
export function travelMs(screenDistance: number) {
	return clamp(140 + screenDistance * 0.5, TRAVEL_MIN_MS, TRAVEL_MAX_MS)
}

/** How long a mark `screenWidth` pixels wide takes to write in. */
export function writeMs(screenWidth: number) {
	return clamp(200 + screenWidth * 1.2, WRITE_MIN_MS, WRITE_MAX_MS)
}

/**
 * A speed-up for when marks back up: a turn that lands several marks at once shouldn't
 * leave the student watching for seconds after the tutor is done.
 */
export function backlogPace(waiting: number) {
	if (waiting <= 0) return 1
	if (waiting === 1) return 0.75
	return 0.55
}

export function easeInOut(t: number) {
	const c = clamp(t, 0, 1)
	return c < 0.5 ? 2 * c * c : 1 - (-2 * c + 2) ** 2 / 2
}

/**
 * The CSS clip-path for a mark `progress` of the way written. The top, bottom, and trailing
 * edges stay open so strokes that overflow the shape's box aren't cut off.
 */
export function revealClip(progress: number, direction: WriteDirection) {
	const hidden = `${round((1 - clamp(progress, 0, 1)) * 100)}%`
	return direction === 1
		? `inset(-40px ${hidden} -40px -40px)`
		: `inset(-40px -40px -40px ${hidden})`
}

/** Where the cursor starts writing a mark: its leading edge, halfway down. */
export function writeStart(bounds: Rect, direction: WriteDirection): Point {
	return { x: direction === 1 ? bounds.x : bounds.x + bounds.w, y: bounds.y + bounds.h / 2 }
}

/**
 * The cursor's position `progress` of the way through writing a mark: across its middle,
 * with a small wave so it reads as a hand moving rather than a slider.
 */
export function writePoint(bounds: Rect, progress: number, direction: WriteDirection): Point {
	const p = clamp(progress, 0, 1)
	const start = writeStart(bounds, direction)
	const wave = Math.sin(p * Math.PI * 6) * Math.min(bounds.h * 0.15, 6)
	return { x: start.x + direction * bounds.w * p, y: start.y + wave }
}

export function lerpPoint(a: Point, b: Point, t: number): Point {
	return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value))
}

function round(value: number) {
	return Math.round(value * 100) / 100
}
