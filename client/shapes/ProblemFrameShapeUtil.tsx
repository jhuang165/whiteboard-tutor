import { useLayoutEffect, useMemo, useRef } from 'react'
import {
	HTMLContainer,
	RecordProps,
	Rectangle2d,
	ShapeUtil,
	T,
	TLShape,
	TLShapeId,
	useEditor,
	Editor,
} from 'tldraw'
import { renderTextWithMath } from './latex'

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		'problem-frame': { w: number; h: number; headerH: number; title: string; statement: string }
	}
}

export type ProblemFrameShape = TLShape<'problem-frame'>

export const PROBLEM_FRAME_WIDTH = 760
export const PROBLEM_WORK_HEIGHT = 480
export const PROBLEM_HEADER_CLASS = 'tutor-problem-header'

/**
 * One problem the tutor poses (pedagogy-spec M4): the statement in a header, with inline
 * `$...$` math, and an empty work area below it for the student's pen. The frame sits
 * behind everything and is locked, so the student writes over it freely.
 */
export class ProblemFrameShapeUtil extends ShapeUtil<ProblemFrameShape> {
	static override type = 'problem-frame' as const
	static override props: RecordProps<ProblemFrameShape> = {
		w: T.number,
		h: T.number,
		headerH: T.number,
		title: T.string,
		statement: T.string,
	}

	override getDefaultProps(): ProblemFrameShape['props'] {
		return {
			w: PROBLEM_FRAME_WIDTH,
			h: 80 + PROBLEM_WORK_HEIGHT,
			headerH: 80,
			title: 'Problem',
			statement: '',
		}
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

	override getGeometry(shape: ProblemFrameShape) {
		return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: false })
	}

	override getText(shape: ProblemFrameShape) {
		return `${shape.props.title}: ${shape.props.statement}`
	}

	override component(shape: ProblemFrameShape) {
		return <ProblemFrameComponent shape={shape} />
	}

	override getIndicatorPath(shape: ProblemFrameShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}

function ProblemFrameComponent({ shape }: { shape: ProblemFrameShape }) {
	const editor = useEditor()
	const headerRef = useRef<HTMLDivElement>(null)
	const statement = useMemo(() => renderTextWithMath(shape.props.statement), [shape.props.statement])
	useFitHeader(editor, shape.id, headerRef)

	return (
		<HTMLContainer className="tutor-problem-frame" style={{ width: shape.props.w, height: shape.props.h }}>
			<div ref={headerRef} className={PROBLEM_HEADER_CLASS}>
				<div className="tutor-problem-title">{shape.props.title}</div>
				<div dangerouslySetInnerHTML={{ __html: statement }} />
			</div>
			<div className="tutor-problem-work">Your work</div>
		</HTMLContainer>
	)
}

/** Grow or shrink the frame with its header, keeping the work area's height. */
function useFitHeader(editor: Editor, id: TLShapeId, ref: React.RefObject<HTMLDivElement | null>) {
	useLayoutEffect(() => {
		const el = ref.current
		if (!el) return

		const fit = () => {
			const shape = editor.getShape<ProblemFrameShape>(id)
			const headerH = Math.ceil(el.offsetHeight)
			if (!shape || headerH === 0 || shape.props.headerH === headerH) return
			const workH = shape.props.h - shape.props.headerH
			editor.run(
				() =>
					editor.updateShape<ProblemFrameShape>({
						id,
						type: 'problem-frame',
						props: { headerH, h: headerH + workH },
					}),
				{ ignoreShapeLock: true, history: 'ignore' }
			)
		}

		fit()
		const observer = new ResizeObserver(fit)
		observer.observe(el)
		return () => observer.disconnect()
	}, [editor, id, ref])
}
