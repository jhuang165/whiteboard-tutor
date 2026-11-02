# whiteboard-tutor

Project guide for AI coding agents working in `/Users/programming-xcode/Desktop/whiteboard-tutor`.

## Shared memory bridge

This repository uses the Mac-local shared memory bridge (project id `whiteboard-tutor`); Claude
native auto-memory and Codex native memories are disabled. At every session start, run the
exact `memoryctl load` command emitted by the SessionStart hook with its current writer and
session ID, read the returned `MEMORY.md` index in full, then read only relevant bodies with
`memoryctl read --repo "$PWD" --topic TOPIC-SLUG`. Treat that revision-bound load as required
context; reload before continuing if a hook reports newer memory.

After every meaningful completed unit and before stopping or compacting, start one focused
lowercase kebab-case topic with `memoryctl begin --repo "$PWD" --topic TOPIC-SLUG --operation
upsert --writer WRITER --session SESSION-ID`. Edit only the staged `topic.md` and `pointer.txt`,
never the canonical memory directory. Record the change and reason, absolute date, state,
branch, key files or functions, verification, pending work, and non-obvious decisions; keep the
pointer to exactly one Markdown link and exclude secrets and transient narration. Commit with
`memoryctl commit TRANSACTION-ID`. On a stale revision, reload, reread, and reconcile through a
new transaction, never force-copy staged files. Use `memoryctl no-op` only for a clean session
with a truthful reason.

The operator guide is `~/claude-tools/docs/shared-memory-bridge.md`.

## Project

A web app that tutors through a shared tldraw whiteboard. The student writes and draws; a
Claude-backed tutor reads the canvas and responds on it with hints, annotations, diagrams,
and worked steps. The design, phases, and open decisions are in `docs/PLAN.md`. Read it
before writing code. Status: Phase 0 scaffold is in place (the tldraw agent template,
defaulting to `claude-opus-5-5`). Phase 1 has started: tutor buttons, the `tutorTurn` prompt
part, the tutor system prompt, and a tutor mode that can only add to the board. No real
model turn has run yet.

Stack: TypeScript, Vite + React, `tldraw` 5.6 agent starter kit, Cloudflare Worker + Durable
Object (`AgentDurableObject`). The worker still calls Claude through the template's Vercel
AI SDK (`@ai-sdk/anthropic`); swapping to the official `@anthropic-ai/sdk` is planned
(PLAN §4). The template's own docs are in `docs/agent-starter-kit.md`.

## Commands

Node 22.12+ is required (`.nvmrc`). On this Mac, Homebrew's `node@22` is keg-only, so put
`/opt/homebrew/opt/node@22/bin` first on `PATH`.

```bash
cp .dev.vars.example .dev.vars   # then set ANTHROPIC_API_KEY
npm install
npm run dev        # Vite + the worker via @cloudflare/vite-plugin, http://localhost:5173
npm run typecheck  # tsc --noEmit
npm test           # vitest run (config in vitest.config.ts, not vite.config.ts)
npm run build
```

Without a key, a chat message fails in the worker with `AI_LoadAPIKeyError`.

## Layout

| Path | What it is |
| --- | --- |
| `docs/PLAN.md` | Product brainstorm, architecture, phases, evals, open decisions |
| `client/` | React app: tldraw canvas, chat panel, agent actions (`actions/`), prompt parts (`parts/`), modes (`modes/`) |
| `worker/` | Cloudflare Worker: `/stream` route, `do/AgentService.ts` model calls, system prompt (`prompt/`) |
| `shared/` | Code used by both sides: model list (`models.ts`), shape formats, schemas |
| `.claude/skills/` | Dev skills for agents working here (Codex sees them via `.agents/skills`) |
| `pedagogy/source-skills/` | DATA 21100 tutoring skills, copied as **product prompt material** |
| `pedagogy/PROVENANCE-data21100.md` | Upstream sources and licenses for those skills |

The files in `pedagogy/` describe how the *product's* tutor behaves toward students. They
are not instructions for you while developing. Don't tutor the developer. Keep upstream
LICENSE files next to any derived text.

## Skills

Read only the skill the task needs:

- `pedagogy-spec`: tutor behavior rules (rule ids M/H/Q/E/C/D/V/L/T). Use it for prompt,
  mode, action, or eval work.
- `tldraw-dev`: tldraw SDK and agent-kit work, and where current docs live.
- `anthropic-backend`: any code that calls Claude. Also read the built-in `claude-api`
  skill for SDK syntax.
- `tutor-eval`: adding eval cases, or judging whether a tutor change helped.

## Conventions

- Verify tldraw and Claude API shapes against current docs. Both changed a lot in 2025–26,
  and memory is stale.
- A change to the tutor prompt, a mode, or an action updates `pedagogy-spec` when needed
  and runs the evals (`tutor-eval`). Evals spend API money, so ask before large runs.
- Secrets live only in `.dev.vars` or Worker secrets. Never put them in client code or in
  commits.
- Never hide the tldraw watermark or bypass its license check.
- Record decisions that resolve `docs/PLAN.md` §8 in the plan and in bridge memory.
