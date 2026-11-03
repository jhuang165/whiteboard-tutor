import { atom, b64Vecs, Editor, RecordsDiff, TLRecord, TLShape, TLShapeId, Vec } from 'tldraw'
import { AgentAppAgentsManager } from '../agent/managers/AgentAppAgentsManager'
import {
	backlogPace,
	easeInOut,
	lerpPoint,
	Point,
	Rect,
	revealClip,
	travelMs,
	WriteDirection,
	writeMs,
	writePoint,
	writeStart,
} from './presenceTimeline'

/** What the cursor overlay draws, in page coordinates. (A type, so it fits TLOverlay props.) */
export type TutorCursor = {
	x: number
	y: number
	opacity: number
	/** 1 to 3 while the tutor is working with nothing to write yet (a "Tutor..." tag), else 0. */
	dots: number
}

interface RevealStep {
	id: TLShapeId
	direction: WriteDirection
}

type Phase =
	| { kind: 'travel'; step: RevealStep; from: Point; to: Point; elapsed: number; duration: number }
	| { kind: 'write'; step: RevealStep; bounds: Rect; elapsed: number; duration: number }

const HIDE_AFTER_MS = 1200
const FADE_MS = 300
const FOLLOW_MS = 90
const CONTAINER_ATTR = 'data-tutor-presence'

/**
 * Tutor presence (PLAN §3): a cursor that goes to where the tutor is about to write, and
 * marks that write in instead of appearing whole. Each new tutor mark waits hidden in a
 * queue; the cursor travels to it, then the mark is revealed in its writing direction
 * while the cursor moves across it. Marks that stream in (`pen`, `create`) already appear
 * piece by piece, so the cursor only follows their leading edge.
 *
 * The reveal is a stylesheet rule on the shape's DOM node, not a store change, so the
 * board, undo history, the chat's diff previews, and the model's screenshots never see a
 * half-written mark.
 */
export class TutorPresence {
	private static instances = new WeakMap<Editor, TutorPresence>()

	static get(editor: Editor): TutorPresence {
		let presence = this.instances.get(editor)
		if (!presence) {
			presence = new TutorPresence(editor)
			this.instances.set(editor, presence)
		}
		return presence
	}

	readonly $cursor = atom<TutorCursor | null>('tutor cursor', null)

	private queue: RevealStep[] = []
	private phase: Phase | null = null
	/** Ids already queued, revealed, or streamed, so a re-applied action isn't queued twice. */
	private known = new Set<TLShapeId>()
	private streamed = new Set<TLShapeId>()
	/** Per hidden shape: `null` while queued, or its current clip while being written. */
	private hidden = new Map<TLShapeId, string | null>()
	private followTarget: Point | null = null
	private idleMs = 0
	private thinkingMs = 0
	private style: HTMLStyleElement | null = null

	private constructor(private readonly editor: Editor) {
		editor.on('tick', this.tick)
		editor.on('dispose', this.dispose)
	}

	/**
	 * Called with the store changes of each applied agent action. New tutor shapes from a
	 * finished action are queued to write in; shapes from a still-streaming action are
	 * followed instead.
	 */
	onActionDiff(diff: RecordsDiff<TLRecord>, complete: boolean) {
		if (this.editor.user.getAnimationSpeed() === 0) return

		let changed = false
		for (const record of Object.values(diff.added)) {
			if (!isTutorShapeRecord(record)) continue
			const { id } = record
			if (!complete) this.streamed.add(id)
			if (this.streamed.has(id)) {
				this.followTarget = this.getLeadingPoint(record)
				continue
			}
			if (this.known.has(id)) continue
			this.known.add(id)
			this.queue.push({ id, direction: getWriteDirection(record) })
			this.hidden.set(id, null)
			changed = true
		}
		if (changed) this.writeStyle()
	}

	private tick = (elapsed: number) => {
		if (!this.phase && this.queue.length > 0) this.startNext()
		if (this.phase) {
			this.advance(elapsed)
		} else if (this.followTarget) {
			this.follow(elapsed)
		}
		this.updateVisibility(elapsed)
	}

	private startNext() {
		const step = this.queue.shift()!
		const bounds = this.editor.getShapePageBounds(step.id)
		if (!bounds) {
			this.finish(step)
			return
		}
		const to = writeStart(bounds, step.direction)
		const current = this.$cursor.get()
		const from = current ? { x: current.x, y: current.y } : this.getRestingPoint()
		const distance = Vec.Dist(from, to) * this.editor.getZoomLevel()
		const duration = travelMs(distance) * backlogPace(this.queue.length)
		this.phase = { kind: 'travel', step, from, to, elapsed: 0, duration }
		this.followTarget = null
	}

	private advance(elapsed: number) {
		const phase = this.phase!
		phase.elapsed += elapsed
		const t = Math.min(1, phase.elapsed / phase.duration)

		if (phase.kind === 'travel') {
			this.moveCursor(lerpPoint(phase.from, phase.to, easeInOut(t)))
			if (t < 1) return
			const bounds = this.editor.getShapePageBounds(phase.step.id)
			if (!bounds) {
				this.finish(phase.step)
				return
			}
			const rect = { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h }
			const zoom = this.editor.getZoomLevel()
			const duration = writeMs(rect.w * zoom) * backlogPace(this.queue.length)
			this.phase = { kind: 'write', step: phase.step, bounds: rect, elapsed: 0, duration }
			this.hidden.set(phase.step.id, revealClip(0, phase.step.direction))
			this.writeStyle()
			return
		}

		this.moveCursor(writePoint(phase.bounds, t, phase.step.direction))
		if (t < 1) {
			this.hidden.set(phase.step.id, revealClip(t, phase.step.direction))
			this.writeStyle()
			return
		}
		this.finish(phase.step)
	}

	private finish(step: RevealStep) {
		this.hidden.delete(step.id)
		this.writeStyle()
		this.phase = null
	}

	/** Ease toward the leading edge of a streaming mark. */
	private follow(elapsed: number) {
		const target = this.followTarget!
		const current = this.$cursor.get()
		if (!current) {
			this.moveCursor(target)
			return
		}
		const k = 1 - Math.exp(-elapsed / FOLLOW_MS)
		this.moveCursor(lerpPoint(current, target, k))
	}

	private moveCursor(point: Point) {
		this.$cursor.set({ x: point.x, y: point.y, opacity: 1, dots: 0 })
		this.idleMs = 0
	}

	/**
	 * Show the cursor as soon as a turn starts (it may think for a while before writing),
	 * and fade it out once the tutor has been idle for a moment.
	 */
	private updateVisibility(elapsed: number) {
		const writing = this.phase !== null || this.queue.length > 0
		const generating = AgentAppAgentsManager.getAgents(this.editor).some((agent) =>
			agent.requests.isGenerating()
		)
		const cursor = this.$cursor.get()

		if (writing) return
		if (generating) {
			this.idleMs = 0
			this.thinkingMs += elapsed
			const dots = this.followTarget ? 0 : 1 + (Math.floor(this.thinkingMs / 400) % 3)
			if (!cursor) {
				this.$cursor.set({ ...this.getRestingPoint(), opacity: 1, dots })
			} else if (cursor.dots !== dots || cursor.opacity < 1) {
				this.$cursor.set({ ...cursor, opacity: 1, dots })
			}
			return
		}
		this.thinkingMs = 0
		if (!cursor) return

		this.idleMs += elapsed
		if (this.idleMs < HIDE_AFTER_MS) {
			if (cursor.dots) this.$cursor.set({ ...cursor, dots: 0 })
			return
		}
		const opacity = 1 - (this.idleMs - HIDE_AFTER_MS) / FADE_MS
		if (opacity <= 0) {
			this.$cursor.set(null)
			this.followTarget = null
		} else {
			this.$cursor.set({ ...cursor, opacity, dots: 0 })
		}
	}

	/** Just right of the student's work in view, or the middle of the view if there is none. */
	private getRestingPoint(): Point {
		const { editor } = this
		const viewport = editor.getViewportPageBounds()
		const work = editor
			.getCurrentPageShapes()
			.filter((shape) => shape.meta.author !== 'tutor')
			.map((shape) => editor.getShapePageBounds(shape))
			.filter((box) => !!box && viewport.includes(box))
		if (work.length === 0) return { x: viewport.center.x, y: viewport.center.y }
		const right = Math.max(...work.map((box) => box!.maxX))
		const top = Math.min(...work.map((box) => box!.minY))
		const bottom = Math.max(...work.map((box) => box!.maxY))
		const x = Math.min(right + 32 / editor.getZoomLevel(), viewport.maxX - 60 / editor.getZoomLevel())
		return { x, y: (top + bottom) / 2 }
	}

	/** Where a streaming mark is being drawn: a pen stroke's last point, else its right edge. */
	private getLeadingPoint(shape: TLShape): Point | null {
		const { editor } = this
		if (editor.isShapeOfType(shape, 'draw')) {
			const segment = shape.props.segments.at(-1)
			const last = segment ? b64Vecs.decodePoints(segment.path).at(-1) : undefined
			if (last) return editor.getShapePageTransform(shape).applyToPoint(last)
		}
		const bounds = editor.getShapePageBounds(shape)
		return bounds ? { x: bounds.maxX, y: bounds.center.y } : null
	}

	private writeStyle() {
		const container = this.editor.getContainer()
		if (!this.style) {
			container.setAttribute(CONTAINER_ATTR, '')
			this.style = document.createElement('style')
			this.style.setAttribute(CONTAINER_ATTR, '')
			document.head.appendChild(this.style)
		}
		const rules: string[] = []
		for (const [id, clip] of this.hidden) {
			const selector = `[${CONTAINER_ATTR}] .tl-shape[data-shape-id="${CSS.escape(id)}"]`
			rules.push(
				clip === null
					? `${selector} { opacity: 0 !important; }`
					: `${selector} { clip-path: ${clip} !important; }`
			)
		}
		this.style.textContent = rules.join('\n')
	}

	private dispose = () => {
		this.editor.off('tick', this.tick)
		this.editor.off('dispose', this.dispose)
		this.style?.remove()
		this.style = null
		TutorPresence.instances.delete(this.editor)
	}
}

function isTutorShapeRecord(record: TLRecord): record is TLShape {
	return record.typeName === 'shape' && record.meta.author === 'tutor'
}

/** Arrows write from their start toward their end; everything else left to right. */
function getWriteDirection(shape: TLShape): WriteDirection {
	if (shape.type === 'arrow') {
		const { start, end } = shape.props as { start: Point; end: Point }
		return end.x < start.x ? -1 : 1
	}
	return 1
}
