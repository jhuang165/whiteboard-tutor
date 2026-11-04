import { Box, FileHelpers, TLShape } from 'tldraw'
import { convertTldrawIdToSimpleId } from '../../shared/format/convertTldrawShapeToFocusedShape'
import { TriageShape } from '../../shared/tutor/triage'
import { WATCH_CHAT_LINE, WATCH_MESSAGE } from '../../shared/tutor/TutorIntent'
import { checkWatchGate, hashString, WATCH_IDLE_MS, WatchLog, WatchSnapshot } from '../../shared/tutor/watchGate'
import { AgentAppAgentsManager } from '../agent/managers/AgentAppAgentsManager'
import type { TldrawAgent } from '../agent/TldrawAgent'
import type { ProblemFrameShape } from '../shapes/ProblemFrameShapeUtil'
import { triageWork } from './learnerApi'
import { getProblemState, isInWorkArea } from './problemState'
import { getLatestProblemFrame, isTutorShape } from './tutorMarks'

/** The longest side of the triage image, in pixels. */
const MAX_IMAGE_SIDE = 1600

/**
 * Proactive watching (PLAN §3, pedagogy-spec M8), on only when the student opts in. After the
 * board has been quiet for a few seconds, it asks `/triage` whether the open problem's work has
 * a clear error the student has moved past, and if so starts a Watch turn. It stays quiet
 * otherwise: see `checkWatchGate` for every condition.
 */
export class ProactiveWatcher {
	private timer: ReturnType<typeof setTimeout> | null = null
	private stopListening: (() => void) | null = null
	private logs = new Map<string, WatchLog>()
	private lastTriageAt = 0
	private inFlight = false

	constructor(private readonly agent: TldrawAgent) {}

	start() {
		if (this.stopListening) return
		this.stopListening = this.agent.editor.store.listen(() => this.schedule(), { source: 'user', scope: 'document' })
		this.schedule()
	}

	stop() {
		this.stopListening?.()
		this.stopListening = null
		if (this.timer) clearTimeout(this.timer)
		this.timer = null
	}

	/** Restart the idle timer on every board change. */
	private schedule() {
		if (this.timer) clearTimeout(this.timer)
		this.timer = setTimeout(() => void this.onIdle(), WATCH_IDLE_MS)
	}

	private isGenerating() {
		return AgentAppAgentsManager.getAgents(this.agent.editor).some((agent) => agent.requests.isGenerating())
	}

	private getStudentWork(frame: ProblemFrameShape): TLShape[] {
		const { editor } = this.agent
		return editor
			.getCurrentPageShapesSorted()
			.filter((shape) => shape.id !== frame.id && !isTutorShape(editor, shape.id) && isInWorkArea(editor, frame, shape.id))
	}

	private snapshot(frame: ProblemFrameShape, work: TLShape[]): WatchSnapshot {
		const state = getProblemState(frame)
		const editor = this.agent.editor
		return {
			problemId: state.problemId,
			status: state.status,
			verification: state.verification,
			studentShapes: work.length,
			signature: hashString(JSON.stringify(work.map(({ id, x, y, rotation, props }) => [id, x, y, rotation, props]))),
			inkComplete:
				!editor.inputs.getIsPointing() &&
				work.every((shape) => !('isComplete' in shape.props) || shape.props.isComplete !== false),
			generating: this.isGenerating(),
		}
	}

	private async onIdle() {
		this.timer = null
		if (this.inFlight) return
		const { editor } = this.agent
		const frame = getLatestProblemFrame(editor)
		if (!frame) return
		const work = this.getStudentWork(frame)
		const snapshot = this.snapshot(frame, work)
		const log = this.logs.get(snapshot.problemId)
		const gate = checkWatchGate(snapshot, log, this.lastTriageAt, Date.now())
		if (!gate.ok) {
			console.debug(`[watch] skipped: ${gate.why}`)
			return
		}

		const nextLog = { triages: (log?.triages ?? 0) + 1, interventions: log?.interventions ?? 0, lastSignature: snapshot.signature }
		this.logs.set(snapshot.problemId, nextLog)
		this.lastTriageAt = Date.now()
		this.inFlight = true
		try {
			const image = await this.getImage(frame)
			if (!image) return
			const decision = await triageWork({
				problemId: snapshot.problemId,
				title: frame.props.title,
				statement: frame.props.statement,
				image,
				shapes: this.describeShapes(frame),
			})
			if (decision.error) console.warn('[watch] triage failed:', decision.error)
			console.debug(`[watch] triage: ${decision.intervene ? 'step in' : 'stay quiet'}: ${decision.reason}`)
			if (!decision.intervene || !this.stopListening) return

			// Only step in on the work triage saw, and never over a turn the student started.
			const latest = getLatestProblemFrame(editor)
			if (!latest || latest.id !== frame.id || this.isGenerating()) return
			if (this.snapshot(latest, this.getStudentWork(latest)).signature !== snapshot.signature) return

			nextLog.interventions++
			this.agent.tutor.beginTurn('watch', { watchReason: `${decision.reason} (shape ${decision.shapeId})` })
			this.agent.interrupt({
				input: {
					agentMessages: [WATCH_MESSAGE],
					userMessages: [WATCH_CHAT_LINE],
					bounds: editor.getShapePageBounds(frame) ?? editor.getViewportPageBounds(),
					source: 'other-agent',
					contextItems: [],
				},
			})
		} finally {
			this.inFlight = false
		}
	}

	/** A JPEG of the whole problem frame, statement and work. */
	private async getImage(frame: ProblemFrameShape): Promise<string | null> {
		const { editor } = this.agent
		const bounds = editor.getShapePageBounds(frame)
		if (!bounds) return null
		const shapes = editor
			.getCurrentPageShapesSorted()
			.filter((shape) => {
				const box = editor.getShapePageBounds(shape)
				return !!box && bounds.includes(box)
			})
		const side = Math.max(bounds.w, bounds.h)
		const result = await editor.toImage(shapes, {
			format: 'jpeg',
			background: true,
			bounds: Box.From(bounds),
			padding: 0,
			pixelRatio: 1,
			scale: side > MAX_IMAGE_SIDE ? MAX_IMAGE_SIDE / side : 1,
		})
		return FileHelpers.blobToDataUrl(result.blob)
	}

	/** Every shape in the work area, student and tutor, top to bottom. */
	private describeShapes(frame: ProblemFrameShape): TriageShape[] {
		const { editor } = this.agent
		return editor
			.getCurrentPageShapesSorted()
			.filter((shape) => shape.id !== frame.id && isInWorkArea(editor, frame, shape.id))
			.map((shape): TriageShape | null => {
				const box = editor.getShapePageBounds(shape)
				if (!box) return null
				const tutor = isTutorShape(editor, shape.id)
				const text = tutor ? String(shape.meta.note ?? 'tutor') : editor.getShapeUtil(shape).getText(shape)
				return {
					id: convertTldrawIdToSimpleId(shape.id),
					author: tutor ? 'tutor' : 'student',
					type: shape.type,
					...(text ? { text: text.slice(0, 2000) } : {}),
					x: Math.round(box.x),
					y: Math.round(box.y),
					w: Math.round(box.w),
					h: Math.round(box.h),
				}
			})
			.filter((shape): shape is TriageShape => !!shape)
			.sort((a, b) => a.y - b.y || a.x - b.x)
	}
}
