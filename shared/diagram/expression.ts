/**
 * A small parser for the function plots in the representation library. The model writes
 * curves as plain expressions in `x` ("x^2 - 3x + 2", "exp(-x^2/2)/sqrt(2pi)"). This never
 * calls `eval` or `Function`: it builds a closure tree from a fixed grammar.
 *
 * Grammar, loosest first:
 *   sum     = product (("+" | "-") product)*
 *   product = unary (("*" | "/" | implicit) unary)*
 *   unary   = ("-" | "+") unary | power
 *   power   = atom ("^" unary)?          right-associative, so -x^2 is -(x^2)
 *   atom    = number | "x" | constant | function "(" sum ")" | "(" sum ")" | "|" sum "|"
 *
 * Implicit multiplication covers "2x", "3(x+1)", "(x+1)(x-1)", and "2pi".
 */

export type CompiledExpression = (x: number) => number

const FUNCTIONS: Record<string, (v: number) => number> = {
	sin: Math.sin,
	cos: Math.cos,
	tan: Math.tan,
	asin: Math.asin,
	acos: Math.acos,
	atan: Math.atan,
	arcsin: Math.asin,
	arccos: Math.acos,
	arctan: Math.atan,
	sinh: Math.sinh,
	cosh: Math.cosh,
	tanh: Math.tanh,
	exp: Math.exp,
	ln: Math.log,
	log: Math.log10,
	log10: Math.log10,
	log2: Math.log2,
	sqrt: Math.sqrt,
	abs: Math.abs,
	floor: Math.floor,
	ceil: Math.ceil,
	sign: Math.sign,
}

const CONSTANTS: Record<string, number> = { pi: Math.PI, π: Math.PI, e: Math.E }

type Token =
	| { t: 'num'; v: number }
	| { t: 'id'; v: string }
	| { t: 'op'; v: '+' | '-' | '*' | '/' | '^' | '(' | ')' | '|' }

export class ExpressionError extends Error {}

function tokenize(source: string): Token[] {
	const tokens: Token[] = []
	const text = source.replace(/\*\*/g, '^').replace(/[−–]/g, '-').replace(/[·×]/g, '*')
	let i = 0
	while (i < text.length) {
		const ch = text[i]
		if (/\s/.test(ch)) {
			i++
			continue
		}
		const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(text.slice(i))
		if (num) {
			// "2e" alone is 2 times e, not an exponent.
			tokens.push({ t: 'num', v: Number(num[0]) })
			i += num[0].length
			continue
		}
		const id = /^[a-zπ][a-z0-9]*/i.exec(text.slice(i))
		if (id) {
			tokens.push(...splitIdentifier(id[0].toLowerCase()))
			i += id[0].length
			continue
		}
		if ('+-*/^()|'.includes(ch)) {
			tokens.push({ t: 'op', v: ch as '+' })
			i++
			continue
		}
		throw new ExpressionError(`unexpected "${ch}"`)
	}
	return tokens
}

/**
 * "xsin" or "pix" come through as one identifier. Split a run of letters into known names,
 * longest first, so "2xsin(x)" reads as 2 * x * sin(x).
 */
function splitIdentifier(word: string): Token[] {
	const names = [...Object.keys(FUNCTIONS), ...Object.keys(CONSTANTS), 'x'].sort((a, b) => b.length - a.length)
	const out: Token[] = []
	let rest = word
	while (rest) {
		const name = names.find((n) => rest.startsWith(n))
		if (!name) throw new ExpressionError(`unknown name "${word}"`)
		out.push({ t: 'id', v: name })
		rest = rest.slice(name.length)
	}
	return out
}

export function compileExpression(source: string): CompiledExpression {
	const tokens = tokenize(source)
	let pos = 0
	const peek = () => tokens[pos]
	const isOp = (v: string) => peek()?.t === 'op' && peek()!.v === v
	const expect = (v: string) => {
		if (!isOp(v)) throw new ExpressionError(`expected "${v}"`)
		pos++
	}

	const sum = (): CompiledExpression => {
		let left = product()
		while (isOp('+') || isOp('-')) {
			const op = (tokens[pos++] as { v: string }).v
			const a = left
			const b = product()
			left = op === '+' ? (x) => a(x) + b(x) : (x) => a(x) - b(x)
		}
		return left
	}

	// An atom can start right after the last one: "2x", "3(x+1)", "x sin(x)".
	const startsAtom = () => {
		const token = peek()
		if (!token) return false
		if (token.t === 'num' || token.t === 'id') return true
		return token.v === '('
	}

	const product = (): CompiledExpression => {
		let left = unary()
		for (;;) {
			let op: '*' | '/'
			if (isOp('*') || isOp('/')) op = (tokens[pos++] as { v: '*' | '/' }).v
			else if (startsAtom()) op = '*'
			else break
			const a = left
			const b = unary()
			left = op === '*' ? (x) => a(x) * b(x) : (x) => a(x) / b(x)
		}
		return left
	}

	const unary = (): CompiledExpression => {
		if (isOp('-')) {
			pos++
			const a = unary()
			return (x) => -a(x)
		}
		if (isOp('+')) {
			pos++
			return unary()
		}
		return power()
	}

	const power = (): CompiledExpression => {
		const base = atom()
		if (!isOp('^')) return base
		pos++
		const exponent = unary()
		return (x) => Math.pow(base(x), exponent(x))
	}

	const atom = (): CompiledExpression => {
		const token = tokens[pos++]
		if (!token) throw new ExpressionError('unexpected end')
		if (token.t === 'num') {
			const v = token.v
			return () => v
		}
		if (token.t === 'id') {
			if (token.v === 'x') return (x) => x
			if (token.v in CONSTANTS) {
				const v = CONSTANTS[token.v]
				return () => v
			}
			const fn = FUNCTIONS[token.v]
			// "sin x" without parentheses binds to the next power: sin x^2 = sin(x^2).
			const arg = isOp('(') ? atom() : power()
			return (x) => fn(arg(x))
		}
		if (token.v === '(') {
			const inner = sum()
			expect(')')
			return inner
		}
		if (token.v === '|') {
			const inner = sum()
			expect('|')
			return (x) => Math.abs(inner(x))
		}
		throw new ExpressionError(`unexpected "${token.v}"`)
	}

	// "|" never starts an implicit product, or the closing bar of "|x|" would read as a new
	// opening one. So "2|x|" needs a "*" (or abs()).
	const result = sum()
	if (pos < tokens.length) throw new ExpressionError(`unexpected "${(tokens[pos] as { v: unknown }).v}"`)
	return result
}

/** Compile, or null when the expression can't be read. */
export function tryCompileExpression(source: string): CompiledExpression | null {
	try {
		return compileExpression(source)
	} catch {
		return null
	}
}
