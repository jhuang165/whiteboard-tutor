import { describe, expect, it } from 'vitest'
import { backlogPace, easeInOut, revealClip, travelMs, writeMs, writePoint, writeStart } from './presenceTimeline'

const box = { x: 100, y: 50, w: 200, h: 40 }

describe('presence timing', () => {
	it('keeps travel and write times in a readable range', () => {
		expect(travelMs(0)).toBe(160)
		expect(travelMs(10_000)).toBe(420)
		expect(writeMs(0)).toBe(260)
		expect(writeMs(10_000)).toBe(800)
		expect(writeMs(200)).toBeGreaterThan(writeMs(100))
	})

	it('speeds up when marks are waiting', () => {
		expect(backlogPace(0)).toBe(1)
		expect(backlogPace(1)).toBeLessThan(1)
		expect(backlogPace(5)).toBeLessThan(backlogPace(1))
	})

	it('eases from 0 to 1 and clamps outside that', () => {
		expect(easeInOut(0)).toBe(0)
		expect(easeInOut(0.5)).toBe(0.5)
		expect(easeInOut(1)).toBe(1)
		expect(easeInOut(2)).toBe(1)
	})
})

describe('revealClip', () => {
	it('hides the unwritten part on the trailing side', () => {
		expect(revealClip(0, 1)).toBe('inset(-40px 100% -40px -40px)')
		expect(revealClip(0.25, 1)).toBe('inset(-40px 75% -40px -40px)')
		expect(revealClip(1, 1)).toBe('inset(-40px 0% -40px -40px)')
		expect(revealClip(0.25, -1)).toBe('inset(-40px -40px -40px 75%)')
	})
})

describe('cursor path', () => {
	it('starts at the leading edge, halfway down', () => {
		expect(writeStart(box, 1)).toEqual({ x: 100, y: 70 })
		expect(writeStart(box, -1)).toEqual({ x: 300, y: 70 })
	})

	it('crosses the mark in the writing direction', () => {
		expect(writePoint(box, 1, 1).x).toBeCloseTo(300)
		expect(writePoint(box, 1, -1).x).toBeCloseTo(100)
		expect(writePoint(box, 0.5, 1).x).toBeCloseTo(200)
	})

	it('wobbles only a little around the middle line', () => {
		for (let p = 0; p <= 1; p += 0.05) {
			expect(Math.abs(writePoint(box, p, 1).y - 70)).toBeLessThanOrEqual(6)
		}
	})
})
