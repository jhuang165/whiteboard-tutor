import { defineConfig } from 'vitest/config'

// Separate from vite.config.ts so tests don't start the Cloudflare worker plugin.
export default defineConfig({
	test: {
		include: ['{client,shared,worker}/**/*.test.ts'],
		environment: 'node',
	},
})
