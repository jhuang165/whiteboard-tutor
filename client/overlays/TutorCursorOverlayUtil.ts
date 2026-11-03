import { Editor, OverlayUtil, TLOverlay } from 'tldraw'
import { TutorCursor, TutorPresence } from '../tutor/TutorPresence'

interface TutorCursorOverlay extends TLOverlay {
	type: 'tutor-cursor'
	props: TutorCursor
}

/** The classic pointer outline, tip at the origin, in screen pixels. */
const POINTER: [number, number][] = [
	[0, 0],
	[0, 17],
	[4.5, 13],
	[7.6, 20],
	[10.4, 18.8],
	[7.4, 12],
	[13, 12],
]
const LABEL_FONT = '600 11px system-ui, -apple-system, sans-serif'

/** Draws the tutor's cursor and name tag (PLAN §3 "Tutor presence"). */
export class TutorCursorOverlayUtil extends OverlayUtil<TutorCursorOverlay> {
	static override type = 'tutor-cursor' as const
	override options = { zIndex: 710 }

	private readonly presence: TutorPresence

	constructor(editor: Editor) {
		super(editor)
		this.presence = TutorPresence.get(editor)
	}

	override isActive(): boolean {
		return this.presence.$cursor.get() !== null
	}

	override getOverlays(): TutorCursorOverlay[] {
		const cursor = this.presence.$cursor.get()
		return cursor ? [{ id: 'tutor-cursor', type: 'tutor-cursor', props: cursor }] : []
	}

	override render(ctx: CanvasRenderingContext2D, overlays: TutorCursorOverlay[]): void {
		const colors = this.editor.getCurrentTheme().colors[this.editor.getColorMode()]
		const ink = colors.violet.solid
		const scale = 1 / this.editor.getZoomLevel()

		for (const { props } of overlays) {
			ctx.save()
			ctx.globalAlpha = props.opacity
			ctx.translate(props.x, props.y)
			ctx.scale(scale, scale)

			ctx.beginPath()
			POINTER.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)))
			ctx.closePath()
			ctx.fillStyle = ink
			ctx.fill()
			ctx.lineWidth = 1.5
			ctx.strokeStyle = colors.background
			ctx.stroke()

			// The dots cycle while the tutor thinks, so a long pause still looks alive.
			const label = `Tutor${'.'.repeat(props.dots)}`
			ctx.font = LABEL_FONT
			const textW = ctx.measureText('Tutor...').width
			const padX = 6
			const x = 12
			const y = 18
			ctx.beginPath()
			ctx.roundRect(x, y, textW + padX * 2, 18, 9)
			ctx.fillStyle = ink
			ctx.fill()
			ctx.fillStyle = colors.background
			ctx.textBaseline = 'middle'
			ctx.fillText(label, x + padX, y + 9.5)
			ctx.restore()
		}
	}
}
