import { describe, expect, it } from 'vitest'
import { describeDiagram } from './describe'
import { DiagramSpec, DiagramSpecSchema, TreeBranch } from './DiagramSpec'
import { compileExpression, tryCompileExpression } from './expression'
import { DiagramItem, formatNumber, itemsBounds, layoutDiagram, niceStep, samplePath, vennRegionKey } from './layout'

const texts = (items: DiagramItem[]) => items.filter((i) => i.t === 'text').map((i) => (i as { text: string }).text)

const bayesTree: DiagramSpec = {
	kind: 'tree',
	root: '',
	branches: [
		{
			label: 'D',
			probability: '0.01',
			outcome: '',
			branches: [
				{ label: '+', probability: '0.95', outcome: '0.0095', branches: [] },
				{ label: '−', probability: '0.05', outcome: '0.0005', branches: [] },
			],
		},
		{
			label: 'not D',
			probability: '0.99',
			outcome: '',
			branches: [
				{ label: '+', probability: '0.10', outcome: '0.099', branches: [] },
				{ label: '−', probability: '0.90', outcome: '0.891', branches: [] },
			],
		},
	],
}

describe('compileExpression', () => {
	const at = (source: string, x: number) => compileExpression(source)(x)

	it('follows precedence, with ^ right-associative and above unary minus', () => {
		expect(at('1 + 2 * 3', 0)).toBe(7)
		expect(at('2^3^2', 0)).toBe(512)
		expect(at('-x^2', 3)).toBe(-9)
		expect(at('(x - 1)/(x + 1)', 3)).toBe(0.5)
		expect(at('x**2', 4)).toBe(16)
	})

	it('reads implicit multiplication and run-together names', () => {
		expect(at('2x', 5)).toBe(10)
		expect(at('3(x+1)', 1)).toBe(6)
		expect(at('(x+1)(x-1)', 3)).toBe(8)
		expect(at('2pi', 0)).toBeCloseTo(2 * Math.PI)
		expect(at('xsin(x)', Math.PI / 2)).toBeCloseTo(Math.PI / 2)
		expect(at('x^2 - 3x + 2', 1)).toBe(0)
	})

	it('knows functions, constants, and absolute value bars', () => {
		expect(at('exp(-x^2/2)/sqrt(2pi)', 0)).toBeCloseTo(0.39894, 4)
		expect(at('ln(e)', 0)).toBeCloseTo(1)
		expect(at('log(100)', 0)).toBeCloseTo(2)
		expect(at('|x - 3|', 1)).toBe(2)
		expect(at('sin(x)^2 + cos(x)^2', 0.7)).toBeCloseTo(1)
		expect(at('sin x^2', 2)).toBeCloseTo(Math.sin(4))
		expect(at('1e-3 x', 1000)).toBeCloseTo(1)
		expect(at('2 − x', 1)).toBe(1)
	})

	it('rejects what it cannot read, without evaluating anything', () => {
		expect(tryCompileExpression('alert(1)')).toBeNull()
		expect(tryCompileExpression('x +')).toBeNull()
		expect(tryCompileExpression('(x')).toBeNull()
		expect(tryCompileExpression('y = x')).toBeNull()
		expect(tryCompileExpression('2|x|')).toBeNull()
	})
})

describe('layout helpers', () => {
	it('picks 1, 2, 5 steps and short tick labels', () => {
		expect(niceStep(10, 10)).toBe(1)
		expect(niceStep(1, 5)).toBe(0.2)
		expect(niceStep(300, 6)).toBe(50)
		expect(formatNumber(0.1 + 0.2)).toBe('0.3')
		expect(formatNumber(-0)).toBe('0')
	})

	it('matches Venn regions by set name, ignoring case and order', () => {
		expect(vennRegionKey(['A', 'B'], ['b', 'A'])).toBe('0,1')
		expect(vennRegionKey(['A', 'B'], [])).toBe('')
		expect(vennRegionKey(['A', 'B'], ['C'])).toBeNull()
	})

	it('breaks a path at an asymptote instead of drawing a vertical line', () => {
		const sx = (x: number) => x * 10
		const sy = (y: number) => -y * 10
		const d = samplePath((x) => 1 / x, -2, 2, -5, 5, sx, sy)
		expect(d.match(/M/g)!.length).toBeGreaterThanOrEqual(2)
		expect(samplePath(() => NaN, 0, 1, 0, 1, sx, sy)).toBe('')
	})
})

describe('layoutDiagram', () => {
	it('lays a tree out left to right with every label, outcome, and probability', () => {
		const layout = layoutDiagram(bayesTree, 'Disease test')
		const all = texts(layout.items)
		for (const value of ['D', 'not D', '+', '0.95', '0.99', '0.0095', '0.891', 'Disease test']) expect(all).toContain(value)
		// Four outcome rows, one per leaf, top to bottom.
		const outcomes = layout.items.filter((i) => i.t === 'text' && ['0.0095', '0.0005', '0.099', '0.891'].includes(i.text))
		const ys = outcomes.map((i) => (i as { y: number }).y)
		expect(ys).toEqual([...ys].sort((a, b) => a - b))
		expect(new Set(ys).size).toBe(4)
		expect(layout.warnings).toEqual([])
	})

	it('cuts a tree that is too deep or too wide, and says so', () => {
		const deep = (n: number): TreeBranch[] =>
			n === 0 ? [] : [{ label: `L${n}`, probability: '1', outcome: '', branches: deep(n - 1) }]
		const layout = layoutDiagram({ kind: 'tree', root: 'S', branches: deep(6) })
		expect(texts(layout.items)).toContain('L3')
		expect(texts(layout.items)).not.toContain('L2')
		expect(layout.warnings[0]).toMatch(/cut/)
	})

	it('puts the whole drawing inside its padded size', () => {
		const specs: DiagramSpec[] = [
			bayesTree,
			{
				kind: 'table',
				corner: '',
				columns: ['B', 'not B', 'Total'],
				rows: [
					{ label: 'A', cells: ['12', '8', '20'] },
					{ label: 'not A', cells: ['18', '62', '80'] },
				],
				highlightRows: [],
				highlightColumns: [0],
			},
			{
				kind: 'venn',
				universe: '100 students',
				sets: ['Math', 'Art', 'Music'],
				regions: [
					{ in: ['Math', 'Art'], label: '6', shaded: true },
					{ in: [], label: '40', shaded: false },
				],
			},
			{
				kind: 'number-line',
				min: -5,
				max: 5,
				step: 1,
				points: [{ value: 2, label: 'x = 2', open: true }],
				intervals: [{ from: -1, to: null, includeFrom: true, includeTo: false, label: 'x ≥ −1' }],
			},
			{
				kind: 'plot',
				xMin: -3,
				xMax: 3,
				yMin: -1,
				yMax: 9,
				xLabel: 'x',
				yLabel: 'y',
				curves: [
					{ expression: 'x^2', label: 'f(x) = x²' },
					{ expression: '2x + 1', label: 'tangent' },
				],
				points: [{ x: 1, y: 1, label: '(1, 1)' }],
			},
			{ kind: 'matrix', name: 'A', rows: [['1', '2'], ['3', '4']], highlightRows: [0], highlightColumns: [] },
		]
		for (const spec of specs) {
			expect(DiagramSpecSchema.safeParse(spec).success).toBe(true)
			const layout = layoutDiagram(spec, 'A title')
			const box = itemsBounds(layout.items)
			expect(box.x + layout.dx).toBeGreaterThanOrEqual(0)
			expect(box.y + layout.dy).toBeGreaterThanOrEqual(0)
			expect(box.x + box.w + layout.dx).toBeLessThanOrEqual(layout.w)
			expect(box.y + box.h + layout.dy).toBeLessThanOrEqual(layout.h)
			expect(layout.warnings).toEqual([])
		}
	})

	it('shades a Venn region inside its sets and outside the others', () => {
		const layout = layoutDiagram({
			kind: 'venn',
			universe: '',
			sets: ['A', 'B'],
			regions: [{ in: ['A'], label: '30', shaded: true }],
		})
		const region = layout.items.find((i) => i.t === 'region')
		expect(region).toMatchObject({ include: [{ cx: 120 }], exclude: [{ cx: 220 }] })
	})

	it('reports curves it cannot draw instead of failing', () => {
		const layout = layoutDiagram({
			kind: 'plot',
			xMin: 0,
			xMax: 1,
			yMin: 0,
			yMax: 1,
			xLabel: '',
			yLabel: '',
			curves: [{ expression: 'x +* 2', label: '' }],
			points: [],
		})
		expect(layout.items.some((i) => i.t === 'path' && i.clip)).toBe(false)
		expect(layout.warnings[0]).toMatch(/could not read/)
	})
})

describe('describeDiagram', () => {
	it('spells out every path of a tree', () => {
		expect(describeDiagram(bayesTree)).toBe(
			'probability tree: D (0.01) → + (0.95) = 0.0095; D (0.01) → − (0.05) = 0.0005; not D (0.99) → + (0.10) = 0.099; not D (0.99) → − (0.90) = 0.891'
		)
	})

	it('names highlighted table columns and shaded Venn regions', () => {
		expect(
			describeDiagram(
				{
					kind: 'table',
					corner: '',
					columns: ['B', 'not B'],
					rows: [{ label: 'A', cells: ['12', '8'] }],
					highlightRows: [],
					highlightColumns: [0],
				},
				'Counts'
			)
		).toBe('table "Counts":  | B | not B / A | 12 | 8 (highlighted: column B)')
		expect(
			describeDiagram({
				kind: 'venn',
				universe: 'S',
				sets: ['A', 'B'],
				regions: [
					{ in: ['A', 'B'], label: '10', shaded: true },
					{ in: [], label: '50', shaded: false },
				],
			})
		).toBe('Venn diagram: sets A, B in S; A and B 10 (shaded); outside all 50')
	})

	it('writes number line intervals in interval notation', () => {
		expect(
			describeDiagram({
				kind: 'number-line',
				min: -5,
				max: 5,
				step: 1,
				points: [],
				intervals: [{ from: -1, to: null, includeFrom: true, includeTo: false, label: '' }],
			})
		).toBe('number line: from -5 to 5; [-1, ∞)')
	})
})
