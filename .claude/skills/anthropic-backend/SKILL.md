---
name: anthropic-backend
description: Project conventions for the worker's Claude API calls — model and effort per route, prompt-cache layout, streaming canvas actions, answer verification with code execution, fallbacks, and cost limits. Use when writing or changing any code that calls Claude. Read the built-in claude-api skill for SDK syntax; this skill only records project decisions.
---

# Claude backend conventions

Use the official `@anthropic-ai/sdk` in the worker. For exact SDK calls, read the
`claude-api` skill and the TypeScript docs it points to; never guess the API shape. Update
this file when a decision changes.

## What is built (2026-11-04)

- `/stream` calls `client.beta.messages.stream()` from `worker/do/AgentService.ts`. The
  request is built in `worker/do/anthropicRequest.ts` (unit-tested): system prompt as one
  text block with `cache_control`, adaptive thinking, `output_config.effort` from
  `getTurnEffort`, `max_tokens` 16000, and `betas` + `fallbacks: "default"` when the model
  definition has `serverFallback` (not Haiku 5.5). No temperature, no prefill.
- Effort per tutor button: `low` for Hint; `medium` for Explain, Check, Wait-what, and Quiz me. Chat
  turns keep the model definition's `effort`.
- After the stream: a `[usage]` log line (input, cache read and write, output, stop
  reason), a `[fallback]` warning when a `fallback` block shows up, and a thrown error on
  `stop_reason: "refusal"` with `stop_details.category`.
- The client is built with explicit `apiKey` (`null` when unset), `authToken: null`, and
  `baseURL`, so the SDK never reads `ANTHROPIC_*` from the shell. `ANTHROPIC_BASE_URL` has
  no `/v1`; a trailing `/v1` is stripped for old `.dev.vars` files.
- `/verify` (`worker/verify/verifyProblem.ts`): one non-streamed-to-client call per posed problem, `messages.stream().finalMessage()` so long thinking cannot time out, resuming up to 3 `pause_turn` stops by resending the assistant content. The answer is read from the last text block that parses against `VERIFY_OUTPUT_SCHEMA`. `checkedWithCode` is true only when a `bash_code_execution_result` returned code 0. The answer stays in `LearnerDurableObject`; `AgentDurableObject` attaches it to the `problem` part and drops any `verified` the client sent.
- The Anthropic client comes from `worker/anthropicClient.ts` for every route.
- `/triage` (`worker/triage/triageWork.ts`, route `worker/routes/triage.ts`): Sonnet 5.5,
  effort `low`, adaptive thinking, `max_tokens` 4000, `TRIAGE_OUTPUT_SCHEMA` structured
  output, `fallbacks: "default"`, through `client.beta.messages.stream().finalMessage()`. The
  checked answer comes from `LearnerDurableObject.getVerification`; a flawed problem
  answers no without a call. Any error is a no. The `watch` tutor turn it triggers runs at
  effort `low`.
- Not built yet: `/ingest`, the per-session token ceiling, crops, and auth or rate limits on `/verify`.

## Routes

| Route | Model | Effort | Notes |
| --- | --- | --- | --- |
| `/stream` tutor turn | `claude-opus-5-5` | `low` for hint and annotation turns, `medium` for concept and review | Streams canvas actions. Adaptive thinking (it can't be disabled on 5.5). |
| `/verify` | `claude-opus-5-5` | `high` | Server tool `code_execution_20260521` (the newest; prefer it per the docs) plus a JSON-schema `output_config.format`. Results come back as `bash_code_execution_tool_result`. Built. |
| `/triage` (proactive mode) | `claude-sonnet-5-5` (decided 2026-11-04, `docs/PLAN.md` §8 #3) | `low` (Sonnet 5.5 defaults to `high`, so set it) | Classifier only: intervene or not, plus a reason, as structured output. |
| `/ingest` | `claude-opus-5-5` | `medium` | PDF documents with citations, for page-grounded problem extraction. |

Set `effort` explicitly. Opus 5.5 defaults to `medium`. Enable server-side `fallbacks:
"default"` (beta `server-side-fallback-2026-07-01`) and check `stop_reason` for `refusal`
before reading content.

## Prompt layout (cache-friendly)

1. Tool or action schemas (deterministic order)
2. Frozen system prompt built from `pedagogy-spec`
3. **Cache breakpoint**
4. Session context (problem statement, learner snapshot)
5. Per-turn content: mode, hint-ladder state, crop image, shape JSON

Nothing volatile (timestamps, ids) goes before the breakpoint. Check
`usage.cache_read_input_tokens` in dev logs.

## Gotchas on 5.5 models

- Forced `tool_choice` (`any`/`tool`) returns 400. Use `auto` with `strict: true`, or
  structured outputs.
- Assistant prefill and `temperature` are rejected.
- With streaming client tools, set `eager_input_streaming: true` and validate each parsed
  input against its schema before applying it to the canvas.

## Cost and safety

- Log `usage` per turn, with a per-session token ceiling.
- Send crops, not the full board.
- Keep the API key in `.dev.vars` or Worker secrets only, never in client code.
- Student work goes only to Anthropic, plus Mathpix if it gets added. Don't add
  third-party analytics.
