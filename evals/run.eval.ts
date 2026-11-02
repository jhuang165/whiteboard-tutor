/**
 * Runs every case in `evals/cases/` through the worker's real model call and scores the
 * actions with the deterministic checks. `npm run eval`; see the tutor-eval skill.
 *
 *   EVAL_MODEL=claude-sonnet-5-5   override the model for every case
 *   EVAL_REPEAT=3                  run each case several times (the model isn't deterministic)
 *   EVAL_ALLOW_API=1               required unless .dev.vars points at the local bridge, since the API costs money
 *   npm run eval -- -t bayes       only cases whose id matches
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { getAgentModeDefinition } from '../client/modes/AgentModeDefinitions'
import { isValidModelName } from '../shared/models'
import { AgentService } from '../worker/do/AgentService'
import type { Environment } from '../worker/environment'
import { buildCasePrompt } from './lib/buildCasePrompt'
import { type CheckResult, type EvalAction, runChecks } from './lib/checks'
import type { EvalCase } from './lib/EvalCase'

const env = readEnv()
const viaBridge = /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(env.ANTHROPIC_BASE_URL ?? '')
const repeat = Math.max(1, Number(process.env.EVAL_REPEAT ?? 1))
const modelOverride = process.env.EVAL_MODEL
if (modelOverride && !isValidModelName(modelOverride)) throw new Error(`Unknown EVAL_MODEL ${modelOverride}`)

const cases = loadCases()
if (!viaBridge && process.env.EVAL_ALLOW_API !== '1') {
	throw new Error(
		`This would make ${cases.length * repeat} real API calls. Point ANTHROPIC_BASE_URL in .dev.vars at ` +
			'the bridge (npm run bridge), or set EVAL_ALLOW_API=1 once the spend is approved.'
	)
}

const mode = getAgentModeDefinition('working')
if (!mode.active) throw new Error('working mode should be active')
const service = new AgentService(env as Environment)
const results: RunResult[] = []

interface RunResult {
	id: string
	run: number
	model: string
	seconds: number
	actions: EvalAction[]
	checks: CheckResult[]
	error?: string
}

describe.concurrent('tutor evals', () => {
	for (const evalCase of cases) {
		for (let run = 1; run <= repeat; run++) {
			const name = repeat > 1 ? `${evalCase.id} #${run}` : evalCase.id
			it(name, async () => {
				const result = await runCase(modelOverride ? { ...evalCase, model: modelOverride as EvalCase['model'] } : evalCase, run)
				results.push(result)
				if (result.error) throw new Error(result.error)
				const failed = result.checks.filter((c) => !c.pass).map((c) => `${c.check} (${c.rule}): ${c.detail}`)
				expect(failed, `${name} failed checks`).toEqual([])
			})
		}
	}
})

afterAll(() => {
	if (results.length === 0) return
	const dir = new URL('./results/', import.meta.url)
	mkdirSync(dir, { recursive: true })
	const stamp = new Date().toISOString().replace(/[:.]/g, '-')
	const report = { stamp, via: viaBridge ? 'bridge' : 'api', results: results.sort(byId) }
	writeFileSync(new URL(`${stamp}.json`, dir), JSON.stringify(report, null, 2))
	writeFileSync(new URL('latest.md', dir), summarize(report.via, results))
})

async function runCase(evalCase: EvalCase, run: number): Promise<RunResult> {
	const prompt = buildCasePrompt(evalCase)
	const started = Date.now()
	const actions: EvalAction[] = []
	let error: string | undefined
	try {
		for await (const event of service.stream(prompt)) {
			if (!event.complete) continue
			const { complete: _complete, time: _time, ...action } = event as typeof event & { time?: number }
			actions.push(action as EvalAction)
		}
		if (actions.length === 0) error = 'the model returned no actions'
	} catch (e) {
		error = e instanceof Error ? e.message : String(e)
	}
	return {
		id: evalCase.id,
		run,
		model: prompt.modelName.modelName,
		seconds: Math.round((Date.now() - started) / 100) / 10,
		actions,
		checks: error ? [] : runChecks(evalCase, actions, mode.active ? mode.actions : []),
		...(error ? { error } : {}),
	}
}

function summarize(via: string, runs: RunResult[]): string {
	const checks = runs.flatMap((r) => r.checks)
	const passed = checks.filter((c) => c.pass).length
	const lines = [
		`# Tutor eval results`,
		'',
		`Via ${via}. ${passed}/${checks.length} checks passed across ${runs.length} run(s).`,
		'',
		'| Case | Model | Seconds | Check | Rule | Pass | Detail |',
		'| --- | --- | --- | --- | --- | --- | --- |',
	]
	for (const run of runs) {
		const name = repeat > 1 ? `${run.id} #${run.run}` : run.id
		if (run.error) lines.push(`| ${name} | ${run.model} | ${run.seconds} | error | | no | ${cell(run.error)} |`)
		for (const c of run.checks) {
			lines.push(`| ${name} | ${run.model} | ${run.seconds} | ${c.check} | ${c.rule} | ${c.pass ? 'yes' : '**no**'} | ${cell(c.detail)} |`)
		}
	}
	return lines.join('\n') + '\n'
}

function cell(text: string) {
	return text.replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function byId(a: RunResult, b: RunResult) {
	return a.id.localeCompare(b.id) || a.run - b.run
}

function loadCases(): EvalCase[] {
	const dir = new URL('./cases/', import.meta.url)
	return readdirSync(dir)
		.filter((file) => file.endsWith('.json'))
		.sort()
		.map((file) => JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as EvalCase)
}

/**
 * Model keys from `.dev.vars` only, the same source the worker uses. The shell environment
 * is ignored on purpose: a host app can export ANTHROPIC_BASE_URL, which would silently send
 * these calls somewhere else.
 */
function readEnv(): Partial<Environment> {
	const keys = ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'OPENAI_API_KEY', 'GOOGLE_API_KEY'] as const
	const file = new URL('../.dev.vars', import.meta.url)
	const vars: Record<string, string> = {}
	if (existsSync(file)) {
		for (const line of readFileSync(file, 'utf8').split('\n')) {
			const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line)
			if (match) vars[match[1]] = match[2].replace(/^["']|["']$/g, '')
		}
	}
	const env = Object.fromEntries(keys.map((key) => [key, vars[key] ?? ''])) as Partial<Environment>
	// Pass the default explicitly, or the Anthropic SDK falls back to the shell's ANTHROPIC_BASE_URL.
	env.ANTHROPIC_BASE_URL ||= 'https://api.anthropic.com/v1'
	return env
}
