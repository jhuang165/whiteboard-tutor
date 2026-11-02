# whiteboard-tutor

A math tutor that works on a shared whiteboard. The student writes and sketches on a
[tldraw](https://tldraw.dev) canvas. A Claude-backed tutor reads the board and answers on
it: a hint card next to the line where the student is stuck, a circle around the first
wrong step, a ✓ or ✗ beside a finished answer, or a worked example in its own ink.

The tutoring behavior comes from a set of DATA 21100 (probability) tutoring skills, turned
into rules for a canvas: one hint rung per turn, at most one question per turn, never give
away the answer unasked, and never write over or change the student's work. The full
design is in [docs/PLAN.md](docs/PLAN.md).

## Status

Early. Phase 0 (the scaffold) is done and Phase 1 (the tutor MVP) is under way.

Working now:

- **Explain**, **Hint**, **Check**, and **Wait, what?** buttons above the chat. Each one
  sets the tutor mode for that turn and tracks how many hints the student has used.
- A tutor system prompt built from the pedagogy rules, kept static so it stays cached.
- Tutor marks: `hint` (a violet card with an arrow to the student's work), `mark-error` (a
  red circle and a slip/misconception label), and `verdict` (a ✓ or ✗ stamp). The app
  picks where each mark goes, so it never covers student ink, and then locks it.
- The tutor can only add to the board. Every action that moves, edits, or deletes shapes is
  turned off.

Not done yet: a problem frame, math rendering (KaTeX), the swap to the official
`@anthropic-ai/sdk`, evals, quizzes, and evidence tracking. No real model turn has been run
yet. See the phase list in [docs/PLAN.md](docs/PLAN.md#5-build-phases).

## Run it

You need Node 22.12 or newer (see `.nvmrc`) and an Anthropic API key.

```bash
cp .dev.vars.example .dev.vars   # then set ANTHROPIC_API_KEY
npm install
npm run dev                      # http://localhost:5173
```

Without a key the app loads, but a chat message fails in the worker with
`AI_LoadAPIKeyError`.

Other scripts:

```bash
npm run typecheck   # tsc --noEmit
npm test            # Vitest
npm run build       # production build
```

## How it fits together

The app starts from tldraw's agent starter kit. Its own docs are in
[docs/agent-starter-kit.md](docs/agent-starter-kit.md).

| Path | What's there |
| --- | --- |
| `client/` | React app: the canvas, chat panel, tutor buttons, agent actions (`actions/`), prompt parts (`parts/`), and modes (`modes/`) |
| `client/tutor/` | Helpers for tutor marks: ink colors, placement, locking |
| `worker/` | Cloudflare Worker and Durable Object. Streams the model's actions back to the client. The system prompt is in `worker/prompt/` |
| `shared/` | Code used on both sides: action schemas, the shape format, the model list, tutor turn text |
| `pedagogy/` | The source tutoring skills, used as prompt material, with their licenses and provenance |
| `docs/PLAN.md` | Design, architecture, phases, evals, and open decisions |

Each turn, the client sends a screenshot of the board, a structured list of shapes, and
the turn's tutor mode. The worker builds the prompt and calls Claude (`claude-opus-5-5` by
default). The model streams back JSON actions, and the client applies them to the canvas
as they arrive.

## Licenses

- The tldraw SDK is free for development. Production use needs a tldraw license key (trial,
  hobby, or commercial). The "made with tldraw" watermark stays.
- The agent starter kit template is MIT: [LICENSE-tldraw-agent-template.md](LICENSE-tldraw-agent-template.md).
- Each adapted skill under `pedagogy/source-skills/` keeps its upstream LICENSE in its own
  folder. `academic-tutor` was written for the course and has no upstream. Sources are
  listed in [pedagogy/PROVENANCE-data21100.md](pedagogy/PROVENANCE-data21100.md).
