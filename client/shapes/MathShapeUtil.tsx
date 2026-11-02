import { RefObject, useLayoutEffect, useMemo, useRef } from 'react'
import {
	DefaultColorStyle,
	Editor,
	getColorValue,
	HTMLContainer,
	RecordProps,
	Rectangle2d,
	ShapeUtil,
	T,
	TLDefaultColorStyle,
	TLShape,
	TLShapeId,
	useEditor,
	useValue,
} from 'tldraw'
import { renderLatex } from './latex'

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		math: { w: number; h: number; latex: string; color: TLDefaultColorStyle }
	}
}

export type MathShape = TLShape<'math'>

/** The class both the shape and the pre-placement measurement use. */
export const MATH_CLASS = 'tutor-math'

/**
 * Typeset math the tutor writes on the board (`write-math`). It sizes itself to the
 * rendered KaTeX, so it can't be resized by hand.
 */
export class MathShapeUtil extends ShapeUtil<MathShape> {
	static override type = 'math' as const
	static override props: RecordProps<MathShape> = {
		w: T.number,
		h: T.number,
		latex: T.string,
		color: DefaultColorStyle,
	}

	override getDefaultProps(): MathShape['props'] {
		return { w: 40, h: 40, latex: 'x', color: 'violet' }
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

	override getGeometry(shape: MathShape) {
		return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
	}

	override getText(shape: MathShape) {
		return shape.props.latex
	}

	override component(shape: MathShape) {
		return <MathComponent shape={shape} />
	}

	override getIndicatorPath(shape: MathShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}

function MathComponent({ shape }: { shape: MathShape }) {
	const editor = useEditor()
	const ref = useRef<HTMLDivElement>(null)
	const html = useMemo(() => renderLatex(shape.props.latex, true), [shape.props.latex])
	const color = useValue(
		'math color',
		() => getColorValue(editor.getCurrentTheme().colors[editor.getColorMode()], shape.props.color, 'solid'),
		[editor, shape.props.color]
	)
	useFitToContent(editor, shape.id, ref)

	return (
		<HTMLContainer>
			<div ref={ref} className={MATH_CLASS} style={{ color }} dangerouslySetInnerHTML={{ __html: html }} />
		</HTMLContainer>
	)
}

/** Keep `w` and `h` equal to the rendered size. The shape is locked, so ignore the lock. */
function useFitToContent(editor: Editor, id: TLShapeId, ref: RefObject<HTMLElement | null>) {
	useLayoutEffect(() => {
		const el = ref.current
		if (!el) return

		const fit = () => {
			const shape = editor.getShape<MathShape>(id)
			const w = Math.ceil(el.offsetWidth)
			const h = Math.ceil(el.offsetHeight)
			if (!shape || w === 0 || h === 0) return
			if (shape.props.w === w && shape.props.h === h) return
			editor.run(() => editor.updateShape<MathShape>({ id, type: 'math', props: { w, h } }), {
				ignoreShapeLock: true,
				history: 'ignore',
			})
		}

		fit()
		const observer = new ResizeObserver(fit)
		observer.observe(el)
		return () => observer.disconnect()
	}, [editor, id, ref])
}
