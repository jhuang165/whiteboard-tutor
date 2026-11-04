import { existsSync, readFileSync } from 'node:fs'
import type { Environment } from '../../worker/environment'

/**
 * Model keys from `.dev.vars` only, the same source the worker uses. The shell environment
 * is ignored on purpose: a host app can export ANTHROPIC_BASE_URL, which would silently send
 * these calls somewhere else.
 */
export function readEnv(): Partial<Environment> {
	const keys = ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'OPENAI_API_KEY', 'GOOGLE_API_KEY'] as const
	const file = new URL('../../.dev.vars', import.meta.url)
	const vars: Record<string, string> = {}
	if (existsSync(file)) {
		for (const line of readFileSync(file, 'utf8').split('\n')) {
			const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line)
			if (match) vars[match[1]] = match[2].replace(/^["']|["']$/g, '')
		}
	}
	const env = Object.fromEntries(keys.map((key) => [key, vars[key] ?? ''])) as Partial<Environment>
	// Pass the default explicitly, or the Anthropic SDK falls back to the shell's ANTHROPIC_BASE_URL.
	env.ANTHROPIC_BASE_URL ||= 'https://api.anthropic.com'
	return env
}

/** Whether the calls go to the local Claude Code bridge (free) rather than the API. */
export function isBridge(env: Partial<Environment>): boolean {
	return /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(env.ANTHROPIC_BASE_URL ?? '')
}
