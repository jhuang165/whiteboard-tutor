import {
	DIAGRAM_LIMITS,
	DiagramSpec,
	MatrixDiagram,
	NumberLineDiagram,
	PlotDiagram,
	TableDiagram,
	TreeBranch,
	TreeDiagram,
	VennDiagram,
} from './DiagramSpec'
import { tryCompileExpression } from './expression'

/**
 * Layout for the representation library: a diagram spec becomes a list of SVG primitives
 * with no DOM, so the board shape and its export draw the same thing and it can be tested.
 * Text widths are estimated from character classes, since layout runs before any render.
 */

/** `ink` is the tutor's violet, `text` the theme's text color, `muted` a grey. */
export type Tone = 'ink' | 'text' | 'muted'
/** `tint` is a faint violet wash, `paper` the board background. */
export type Fill = 'none' | 'ink' | 'paper' | 'tint'
export type Dash = 'solid' | 'dashed' | 'dotted'

export interface Rect {
	x: number
	y: number
	w: number
	h: number
}

export interface Circle {
	cx: number
	cy: number
	r: number
}

export type DiagramItem =
	| { t: 'line'; x1: number; y1: number; x2: number; y2: number; tone: Tone; width: number; dash: Dash }
	| { t: 'path'; d: string; tone: Tone; width: number; dash: Dash; fill: Fill; bounds: Rect; clip: boolean }
	| ({ t: 'circle'; tone: Tone; width: number; fill: Fill } & Circle)
	| ({ t: 'rect'; tone: Tone | 'none'; width: number; fill: Fill } & Rect)
	| { t: 'text'; x: number; y: number; text: string; size: number; anchor: 'start' | 'middle' | 'end'; tone: Tone; bold: boolean }
	/** A Venn region: inside every `include` circle and outside every `exclude` one. */
	| { t: 'region'; include: Circle[]; exclude: Circle[]; bounds: Rect }

export interface DiagramLayout {
	/** Size of the drawing, padding included. */
	w: number
	h: number
	/** Translate every item by this before drawing. */
	dx: number
	dy: number
	items: DiagramItem[]
	/** Clip rect for items with `clip: true` (plot curves), in item coordinates. */
	clip: Rect | null
	/** Parts of the spec that couldn't be drawn, such as an unreadable curve. */
	warnings: string[]
}

const FONT = 15
const SMALL = 13
const PAD = 10

/** A rough width for plain sans-serif text, good to a few pixels for labels. */
export function textWidth(text: string, size = FONT, bold = false): number {
	let units = 0
	for (const ch of text) {
		if ('il.,:;|!\'()[]1 '.includes(ch)) units += 0.32
		else if ('mwMW'.includes(ch)) units += 0.86
		else if (/[A-Z0-9]/.test(ch)) units += 0.64
		else units += 0.55
	}
	return units * size * (bold ? 1.06 : 1)
}

/** A short decimal for tick labels: 0.1 + 0.2 shows as 0.3. */
export function formatNumber(n: number): string {
	if (Object.is(n, -0) || Math.abs(n) < 1e-12) return '0'
	const rounded = Number(n.toPrecision(10))
	if (Math.abs(rounded) >= 1e6 || Math.abs(rounded) < 1e-4) return rounded.toExponential(2).replace(/\.?0+e/, 'e')
	return String(rounded)
}

/** A tick step of 1, 2, or 5 times a power of ten, giving about `target` ticks over `span`. */
export function niceStep(span: number, target: number): number {
	if (!(span > 0) || !Number.isFinite(span)) return 1
	const raw = span / target
	const power = Math.pow(10, Math.floor(Math.log10(raw)))
	const scaled = raw / power
	const nice = scaled < 1.5 ? 1 : scaled < 3.5 ? 2 : scaled < 7.5 ? 5 : 10
	return nice * power
}

/** Multiples of `step` from `min` to `max`, inclusive, without float drift. */
function ticksBetween(min: number, max: number, step: number): number[] {
	const out: number[] = []
	const first = Math.ceil(min / step - 1e-9)
	const last = Math.floor(max / step + 1e-9)
	for (let k = first; k <= last && out.length <= 200; k++) out.push(Number((k * step).toPrecision(12)))
	return out
}

const line = (x1: number, y1: number, x2: number, y2: number, tone: Tone, width = 1.5, dash: Dash = 'solid'): DiagramItem => ({
	t: 'line',
	x1,
	y1,
	x2,
	y2,
	tone,
	width,
	dash,
})

const text = (
	x: number,
	y: number,
	value: string,
	opts: { size?: number; anchor?: 'start' | 'middle' | 'end'; tone?: Tone; bold?: boolean } = {}
): DiagramItem => ({
	t: 'text',
	x,
	y,
	text: value,
	size: opts.size ?? FONT,
	anchor: opts.anchor ?? 'start',
	tone: opts.tone ?? 'text',
	bold: opts.bold ?? false,
})

interface Body {
	items: DiagramItem[]
	clip?: Rect
	warnings?: string[]
}

export function layoutDiagram(spec: DiagramSpec, title = ''): DiagramLayout {
	const body = layoutBody(spec)
	const items = [...body.items]
	const caption = title.trim()
	if (caption) {
		const box = itemsBounds(items)
		items.push(text(box.x, box.y - 18, caption, { size: 14, tone: 'muted', bold: true }))
	}
	const box = itemsBounds(items)
	return {
		w: Math.ceil(box.w + PAD * 2),
		h: Math.ceil(box.h + PAD * 2),
		dx: PAD - box.x,
		dy: PAD - box.y,
		items,
		clip: body.clip ?? null,
		warnings: body.warnings ?? [],
	}
}

function layoutBody(spec: DiagramSpec): Body {
	switch (spec.kind) {
		case 'tree':
			return layoutTree(spec)
		case 'table':
			return layoutTable(spec)
		case 'venn':
			return layoutVenn(spec)
		case 'number-line':
			return layoutNumberLine(spec)
		case 'plot':
			return layoutPlot(spec)
		case 'matrix':
			return layoutMatrix(spec)
	}
}

/** The box every item covers, with text measured by `textWidth`. */
export function itemsBounds(items: DiagramItem[]): Rect {
	let minX = Infinity
	let minY = Infinity
	let maxX = -Infinity
	let maxY = -Infinity
	const add = (x0: number, y0: number, x1: number, y1: number) => {
		minX = Math.min(minX, x0)
		minY = Math.min(minY, y0)
		maxX = Math.max(maxX, x1)
		maxY = Math.max(maxY, y1)
	}
	for (const item of items) {
		switch (item.t) {
			case 'line':
				add(Math.min(item.x1, item.x2), Math.min(item.y1, item.y2), Math.max(item.x1, item.x2), Math.max(item.y1, item.y2))
				break
			case 'circle':
				add(item.cx - item.r, item.cy - item.r, item.cx + item.r, item.cy + item.r)
				break
			case 'rect':
				add(item.x, item.y, item.x + item.w, item.y + item.h)
				break
			case 'path':
			case 'region':
				add(item.bounds.x, item.bounds.y, item.bounds.x + item.bounds.w, item.bounds.y + item.bounds.h)
				break
			case 'text': {
				const w = textWidth(item.text, item.size, item.bold)
				const x0 = item.anchor === 'start' ? item.x : item.anchor === 'middle' ? item.x - w / 2 : item.x - w
				add(x0, item.y - item.size * 0.65, x0 + w, item.y + item.size * 0.65)
				break
			}
		}
	}
	if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 }
	return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// Tree ---------------------------------------------------------------------------------------

interface TreeNode {
	branch: TreeBranch
	depth: number
	children: TreeNode[]
	y: number
}

const TREE_ROW = 38

function layoutTree(spec: TreeDiagram): Body {
	const warnings: string[] = []
	let leaves = 0
	let truncated = false

	const build = (branch: TreeBranch, depth: number): TreeNode | null => {
		if (leaves >= DIAGRAM_LIMITS.treeLeaves) {
			truncated = true
			return null
		}
		const node: TreeNode = { branch, depth, children: [], y: 0 }
		const kids = depth < DIAGRAM_LIMITS.treeDepth ? branch.branches : []
		if (depth >= DIAGRAM_LIMITS.treeDepth && branch.branches.length) truncated = true
		for (const kid of kids) {
			const child = build(kid, depth + 1)
			if (child) node.children.push(child)
		}
		if (node.children.length === 0) {
			node.y = leaves * TREE_ROW
			leaves++
		} else {
			node.y = (node.children[0].y + node.children[node.children.length - 1].y) / 2
		}
		return node
	}

	const top = spec.branches.map((b) => build(b, 1)).filter((n): n is TreeNode => !!n)
	if (truncated) warnings.push(`tree cut to ${DIAGRAM_LIMITS.treeDepth} levels and ${DIAGRAM_LIMITS.treeLeaves} outcomes`)

	const all: TreeNode[] = []
	const walk = (n: TreeNode) => {
		all.push(n)
		n.children.forEach(walk)
	}
	top.forEach(walk)
	const maxDepth = Math.max(1, ...all.map((n) => n.depth))

	// Columns: each depth gets an edge wide enough for its probabilities, then its labels.
	const root = spec.root.trim()
	const rootY = top.length ? (top[0].y + top[top.length - 1].y) / 2 : 0
	const rootEnd = root ? textWidth(root) + 8 : 6
	const labelX: number[] = []
	let cursor = rootEnd
	for (let d = 1; d <= maxDepth; d++) {
		const atDepth = all.filter((n) => n.depth === d)
		const probW = Math.max(0, ...atDepth.map((n) => textWidth(n.branch.probability, SMALL)))
		const labelW = Math.max(10, ...atDepth.map((n) => textWidth(n.branch.label)))
		labelX[d] = cursor + Math.max(84, probW + 34) + 6
		cursor = labelX[d] + labelW + 8
	}
	const hasOutcomes = all.some((n) => n.children.length === 0 && n.branch.outcome.trim())
	const outcomeX = cursor + 18

	const items: DiagramItem[] = []
	if (root) items.push(text(0, rootY, root, { bold: true }))
	else items.push({ t: 'circle', cx: 3, cy: rootY, r: 3, tone: 'ink', width: 1, fill: 'ink' })

	const draw = (node: TreeNode, parentEnd: number, parentY: number) => {
		const x2 = labelX[node.depth] - 6
		items.push(line(parentEnd, parentY, x2, node.y, 'ink', 1.6))
		const prob = node.branch.probability.trim()
		if (prob) {
			// Above a rising branch, below a falling one, so the number never sits on the line.
			const below = node.y > parentY
			const mx = (parentEnd + x2) / 2
			const my = (parentY + node.y) / 2 + (below ? 11 : -11)
			items.push(text(mx, my, prob, { size: SMALL, anchor: 'middle', tone: 'ink' }))
		}
		const label = node.branch.label.trim()
		items.push(text(labelX[node.depth], node.y, label))
		const end = labelX[node.depth] + textWidth(label) + 6
		if (node.children.length === 0) {
			const outcome = node.branch.outcome.trim()
			if (outcome && hasOutcomes) {
				if (outcomeX - 6 - end > 10) items.push(line(end, node.y, outcomeX - 6, node.y, 'muted', 1, 'dotted'))
				items.push(text(outcomeX, node.y, outcome, { size: SMALL, tone: 'ink' }))
			}
		}
		for (const child of node.children) draw(child, end, node.y)
	}
	for (const node of top) draw(node, rootEnd, rootY)
	return { items, warnings }
}

// Table --------------------------------------------------------------------------------------

const ROW_H = 34
const CELL_PAD = 12

function layoutTable(spec: TableDiagram): Body {
	const columns = spec.columns
	const rows = spec.rows.map((row) => ({
		label: row.label,
		cells: columns.map((_, c) => row.cells[c] ?? ''),
	}))
	const widths = [
		Math.max(textWidth(spec.corner, FONT, true), ...rows.map((r) => textWidth(r.label, FONT, true))) + CELL_PAD * 2,
		...columns.map(
			(col, c) => Math.max(36, textWidth(col, FONT, true), ...rows.map((r) => textWidth(r.cells[c]))) + CELL_PAD * 2
		),
	]
	const xs = [0]
	for (const w of widths) xs.push(xs[xs.length - 1] + w)
	const totalW = xs[xs.length - 1]
	const totalH = (rows.length + 1) * ROW_H

	const items: DiagramItem[] = []
	// Highlights first, so lines and text sit on top. Indices count data rows and columns.
	for (const c of new Set(spec.highlightColumns)) {
		if (c < 0 || c >= columns.length) continue
		items.push({ t: 'rect', x: xs[c + 1], y: 0, w: widths[c + 1], h: totalH, tone: 'none', width: 0, fill: 'tint' })
	}
	for (const r of new Set(spec.highlightRows)) {
		if (r < 0 || r >= rows.length) continue
		items.push({ t: 'rect', x: 0, y: (r + 1) * ROW_H, w: totalW, h: ROW_H, tone: 'none', width: 0, fill: 'tint' })
	}

	for (let r = 2; r <= rows.length; r++) items.push(line(0, r * ROW_H, totalW, r * ROW_H, 'muted', 1))
	for (let c = 2; c < xs.length - 1; c++) items.push(line(xs[c], 0, xs[c], totalH, 'muted', 1))
	items.push(line(0, ROW_H, totalW, ROW_H, 'ink', 1.6))
	items.push(line(xs[1], 0, xs[1], totalH, 'ink', 1.6))
	items.push({ t: 'rect', x: 0, y: 0, w: totalW, h: totalH, tone: 'ink', width: 1.6, fill: 'none' })

	const mid = (c: number) => xs[c] + widths[c] / 2
	if (spec.corner.trim()) items.push(text(mid(0), ROW_H / 2, spec.corner, { anchor: 'middle', tone: 'muted', bold: true }))
	columns.forEach((col, c) => items.push(text(mid(c + 1), ROW_H / 2, col, { anchor: 'middle', bold: true })))
	rows.forEach((row, r) => {
		const y = (r + 1.5) * ROW_H
		items.push(text(mid(0), y, row.label, { anchor: 'middle', bold: true }))
		row.cells.forEach((cell, c) => items.push(text(mid(c + 1), y, cell, { anchor: 'middle' })))
	})
	return { items }
}

// Venn ---------------------------------------------------------------------------------------

interface VennGeometry {
	circles: Circle[]
	universe: Rect
	/** Label spot per region, keyed by the sorted indices of the sets it is inside. */
	spots: Record<string, { x: number; y: number }>
	/** Where each set's name goes. */
	names: { x: number; y: number; anchor: 'start' | 'middle' | 'end' }[]
}

const VENN: Record<1 | 2 | 3, VennGeometry> = {
	1: {
		circles: [{ cx: 160, cy: 130, r: 85 }],
		universe: { x: 0, y: 0, w: 320, h: 250 },
		spots: { '0': { x: 160, y: 130 } },
		names: [{ x: 160, y: 30, anchor: 'middle' }],
	},
	2: {
		circles: [
			{ cx: 120, cy: 130, r: 85 },
			{ cx: 220, cy: 130, r: 85 },
		],
		universe: { x: 0, y: 0, w: 340, h: 250 },
		spots: { '0': { x: 80, y: 130 }, '1': { x: 260, y: 130 }, '0,1': { x: 170, y: 130 } },
		names: [
			{ x: 100, y: 30, anchor: 'end' },
			{ x: 240, y: 30, anchor: 'start' },
		],
	},
	3: {
		circles: [
			{ cx: 150, cy: 125, r: 80 },
			{ cx: 230, cy: 125, r: 80 },
			{ cx: 190, cy: 195, r: 80 },
		],
		universe: { x: 0, y: 0, w: 380, h: 300 },
		spots: {
			'0': { x: 118, y: 106 },
			'1': { x: 262, y: 106 },
			'2': { x: 190, y: 234 },
			'0,1': { x: 190, y: 92 },
			'0,2': { x: 143, y: 176 },
			'1,2': { x: 237, y: 176 },
			'0,1,2': { x: 190, y: 148 },
		},
		names: [
			{ x: 118, y: 32, anchor: 'end' },
			{ x: 262, y: 32, anchor: 'start' },
			{ x: 262, y: 270, anchor: 'start' },
		],
	},
}

/** Region key from set names, or null if a name isn't one of the sets. */
export function vennRegionKey(sets: string[], names: string[]): string | null {
	const norm = (s: string) => s.trim().toLowerCase()
	const indices: number[] = []
	for (const name of names) {
		const i = sets.findIndex((s) => norm(s) === norm(name))
		if (i < 0) return null
		if (!indices.includes(i)) indices.push(i)
	}
	return indices.sort((a, b) => a - b).join(',')
}

function layoutVenn(spec: VennDiagram): Body {
	const warnings: string[] = []
	const sets = spec.sets.slice(0, DIAGRAM_LIMITS.vennSets)
	const geo = VENN[sets.length as 1 | 2 | 3]
	const items: DiagramItem[] = []
	const { universe, circles } = geo

	for (const region of spec.regions) {
		const key = vennRegionKey(sets, region.in)
		if (key === null) {
			warnings.push(`region ${region.in.join(' and ')} names a set that isn't drawn`)
			continue
		}
		if (!region.shaded) continue
		const inside = key === '' ? [] : key.split(',').map(Number)
		items.push({
			t: 'region',
			include: inside.map((i) => circles[i]),
			exclude: circles.filter((_, i) => !inside.includes(i)),
			bounds: universe,
		})
	}

	items.push({ t: 'rect', ...universe, tone: 'muted', width: 1.2, fill: 'none' })
	for (const c of circles) items.push({ t: 'circle', ...c, tone: 'ink', width: 1.8, fill: 'none' })
	sets.forEach((name, i) => {
		const spot = geo.names[i]
		items.push(text(spot.x, spot.y, name, { anchor: spot.anchor, tone: 'ink', bold: true }))
	})
	// Above the box, so it never crowds a set's name.
	if (spec.universe.trim()) items.push(text(universe.x + 2, universe.y - 12, spec.universe, { size: SMALL, tone: 'muted' }))

	for (const region of spec.regions) {
		const key = vennRegionKey(sets, region.in)
		if (key === null || !region.label.trim()) continue
		if (key === '') {
			items.push(text(universe.x + 10, universe.y + universe.h - 16, region.label, { size: SMALL }))
		} else {
			const spot = geo.spots[key]
			items.push(text(spot.x, spot.y, region.label, { size: SMALL, anchor: 'middle' }))
		}
	}
	return { items, warnings }
}

// Number line ----------------------------------------------------------------------------------

const LINE_W = 480
const LANE = 30

function layoutNumberLine(spec: NumberLineDiagram): Body {
	const warnings: string[] = []
	let { min, max } = spec
	if (!(max > min)) {
		warnings.push('number line range was empty, so it was widened')
		const center = Number.isFinite(min) ? min : 0
		min = center - 5
		max = center + 5
	}
	const span = max - min
	let step = spec.step
	if (!(step > 0) || span / step > DIAGRAM_LIMITS.numberLineTicks) step = niceStep(span, 10)

	const sx = (v: number) => ((Math.min(Math.max(v, min), max) - min) / span) * LINE_W
	const lanes = Math.max(1, spec.intervals.length)
	const axisY = (lanes - 1) * LANE
	const left = -18
	const right = LINE_W + 18

	const items: DiagramItem[] = []
	items.push(line(left, axisY, right, axisY, 'text', 1.5))
	items.push(arrowHead(left, axisY, -1, 'text'))
	items.push(arrowHead(right, axisY, 1, 'text'))
	for (const v of ticksBetween(min, max, step)) {
		const x = sx(v)
		items.push(line(x, axisY - 5, x, axisY + 5, 'text', 1.2))
		items.push(text(x, axisY + 18, formatNumber(v), { size: 12, anchor: 'middle', tone: 'muted' }))
	}

	spec.intervals.forEach((iv, i) => {
		const y = axisY - i * LANE
		const x1 = iv.from === null ? left : sx(iv.from)
		const x2 = iv.to === null ? right : sx(iv.to)
		const [a, b] = x1 <= x2 ? [x1, x2] : [x2, x1]
		items.push(line(a, y, b, y, 'ink', 4))
		if (iv.from === null) items.push(arrowHead(left, y, -1, 'ink'))
		if (iv.to === null) items.push(arrowHead(right, y, 1, 'ink'))
		for (const [value, included] of [
			[iv.from, iv.includeFrom],
			[iv.to, iv.includeTo],
		] as const) {
			if (value === null) continue
			const x = sx(value)
			if (i > 0) items.push(line(x, y + 6, x, axisY, 'muted', 1, 'dotted'))
			items.push({ t: 'circle', cx: x, cy: y, r: 5, tone: 'ink', width: 2, fill: included ? 'ink' : 'paper' })
		}
		if (iv.label.trim()) items.push(text((a + b) / 2, y - 15, iv.label, { size: SMALL, anchor: 'middle', tone: 'ink' }))
	})

	for (const p of spec.points) {
		const x = sx(p.value)
		items.push({ t: 'circle', cx: x, cy: axisY, r: 5, tone: 'ink', width: 2, fill: p.open ? 'paper' : 'ink' })
		// Below the tick numbers, so a point's label never collides with an interval's.
		if (p.label.trim()) items.push(text(x, axisY + 38, p.label, { size: SMALL, anchor: 'middle', tone: 'ink' }))
	}
	return { items, warnings }
}

function arrowHead(x: number, y: number, dir: 1 | -1, tone: Tone): DiagramItem {
	const back = x - dir * 9
	return {
		t: 'path',
		d: `M ${back} ${y - 5} L ${x} ${y} L ${back} ${y + 5}`,
		tone,
		width: 1.5,
		dash: 'solid',
		fill: 'none',
		bounds: { x: Math.min(x, back), y: y - 5, w: 9, h: 10 },
		clip: false,
	}
}

// Plot -------------------------------------------------------------------------------------------

const PLOT_W = 360
const PLOT_H = 240
const SAMPLES = 320
const CURVE_DASH: Dash[] = ['solid', 'dashed', 'dotted']

function layoutPlot(spec: PlotDiagram): Body {
	const warnings: string[] = []
	const range = (lo: number, hi: number, name: string): [number, number] => {
		if (Number.isFinite(lo) && Number.isFinite(hi) && hi > lo) return [lo, hi]
		warnings.push(`${name} range was empty, so it was widened`)
		return [-5, 5]
	}
	const [xMin, xMax] = range(spec.xMin, spec.xMax, 'x')
	const [yMin, yMax] = range(spec.yMin, spec.yMax, 'y')
	const sx = (x: number) => ((x - xMin) / (xMax - xMin)) * PLOT_W
	const sy = (y: number) => ((yMax - y) / (yMax - yMin)) * PLOT_H
	const frame: Rect = { x: 0, y: 0, w: PLOT_W, h: PLOT_H }

	const items: DiagramItem[] = []
	const xStep = niceStep(xMax - xMin, 6)
	const yStep = niceStep(yMax - yMin, 5)
	const xTicks = ticksBetween(xMin, xMax, xStep)
	const yTicks = ticksBetween(yMin, yMax, yStep)
	for (const v of xTicks) items.push(line(sx(v), 0, sx(v), PLOT_H, 'muted', 0.6, 'dotted'))
	for (const v of yTicks) items.push(line(0, sy(v), PLOT_W, sy(v), 'muted', 0.6, 'dotted'))
	items.push({ t: 'rect', ...frame, tone: 'muted', width: 1, fill: 'none' })
	if (yMin <= 0 && yMax >= 0) items.push(line(0, sy(0), PLOT_W, sy(0), 'text', 1.3))
	if (xMin <= 0 && xMax >= 0) items.push(line(sx(0), 0, sx(0), PLOT_H, 'text', 1.3))
	for (const v of xTicks) items.push(text(sx(v), PLOT_H + 14, formatNumber(v), { size: 12, anchor: 'middle', tone: 'muted' }))
	for (const v of yTicks) items.push(text(-6, sy(v), formatNumber(v), { size: 12, anchor: 'end', tone: 'muted' }))
	if (spec.xLabel.trim()) items.push(text(PLOT_W, PLOT_H + 32, spec.xLabel, { size: SMALL, anchor: 'end' }))
	if (spec.yLabel.trim()) items.push(text(0, -12, spec.yLabel, { size: SMALL }))

	const legend: { label: string; dash: Dash }[] = []
	spec.curves.forEach((curve, i) => {
		const fn = tryCompileExpression(curve.expression)
		if (!fn) {
			warnings.push(`could not read the curve "${curve.expression}"`)
			return
		}
		const d = samplePath(fn, xMin, xMax, yMin, yMax, sx, sy)
		if (!d) {
			warnings.push(`the curve "${curve.expression}" has no points in view`)
			return
		}
		const dash = CURVE_DASH[i % CURVE_DASH.length]
		items.push({ t: 'path', d, tone: 'ink', width: 2.2, dash, fill: 'none', bounds: frame, clip: true })
		if (curve.label.trim()) legend.push({ label: curve.label.trim(), dash })
	})

	for (const p of spec.points) {
		if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue
		if (p.x < xMin || p.x > xMax || p.y < yMin || p.y > yMax) {
			warnings.push(`point (${formatNumber(p.x)}, ${formatNumber(p.y)}) is out of view`)
			continue
		}
		items.push({ t: 'circle', cx: sx(p.x), cy: sy(p.y), r: 4, tone: 'ink', width: 1.5, fill: 'ink' })
		if (p.label.trim()) {
			// Keep the label inside the frame: flip it left near the right edge.
			const flip = sx(p.x) > PLOT_W - 70
			items.push(text(sx(p.x) + (flip ? -8 : 8), sy(p.y) - 11, p.label, { size: SMALL, anchor: flip ? 'end' : 'start' }))
		}
	}

	if (legend.length) {
		const w = Math.max(...legend.map((l) => textWidth(l.label, SMALL))) + 42
		const x = PLOT_W - w - 8
		items.push({ t: 'rect', x, y: 8, w, h: legend.length * 20 + 8, tone: 'muted', width: 0.8, fill: 'paper' })
		legend.forEach((l, i) => {
			const y = 22 + i * 20
			items.push(line(x + 8, y, x + 28, y, 'ink', 2.2, l.dash))
			items.push(text(x + 34, y, l.label, { size: SMALL }))
		})
	}
	return { items, clip: frame, warnings }
}

/**
 * An SVG path through the curve, broken where it isn't defined or jumps (an asymptote).
 * Points far outside the y range are clamped, and the shape clips the path to the frame.
 */
export function samplePath(
	fn: (x: number) => number,
	xMin: number,
	xMax: number,
	yMin: number,
	yMax: number,
	sx: (x: number) => number,
	sy: (y: number) => number
): string {
	const span = yMax - yMin
	const lo = yMin - span * 2
	const hi = yMax + span * 2
	const parts: string[] = []
	let drawing = false
	let prev: number | null = null
	for (let i = 0; i <= SAMPLES; i++) {
		const x = xMin + ((xMax - xMin) * i) / SAMPLES
		const y = fn(x)
		const ok = Number.isFinite(y)
		const jump = ok && prev !== null && Math.abs(y - prev) > span * 3 && (y < yMin || y > yMax || prev < yMin || prev > yMax)
		if (!ok || jump) {
			drawing = false
			prev = ok ? y : null
			if (!ok) continue
		}
		const py = sy(Math.min(Math.max(y, lo), hi))
		parts.push(`${drawing ? 'L' : 'M'} ${sx(x).toFixed(1)} ${py.toFixed(1)}`)
		drawing = true
		prev = y
	}
	// A path that is only moves draws nothing.
	return parts.some((p) => p.startsWith('L')) ? parts.join(' ') : ''
}

// Matrix ------------------------------------------------------------------------------------------

const MATRIX_ROW = 32

function layoutMatrix(spec: MatrixDiagram): Body {
	const rows = spec.rows
	const cols = Math.max(...rows.map((r) => r.length))
	const cells = rows.map((r) => Array.from({ length: cols }, (_, c) => r[c] ?? ''))
	const widths = Array.from({ length: cols }, (_, c) => Math.max(30, ...cells.map((r) => textWidth(r[c]))) + 20)
	const name = spec.name.trim()
	const label = name ? (/=\s*$/.test(name) ? name : `${name} =`) : ''
	const left = label ? textWidth(label, FONT, true) + 14 : 0
	const xs = [left + 10]
	for (const w of widths) xs.push(xs[xs.length - 1] + w)
	const right = xs[xs.length - 1]
	const h = rows.length * MATRIX_ROW

	const items: DiagramItem[] = []
	for (const c of new Set(spec.highlightColumns)) {
		if (c < 0 || c >= cols) continue
		items.push({ t: 'rect', x: xs[c], y: 0, w: widths[c], h, tone: 'none', width: 0, fill: 'tint' })
	}
	for (const r of new Set(spec.highlightRows)) {
		if (r < 0 || r >= rows.length) continue
		items.push({ t: 'rect', x: xs[0], y: r * MATRIX_ROW, w: right - xs[0], h: MATRIX_ROW, tone: 'none', width: 0, fill: 'tint' })
	}
	const bracket = (x: number, dir: 1 | -1): DiagramItem => ({
		t: 'path',
		d: `M ${x + dir * 8} -2 L ${x} -2 L ${x} ${h + 2} L ${x + dir * 8} ${h + 2}`,
		tone: 'text',
		width: 1.6,
		dash: 'solid',
		fill: 'none',
		bounds: { x: Math.min(x, x + dir * 8), y: -2, w: 8, h: h + 4 },
		clip: false,
	})
	items.push(bracket(left, 1), bracket(right + 10, -1))
	if (label) items.push(text(0, h / 2, label, { bold: true, tone: 'ink' }))
	cells.forEach((row, r) =>
		row.forEach((cell, c) => items.push(text(xs[c] + widths[c] / 2, (r + 0.5) * MATRIX_ROW, cell, { anchor: 'middle' })))
	)
	return { items }
}
