import { describe, expect, it } from 'vitest'
import { renderTextWithMath } from './latex'

describe('renderTextWithMath', () => {
	it('typesets $...$ and escapes the text around it', () => {
		const html = renderTextWithMath('If <A> holds, find $P(A \\mid B)$.')
		expect(html.startsWith('If &lt;A&gt; holds, find ')).toBe(true)
		expect(html).toContain('class="katex"')
		expect(html.endsWith('.')).toBe(true)
	})

	it('leaves a lone dollar sign as text', () => {
		expect(renderTextWithMath('It costs $5.')).toBe('It costs $5.')
	})
})
