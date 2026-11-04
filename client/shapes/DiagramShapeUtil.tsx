import { ReactElement, useMemo } from 'react'
import {
	getColorValue,
	HTMLContainer,
	RecordProps,
	Rectangle2d,
	ShapeUtil,
	SvgExportContext,
	T,
	TLShape,
	useEditor,
	useValue,
} from 'tldraw'
import { describeDiagram } from '../../shared/diagram/describe'
import { DiagramSpec, DiagramSpecSchema } from '../../shared/diagram/DiagramSpec'
import { DiagramItem, DiagramLayout, Dash, Fill, layoutDiagram, Tone } from '../../shared/diagram/layout'

declare module 'tldraw' {
	export interface TLGlobalShapePropsMap {
		diagram: { w: number; h: number; spec: string; title: string }
	}
}

export type DiagramShape = TLShape<'diagram'>

/** The spec stored on a shape, or null if it doesn't parse (an older or hand-edited record). */
export function readDiagramSpec(shape: DiagramShape): DiagramSpec | null {
	try {
		const parsed = DiagramSpecSchema.safeParse(JSON.parse(shape.props.spec))
		return parsed.success ? parsed.data : null
	} catch {
		return null
	}
}

/**
 * A diagram from the representation library (`diagram` action): a probability tree, table,
 * Venn diagram, number line, function plot, or matrix. The layout is computed from the spec
 * in `shared/diagram/layout.ts`, so the shape is drawn as plain SVG and shows up the same in
 * exports and in the model's screenshots.
 */
export class DiagramShapeUtil extends ShapeUtil<DiagramShape> {
	static override type = 'diagram' as const
	static override props: RecordProps<DiagramShape> = {
		w: T.number,
		h: T.number,
		spec: T.string,
		title: T.string,
	}

	override getDefaultProps(): DiagramShape['props'] {
		return { w: 100, h: 100, spec: '{}', title: '' }
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

	override getGeometry(shape: DiagramShape) {
		return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true })
	}

	override getText(shape: DiagramShape) {
		const spec = readDiagramSpec(shape)
		return spec ? describeDiagram(spec, shape.props.title) : shape.props.title
	}

	override component(shape: DiagramShape) {
		return <DiagramComponent shape={shape} />
	}

	override toSvg(shape: DiagramShape, ctx: SvgExportContext) {
		const spec = readDiagramSpec(shape)
		if (!spec) return null
		const palette = getPalette(this.editor.getCurrentTheme().colors[ctx.colorMode])
		return renderDiagram(layoutDiagram(spec, shape.props.title), palette, svgId(shape.id))
	}

	override getIndicatorPath(shape: DiagramShape) {
		const path = new Path2D()
		path.rect(0, 0, shape.props.w, shape.props.h)
		return path
	}
}

function DiagramComponent({ shape }: { shape: DiagramShape }) {
	const editor = useEditor()
	const layout = useMemo(() => {
		const spec = readDiagramSpec(shape)
		return spec ? layoutDiagram(spec, shape.props.title) : null
	}, [shape])
	const palette = useValue('diagram palette', () => getPalette(editor.getCurrentTheme().colors[editor.getColorMode()]), [
		editor,
	])
	if (!layout) return null

	return (
		<HTMLContainer>
			<svg width={layout.w} height={layout.h} viewBox={`0 0 ${layout.w} ${layout.h}`} style={{ overflow: 'visible' }}>
				{renderDiagram(layout, palette, svgId(shape.id))}
			</svg>
		</HTMLContainer>
	)
}

interface Palette {
	ink: string
	text: string
	muted: string
	paper: string
	tint: string
}

type ThemeColors = ReturnType<ReturnType<typeof useEditor>['getCurrentTheme']>['colors']['light']

function getPalette(colors: ThemeColors): Palette {
	return {
		ink: getColorValue(colors, 'violet', 'solid'),
		text: colors.text,
		muted: getColorValue(colors, 'grey', 'solid'),
		paper: colors.background,
		tint: getColorValue(colors, 'violet', 'semi'),
	}
}

const FONT_FAMILY = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

const DASHES: Record<Dash, string | undefined> = { solid: undefined, dashed: '7 5', dotted: '1.5 4' }

/** A prefix for clip and mask ids, unique per shape so exports with several diagrams don't clash. */
function svgId(id: string) {
	return `diagram-${id.replace(/[^a-zA-Z0-9_-]/g, '_')}`
}

/** Every layout item as SVG, in a group translated by the layout's offset. */
export function renderDiagram(layout: DiagramLayout, palette: Palette, prefix: string): ReactElement {
	const tone = (t: Tone | 'none') => (t === 'none' ? 'none' : palette[t])
	const fill = (f: Fill) => (f === 'none' ? 'none' : palette[f])
	const defs: ReactElement[] = []
	const clipId = `${prefix}-clip`
	if (layout.clip) {
		const c = layout.clip
		defs.push(
			<clipPath key="clip" id={clipId}>
				<rect x={c.x} y={c.y} width={c.w} height={c.h} />
			</clipPath>
		)
	}

	const body = layout.items.map((item: DiagramItem, i) => {
		switch (item.t) {
			case 'line':
				return (
					<line
						key={i}
						x1={item.x1}
						y1={item.y1}
						x2={item.x2}
						y2={item.y2}
						stroke={tone(item.tone)}
						strokeWidth={item.width}
						strokeDasharray={DASHES[item.dash]}
						strokeLinecap="round"
					/>
				)
			case 'path':
				return (
					<path
						key={i}
						d={item.d}
						stroke={tone(item.tone)}
						strokeWidth={item.width}
						strokeDasharray={DASHES[item.dash]}
						strokeLinecap="round"
						strokeLinejoin="round"
						fill={fill(item.fill)}
						clipPath={item.clip && layout.clip ? `url(#${clipId})` : undefined}
					/>
				)
			case 'circle':
				return (
					<circle
						key={i}
						cx={item.cx}
						cy={item.cy}
						r={item.r}
						stroke={tone(item.tone)}
						strokeWidth={item.width}
						fill={fill(item.fill)}
					/>
				)
			case 'rect':
				return (
					<rect
						key={i}
						x={item.x}
						y={item.y}
						width={item.w}
						height={item.h}
						stroke={tone(item.tone)}
						strokeWidth={item.width || undefined}
						fill={fill(item.fill)}
					/>
				)
			case 'text':
				return (
					<text
						key={i}
						x={item.x}
						y={item.y}
						fontSize={item.size}
						fontFamily={FONT_FAMILY}
						fontWeight={item.bold ? 600 : 400}
						textAnchor={item.anchor}
						dominantBaseline="central"
						fill={tone(item.tone)}
					>
						{item.text}
					</text>
				)
			case 'region': {
				// Inside every included circle (nested clips), outside every excluded one (a mask).
				const id = `${prefix}-region-${i}`
				const b = item.bounds
				defs.push(
					...item.include.map((c, j) => (
						<clipPath key={`${id}-in-${j}`} id={`${id}-in-${j}`}>
							<circle cx={c.cx} cy={c.cy} r={c.r} />
						</clipPath>
					)),
					<mask key={`${id}-out`} id={`${id}-out`} maskUnits="userSpaceOnUse" x={b.x} y={b.y} width={b.w} height={b.h}>
						<rect x={b.x} y={b.y} width={b.w} height={b.h} fill="white" />
						{item.exclude.map((c, j) => (
							<circle key={j} cx={c.cx} cy={c.cy} r={c.r} fill="black" />
						))}
					</mask>
				)
				let shape: ReactElement = (
					<rect x={b.x} y={b.y} width={b.w} height={b.h} fill={palette.tint} mask={`url(#${id}-out)`} />
				)
				item.include.forEach((_, j) => {
					shape = <g clipPath={`url(#${id}-in-${j})`}>{shape}</g>
				})
				return <g key={i}>{shape}</g>
			}
		}
	})

	return (
		<g transform={`translate(${layout.dx} ${layout.dy})`}>
			{defs.length > 0 && <defs>{defs}</defs>}
			{body}
		</g>
	)
}
