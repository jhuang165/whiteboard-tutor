import { KeyboardEvent, useMemo, useRef, useState } from 'react'
import {
	HTMLContainer,
	RecordProps,
	Rectangle2d,
	ShapeUtil,
	stopEventPropagation,
	T,
	TLShape,
	useEditor,
} from 'tldraw'
import { renderLatex, renderTextWithMath } from './latex'
import { useFitToContent } from './MathShapeUtil'

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		transcription: {
			w: number
			h: number
			latex: string
			confidence: 'high' | 'low'
			unsure: string
			correction: string
		}
	}
}

export type TranscriptionShape = TLShape<'transcription'>

export const TRANSCRIPTION_CLASS = 'tutor-transcription'

/**
 * "Here's what I read" (pedagogy-spec C3): the tutor's reading of one line of the student's
 * handwriting, shown faintly beside it before the tutor judges it. A low-confidence read is
 * dashed and names the unsure part. The student can click it and type what they actually
 * wrote; the tutor sees that correction in its shape list on the next turn.
 */
export class TranscriptionShapeUtil extends ShapeUtil<TranscriptionShape> {
	static override type = 'transcription' as const
	static override props: RecordProps<TranscriptionShape> = {
		w: T.number,
		h: T.number,
		latex: T.string,
		confidence: T.literalEnum('high', 'low'),
		unsure: T.string,
		correction: T.string,
	}

	override getDefaultProps(): TranscriptionShape['props'] {
		return { w: 80, h: 40, latex: '', confidence: 'high', unsure: '', correction: '' }
	}

	override canResize() {
		return false
	}

	override canEdit() {
		return false
	}

	override hideRotateHandle() {
		return true
	}

	override getGeometry(shape: TranscriptionShape) {
		return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
	}

	/** What the model reads in its shape list. */
	override getText(shape: TranscriptionShape) {
		const { latex, confidence, unsure, correction } = shape.props
		const parts = [`read (${confidence} confidence): ${latex}`]
		if (unsure) parts.push(`unsure: ${unsure}`)
		if (correction) parts.push(`the student corrected it to: ${correction}`)
		return parts.join('; ')
	}

	override component(shape: TranscriptionShape) {
		return <TranscriptionComponent shape={shape} />
	}

	override getIndicatorPath(shape: TranscriptionShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}

function TranscriptionComponent({ shape }: { shape: TranscriptionShape }) {
	const editor = useEditor()
	const ref = useRef<HTMLDivElement>(null)
	const [editing, setEditing] = useState(false)
	const { latex, confidence, unsure, correction } = shape.props
	const readHtml = useMemo(() => renderLatex(latex, false), [latex])
	const correctionHtml = useMemo(() => (correction ? renderTextWithMath(correction) : ''), [correction])
	useFitToContent(editor, shape.id, ref)

	const save = (value: string) => {
		setEditing(false)
		const next = value.trim()
		if (next === correction) return
		// The chip is locked so the student can't move it, but the correction is theirs to make.
		editor.run(
			() => editor.updateShape<TranscriptionShape>({ id: shape.id, type: 'transcription', props: { correction: next } }),
			{ ignoreShapeLock: true }
		)
	}

	const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		e.stopPropagation()
		if (e.key === 'Enter') save(e.currentTarget.value)
		if (e.key === 'Escape') setEditing(false)
	}

	return (
		<HTMLContainer>
			<div ref={ref} className={TRANSCRIPTION_CLASS} data-confidence={confidence} data-corrected={!!correction}>
				<div className="tutor-transcription-label">Here's what I read{confidence === 'low' ? ' (not sure)' : ''}</div>
				<div className="tutor-transcription-read" dangerouslySetInnerHTML={{ __html: readHtml }} />
				{unsure && <div className="tutor-transcription-unsure">{unsure}</div>}
				{correction && !editing && (
					<div className="tutor-transcription-correction">
						You wrote: <span dangerouslySetInnerHTML={{ __html: correctionHtml }} />
					</div>
				)}
				{editing ? (
					<input
						className="tutor-transcription-input"
						autoFocus
						defaultValue={correction}
						placeholder="What did you write?"
						onPointerDown={stopEventPropagation}
						onKeyDown={onKeyDown}
						onBlur={(e) => save(e.currentTarget.value)}
					/>
				) : (
					<button
						type="button"
						className="tutor-transcription-fix"
						onPointerDown={stopEventPropagation}
						onClick={() => setEditing(true)}
					>
						{correction ? 'Edit' : 'Not what I wrote'}
					</button>
				)}
			</div>
		</HTMLContainer>
	)
}
