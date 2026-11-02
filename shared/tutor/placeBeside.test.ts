import { describe, expect, it } from 'vitest'
import { overlaps, placeBeside, unionBoxes } from './placeBeside'

const anchor = { x: 0, y: 0, w: 200, h: 40 }
const size = { w: 160, h: 80 }

describe('placeBeside', () => {
	it('goes to the right of the anchor on an empty board', () => {
		const box = placeBeside(anchor, size, [anchor])
		expect(box).toMatchObject({ side: 'right', x: 224, y: 0, w: 160, h: 80 })
	})

	it('goes below when the right side is taken', () => {
		const blocker = { x: 220, y: -50, w: 400, h: 200 }
		const box = placeBeside(anchor, size, [anchor, blocker])
		expect(box.side).toBe('below')
		expect(overlaps(box, blocker)).toBe(false)
	})

	it('never overlaps any obstacle on a crowded board', () => {
		// A wall of student lines around the anchor on every side.
		const crowd = [
			anchor,
			{ x: 210, y: -100, w: 300, h: 300 },
			{ x: -100, y: 50, w: 400, h: 150 },
			{ x: -400, y: -100, w: 390, h: 300 },
			{ x: -100, y: -200, w: 400, h: 190 },
		]
		const box = placeBeside(anchor, size, crowd)
		for (const o of crowd) expect(overlaps(box, o)).toBe(false)
	})
})

describe('unionBoxes', () => {
	it('returns null for no boxes', () => {
		expect(unionBoxes([])).toBeNull()
	})

	it('bounds every box', () => {
		expect(
			unionBoxes([
				{ x: 0, y: 0, w: 10, h: 10 },
				{ x: 20, y: -5, w: 5, h: 30 },
			])
		).toEqual({ x: 0, y: -5, w: 25, h: 30 })
	})
})
