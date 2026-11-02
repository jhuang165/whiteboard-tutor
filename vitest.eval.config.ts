import { defineConfig } from 'vitest/config'

// `npm run eval`: real model calls, so kept out of `npm test`. See the tutor-eval skill.
export default defineConfig({
	test: {
		include: ['evals/**/*.eval.ts'],
		environment: 'node',
		testTimeout: 5 * 60_000,
		maxConcurrency: 3,
	},
})
