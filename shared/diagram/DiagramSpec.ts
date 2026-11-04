import z from 'zod'

/**
 * The tutor's representation library (PLAN §3): structured diagrams the tutor places with
 * one `diagram` action instead of drawing each line with `create` or `pen`. The model sends
 * a spec; `layoutDiagram` turns it into SVG primitives and `describeDiagram` into the text
 * the model reads back.
 *
 * Labels are plain text, not LaTeX, so they render the same on the board and in the model's
 * screenshots.
 */

export const DIAGRAM_LIMITS = {
	treeDepth: 4,
	treeLeaves: 16,
	tableRows: 8,
	tableColumns: 8,
	vennSets: 3,
	numberLineTicks: 40,
	numberLineMarks: 8,
	plotCurves: 3,
	plotPoints: 12,
	matrixSize: 8,
} as const

export interface TreeBranch {
	label: string
	probability: string
	outcome: string
	branches: TreeBranch[]
}

export const TreeBranchSchema: z.ZodType<TreeBranch> = z.lazy(() =>
	z.object({
		label: z.string(),
		probability: z.string(),
		outcome: z.string(),
		branches: z.array(TreeBranchSchema),
	})
)

export const TreeDiagramSchema = z.object({
	kind: z.literal('tree'),
	root: z.string(),
	branches: z.array(TreeBranchSchema).min(1),
})

export const TableDiagramSchema = z.object({
	kind: z.literal('table'),
	corner: z.string(),
	columns: z.array(z.string()).min(1).max(DIAGRAM_LIMITS.tableColumns),
	rows: z
		.array(z.object({ label: z.string(), cells: z.array(z.string()) }))
		.min(1)
		.max(DIAGRAM_LIMITS.tableRows),
	highlightRows: z.array(z.number().int()),
	highlightColumns: z.array(z.number().int()),
})

export const VennDiagramSchema = z.object({
	kind: z.literal('venn'),
	universe: z.string(),
	sets: z.array(z.string()).min(1).max(DIAGRAM_LIMITS.vennSets),
	regions: z.array(z.object({ in: z.array(z.string()), label: z.string(), shaded: z.boolean() })),
})

export const NumberLineDiagramSchema = z.object({
	kind: z.literal('number-line'),
	min: z.number(),
	max: z.number(),
	step: z.number(),
	points: z
		.array(z.object({ value: z.number(), label: z.string(), open: z.boolean() }))
		.max(DIAGRAM_LIMITS.numberLineMarks),
	intervals: z
		.array(
			z.object({
				from: z.number().nullable(),
				to: z.number().nullable(),
				includeFrom: z.boolean(),
				includeTo: z.boolean(),
				label: z.string(),
			})
		)
		.max(DIAGRAM_LIMITS.numberLineMarks),
})

export const PlotDiagramSchema = z.object({
	kind: z.literal('plot'),
	xMin: z.number(),
	xMax: z.number(),
	yMin: z.number(),
	yMax: z.number(),
	xLabel: z.string(),
	yLabel: z.string(),
	curves: z.array(z.object({ expression: z.string(), label: z.string() })).max(DIAGRAM_LIMITS.plotCurves),
	points: z.array(z.object({ x: z.number(), y: z.number(), label: z.string() })).max(DIAGRAM_LIMITS.plotPoints),
})

export const MatrixDiagramSchema = z.object({
	kind: z.literal('matrix'),
	name: z.string(),
	rows: z.array(z.array(z.string()).min(1).max(DIAGRAM_LIMITS.matrixSize)).min(1).max(DIAGRAM_LIMITS.matrixSize),
	highlightRows: z.array(z.number().int()),
	highlightColumns: z.array(z.number().int()),
})

export const DiagramSpecSchema = z.discriminatedUnion('kind', [
	TreeDiagramSchema,
	TableDiagramSchema,
	VennDiagramSchema,
	NumberLineDiagramSchema,
	PlotDiagramSchema,
	MatrixDiagramSchema,
])

export type DiagramSpec = z.infer<typeof DiagramSpecSchema>
export type DiagramKind = DiagramSpec['kind']
export type TreeDiagram = z.infer<typeof TreeDiagramSchema>
export type TableDiagram = z.infer<typeof TableDiagramSchema>
export type VennDiagram = z.infer<typeof VennDiagramSchema>
export type NumberLineDiagram = z.infer<typeof NumberLineDiagramSchema>
export type PlotDiagram = z.infer<typeof PlotDiagramSchema>
export type MatrixDiagram = z.infer<typeof MatrixDiagramSchema>

export const DIAGRAM_KIND_NAMES: Record<DiagramKind, string> = {
	tree: 'probability tree',
	table: 'table',
	venn: 'Venn diagram',
	'number-line': 'number line',
	plot: 'function plot',
	matrix: 'matrix',
}
