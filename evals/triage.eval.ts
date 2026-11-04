/**
 * Runs every case in `evals/triage-cases/` through the real `/triage` classifier (Sonnet 5.5)
 * and checks the decision: step in or stay quiet, and which shape. `npm run eval`; see the
 * tutor-eval skill. EVAL_REPEAT and EVAL_ALLOW_API work as in `run.eval.ts`.
 *
 *   npm run eval -- -t triage      only the triage cases
 */
import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { TriageShape } from '../shared/tutor/triage'
import type { ProblemVerification } from '../shared/tutor/verification'
import { createAnthropicClient } from '../worker/anthropicClient'
import type { Environment } from '../worker/environment'
import { triageWork } from '../worker/triage/triageWork'
import { isBridge, readEnv } from './lib/env'

interface TriageCase {
	id: string
	description: string
	problemId: string
	title: string
	statement: string
	verified: ProblemVerification | null
	/** Typed work only: the runner sends no image. */
	shapes: TriageShape[]
	expect: { intervene: boolean; shapeId?: string }
}

const env = readEnv()
const repeat = Math.max(1, Number(process.env.EVAL_REPEAT ?? 1))
const dir = new URL('./triage-cases/', import.meta.url)
const cases = readdirSync(dir)
	.filter((file) => file.endsWith('.json'))
	.sort()
	.map((file) => JSON.parse(readFileSync(new URL(file, dir), 'utf8')) as TriageCase)

if (!isBridge(env) && process.env.EVAL_ALLOW_API !== '1') {
	throw new Error(
		`This would make ${cases.length * repeat} real API calls. Point ANTHROPIC_BASE_URL in .dev.vars at ` +
			'the bridge (npm run bridge), or set EVAL_ALLOW_API=1 once the spend is approved.'
	)
}

const client = createAnthropicClient(env as Environment)

describe.concurrent('triage evals', () => {
	for (const triageCase of cases) {
		for (let run = 1; run <= repeat; run++) {
			it(repeat > 1 ? `${triageCase.id} #${run}` : triageCase.id, async () => {
				const { problemId, title, statement, verified, shapes } = triageCase
				const decision = await triageWork(client, { problemId, title, statement, verified, shapes })
				console.log(`${triageCase.id}: ${decision.intervene ? 'step in' : 'quiet'} ${decision.shapeId} — ${decision.reason}`)
				expect(decision.intervene, decision.reason).toBe(triageCase.expect.intervene)
				if (triageCase.expect.shapeId) expect(decision.shapeId).toBe(triageCase.expect.shapeId)
				// The reason goes only to the tutor, but a flag should name the wrong line, not the fix.
				if (verified && decision.intervene) expect(decision.reason).not.toContain(verified.answer)
			})
		}
	}
})
