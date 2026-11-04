import { DIAGRAM_KIND_NAMES, DiagramSpec, TreeBranch } from './DiagramSpec'
import { formatNumber, vennRegionKey } from './layout'

/**
 * The diagram as one line of text: what the model reads back in its shape list, since it
 * can't rely on reading small labels from a screenshot.
 */
export function describeDiagram(spec: DiagramSpec, title = ''): string {
	const head = `${DIAGRAM_KIND_NAMES[spec.kind]}${title.trim() ? ` "${title.trim()}"` : ''}`
	return `${head}: ${describeBody(spec)}`
}

function describeBody(spec: DiagramSpec): string {
	switch (spec.kind) {
		case 'tree': {
			const paths: string[] = []
			const walk = (branch: TreeBranch, trail: string[]) => {
				const step = branch.probability.trim() ? `${branch.label} (${branch.probability})` : branch.label
				const next = [...trail, step]
				if (branch.branches.length === 0) {
					paths.push(next.join(' → ') + (branch.outcome.trim() ? ` = ${branch.outcome}` : ''))
				} else {
					branch.branches.forEach((b) => walk(b, next))
				}
			}
			spec.branches.forEach((b) => walk(b, spec.root.trim() ? [spec.root] : []))
			return paths.join('; ')
		}
		case 'table': {
			const header = [spec.corner, ...spec.columns].join(' | ')
			const rows = spec.rows.map((r) => [r.label, ...spec.columns.map((_, c) => r.cells[c] ?? '')].join(' | '))
			const marked = [
				...spec.highlightColumns.filter((c) => spec.columns[c] !== undefined).map((c) => `column ${spec.columns[c]}`),
				...spec.highlightRows.filter((r) => spec.rows[r]).map((r) => `row ${spec.rows[r].label}`),
			]
			return `${[header, ...rows].join(' / ')}${marked.length ? ` (highlighted: ${marked.join(', ')})` : ''}`
		}
		case 'venn': {
			const regions = spec.regions
				.filter((r) => vennRegionKey(spec.sets, r.in) !== null)
				.map((r) => {
					const where = r.in.length === 0 ? 'outside all' : r.in.length === 1 ? `${r.in[0]} only` : r.in.join(' and ')
					return `${where}${r.label.trim() ? ` ${r.label}` : ''}${r.shaded ? ' (shaded)' : ''}`
				})
			const universe = spec.universe.trim() ? ` in ${spec.universe}` : ''
			return `sets ${spec.sets.join(', ')}${universe}${regions.length ? `; ${regions.join('; ')}` : ''}`
		}
		case 'number-line': {
			const marks = [
				...spec.intervals.map((iv) => {
					const lo = iv.from === null ? '(-∞' : `${iv.includeFrom ? '[' : '('}${formatNumber(iv.from)}`
					const hi = iv.to === null ? '∞)' : `${formatNumber(iv.to)}${iv.includeTo ? ']' : ')'}`
					return `${lo}, ${hi}${iv.label.trim() ? ` "${iv.label}"` : ''}`
				}),
				...spec.points.map((p) => `point ${formatNumber(p.value)}${p.open ? ' (open)' : ''}${p.label.trim() ? ` "${p.label}"` : ''}`),
			]
			return `from ${formatNumber(spec.min)} to ${formatNumber(spec.max)}${marks.length ? `; ${marks.join('; ')}` : ''}`
		}
		case 'plot': {
			const curves = spec.curves.map((c) => `y = ${c.expression}${c.label.trim() ? ` "${c.label}"` : ''}`)
			const points = spec.points.map((p) => `(${formatNumber(p.x)}, ${formatNumber(p.y)})${p.label.trim() ? ` "${p.label}"` : ''}`)
			return [
				`x from ${formatNumber(spec.xMin)} to ${formatNumber(spec.xMax)}, y from ${formatNumber(spec.yMin)} to ${formatNumber(spec.yMax)}`,
				...curves,
				...(points.length ? [`points ${points.join(', ')}`] : []),
			].join('; ')
		}
		case 'matrix': {
			const body = `[${spec.rows.map((r) => `[${r.join(', ')}]`).join(', ')}]`
			const marked = [
				...spec.highlightRows.map((r) => `row ${r + 1}`),
				...spec.highlightColumns.map((c) => `column ${c + 1}`),
			]
			const name = spec.name.trim().replace(/\s*=\s*$/, '')
			return `${name ? `${name} = ` : ''}${body}${marked.length ? ` (highlighted: ${marked.join(', ')})` : ''}`
		}
	}
}
