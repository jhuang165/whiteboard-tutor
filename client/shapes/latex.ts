import katex from 'katex'

/** LaTeX as KaTeX HTML. Bad input renders in red instead of throwing. */
export function renderLatex(latex: string, displayMode: boolean): string {
	return katex.renderToString(latex, { throwOnError: false, displayMode })
}

/** Plain text with inline `$...$` math, as HTML. Text outside the math is escaped. */
export function renderTextWithMath(text: string): string {
	return text
		.split(/(\$[^$]+\$)/g)
		.map((piece) =>
			piece.length > 2 && piece.startsWith('$') && piece.endsWith('$')
				? renderLatex(piece.slice(1, -1), false)
				: escapeHtml(piece)
		)
		.join('')
}

/**
 * Measure HTML off-screen with the given class, so a shape can be placed at its real size
 * before it renders. The shape's own ResizeObserver corrects it if fonts load later.
 */
export function measureHtml(html: string, className: string, maxWidth?: number) {
	const el = document.createElement('div')
	el.className = className
	el.style.position = 'absolute'
	el.style.visibility = 'hidden'
	el.style.left = '-10000px'
	if (maxWidth) el.style.width = `${maxWidth}px`
	el.innerHTML = html
	document.body.appendChild(el)
	const size = { w: Math.ceil(el.offsetWidth), h: Math.ceil(el.offsetHeight) }
	el.remove()
	return size
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/\n/g, '<br>')
}
