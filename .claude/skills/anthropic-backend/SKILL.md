---
name: anthropic-backend
description: Project conventions for the worker's Claude API calls — model and effort per route, prompt-cache layout, streaming canvas actions, answer verification with code execution, fallbacks, and cost limits. Use when writing or changing any code that calls Claude. Read the built-in claude-api skill for SDK syntax; this skill only records project decisions.
---

# Claude backend conventions

Use the official `@anthropic-ai/sdk` in the worker. For exact SDK calls, read the
`claude-api` skill and the TypeScript docs it points to; never guess the API shape. Update
this file when a decision changes.

## Routes

| Route | Model | Effort | Notes |
| --- | --- | --- | --- |
| `/stream` tutor turn | `claude-opus-5-5` | `low` for hint and annotation turns, `medium` for concept and review | Streams canvas actions. Adaptive thinking (it can't be disabled on 5.5). |
| `/verify` | `claude-opus-5-5` | `high` | Server tool `code_execution_20260521`. Results come back as `bash_code_execution_tool_result`. |
| `/triage` (proactive mode) | Undecided. See `docs/PLAN.md` §8 #3 | `low` | Classifier only: intervene or not, plus a reason. |
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
