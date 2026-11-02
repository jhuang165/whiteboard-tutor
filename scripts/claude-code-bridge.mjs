#!/usr/bin/env node
/**
 * Dev-only bridge: a local server that speaks enough of the Anthropic Messages API for the
 * worker, and answers each request by running the Claude Code CLI on your own login.
 *
 * It's for testing on your own machine without an API key. Don't use it to serve anyone
 * else: a Claude subscription or Enterprise seat is not API access.
 *
 *   npm run bridge          # listens on http://127.0.0.1:8790
 *
 * Then in .dev.vars:
 *   ANTHROPIC_BASE_URL=http://127.0.0.1:8790
 *   ANTHROPIC_API_KEY=claude-code-bridge
 *
 * Settings (environment variables, or the same keys in .dev.vars):
 *   CLAUDE_BRIDGE_COMMAND  the CLI to run (default `claude`)
 *   CLAUDE_BRIDGE_PORT     the port to listen on (default 8790)
 *   CLAUDE_BRIDGE_DUMP     a file path; each request body is written there, for debugging
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const config = { ...readDevVars(), ...process.env }
const COMMAND = config.CLAUDE_BRIDGE_COMMAND || 'claude'
const PORT = Number(config.CLAUDE_BRIDGE_PORT || 8790)

// Run the CLI in an empty folder so it doesn't pick up this repo's CLAUDE.md.
const EMPTY_CWD = mkdtempSync(join(tmpdir(), 'claude-code-bridge-'))

const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

const server = createServer(async (req, res) => {
	if (req.method !== 'POST' || !new URL(req.url ?? '/', 'http://localhost').pathname.endsWith('/messages')) {
		return sendError(res, 404, 'not_found_error', `No route for ${req.method} ${req.url}`)
	}

	let body
	try {
		body = JSON.parse(await readBody(req))
	} catch {
		return sendError(res, 400, 'invalid_request_error', 'Body is not JSON')
	}

	const images = (body.messages ?? []).flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b.type === 'image').length
	log(`request: ${body.model ?? 'default model'}, ${body.messages?.length ?? 0} messages, ${images} images, stream ${body.stream === true}`)
	if (config.CLAUDE_BRIDGE_DUMP) writeFileSync(config.CLAUDE_BRIDGE_DUMP, JSON.stringify(body, null, 2))

	const args = [
		'-p',
		'--input-format', 'stream-json',
		'--output-format', 'stream-json',
		'--include-partial-messages',
		'--verbose',
		// A bare model: no tools, MCP servers, settings, hooks, skills, or saved sessions.
		'--tools', '',
		'--strict-mcp-config',
		'--setting-sources', '',
		'--disable-slash-commands',
		'--no-session-persistence',
		'--system-prompt', systemText(body.system) + schemaInstruction(body.output_config?.format),
	]
	const serverTools = (body.tools ?? []).map((tool) => tool.type ?? tool.name)
	if (serverTools.length > 0) log(`dropping tools ${serverTools.join(', ')}: the bridge has no sandbox`)
	if (body.model) args.push('--model', body.model)
	const effort = body.output_config?.effort
	if (EFFORTS.has(effort)) args.push('--effort', effort)

	const child = spawn(COMMAND, args, { cwd: EMPTY_CWD, stdio: ['pipe', 'pipe', 'pipe'] })
	const started = Date.now()
	let stderr = ''
	child.stderr.on('data', (chunk) => (stderr += chunk))
	child.on('error', (error) => {
		if (!res.headersSent) sendError(res, 500, 'api_error', `Could not run ${COMMAND}: ${error.message}`)
	})
	res.on('close', () => child.kill())

	child.stdin.end(
		JSON.stringify({ type: 'user', message: { role: 'user', content: flattenMessages(body.messages) } }) + '\n'
	)

	const streaming = body.stream === true
	let finalMessage = null
	let done = false
	let buffer = ''

	child.stdout.on('data', (chunk) => {
		buffer += chunk
		let newline
		while ((newline = buffer.indexOf('\n')) !== -1) {
			const line = buffer.slice(0, newline).trim()
			buffer = buffer.slice(newline + 1)
			if (line) handleLine(line)
		}
	})

	function handleLine(line) {
		let event
		try {
			event = JSON.parse(line)
		} catch {
			return
		}

		if (event.type === 'stream_event' && streaming && !done) {
			if (!res.headersSent) {
				res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
			}
			const e = event.event
			if (e.type === 'message_delta' && e.delta?.stop_reason === 'refusal') {
				log(`refused: ${e.delta.stop_details?.explanation ?? 'no explanation'}`)
			}
			res.write(`event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`)
			if (e.type === 'message_stop') {
				done = true
				res.end()
			}
		} else if (event.type === 'assistant' && !finalMessage) {
			finalMessage = event.message
		} else if (event.type === 'result') {
			const seconds = ((Date.now() - started) / 1000).toFixed(1)
			const usage = event.usage ?? {}
			log(
				`${body.model ?? 'default model'} ${effort ?? ''} ${event.subtype} in ${seconds}s, ` +
					`in ${usage.input_tokens ?? 0} + cached ${usage.cache_read_input_tokens ?? 0}, out ${usage.output_tokens ?? 0}`
			)
			if (event.is_error) finish(event.result || event.subtype)
		}
	}

	child.on('close', (code) => {
		if (code !== 0) finish(stderr.trim() || `${COMMAND} exited with code ${code}`)
		else finish(null)
	})

	function finish(errorMessage) {
		if (res.writableEnded) return
		if (errorMessage) {
			log(`error: ${errorMessage}`)
			if (res.headersSent) {
				const error = { type: 'error', error: { type: 'api_error', message: errorMessage } }
				res.write(`event: error\ndata: ${JSON.stringify(error)}\n\n`)
				return res.end()
			}
			return sendError(res, 500, 'api_error', errorMessage)
		}
		if (!streaming && finalMessage) {
			res.writeHead(200, { 'content-type': 'application/json' })
			return res.end(JSON.stringify({ ...finalMessage, stop_reason: finalMessage.stop_reason ?? 'end_turn' }))
		}
		if (!res.headersSent) return sendError(res, 500, 'api_error', 'The CLI returned no message')
		res.end()
	}
})

server.listen(PORT, '127.0.0.1', () => {
	log(`listening on http://127.0.0.1:${PORT}, running \`${COMMAND}\``)
	log('dev only: this answers with your own Claude login, so keep it to your machine')
})

/**
 * Structured outputs (`output_config.format`) as a prompt instruction. `claude -p` can't
 * enforce a schema, so the caller must still validate the reply.
 */
function schemaInstruction(format) {
	if (format?.type !== 'json_schema') return ''
	return `\n\nReply with only one JSON object matching this JSON schema, with no other text:\n${JSON.stringify(format.schema)}`
}

/** The Messages API `system` field, as one string. */
function systemText(system) {
	if (!system) return ''
	if (typeof system === 'string') return system
	return system.map((block) => block.text ?? '').join('\n\n')
}

/**
 * The CLI takes one user turn, so fold the conversation into it. Earlier assistant turns
 * become marked text, and image blocks pass through unchanged.
 *
 * Earlier `[THOUGHT]: ...` lines from the agent's chat history are dropped: model reasoning
 * pasted into a user turn gets refused as reasoning extraction.
 */
function flattenMessages(messages = []) {
	const content = []
	for (const message of messages) {
		const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content
		for (const block of blocks) {
			if (message.role === 'assistant') {
				if (block.type === 'text' && block.text && !block.text.startsWith('[THOUGHT]')) {
					content.push({ type: 'text', text: `<earlier_reply_from_you>\n${block.text}\n</earlier_reply_from_you>` })
				}
				continue
			}
			if (block.type === 'text') content.push({ type: 'text', text: block.text })
			else if (block.type === 'image') content.push({ type: 'image', source: block.source })
		}
	}
	return content
}

function readDevVars() {
	const file = new URL('../.dev.vars', import.meta.url)
	if (!existsSync(file)) return {}
	const vars = {}
	for (const line of readFileSync(file, 'utf8').split('\n')) {
		const match = /^\s*(CLAUDE_BRIDGE_[A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line)
		if (match) vars[match[1]] = match[2].replace(/^["']|["']$/g, '')
	}
	return vars
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		let data = ''
		req.on('data', (chunk) => (data += chunk))
		req.on('end', () => resolve(data))
		req.on('error', reject)
	})
}

function sendError(res, status, type, message) {
	res.writeHead(status, { 'content-type': 'application/json' })
	res.end(JSON.stringify({ type: 'error', error: { type, message } }))
}

function log(message) {
	console.log(`[claude-code-bridge] ${message}`)
}
