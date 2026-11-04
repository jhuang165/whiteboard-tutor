# whiteboard-tutor

A general-purpose tutor that works on a shared whiteboard, starting with math. The student writes and sketches on a
[tldraw](https://tldraw.dev) canvas. A Claude-backed tutor reads the board and answers on
it: a hint card next to the line where the student is stuck, a circle around the first
wrong step, a ✓ or ✗ beside a finished answer, or a worked example in its own ink.

The tutoring behavior comes from a set of probability tutoring skills, turned
into rules for a canvas: one hint rung per turn, at most one question per turn, never give
away the answer unasked, and never write over or change the student's work. The full
design is in [docs/PLAN.md](docs/PLAN.md).

## Status

Early. Phase 0 (the scaffold) is done, Phase 1 (the tutor MVP) is under way, and the first Phase 2 pieces (quizzes, answer checks, evidence, history) are in, plus the Phase 3 transcription chip, tutor cursor, and diagram library. Most eval cases
and example problems are probability, with a few in algebra, geometry, calculus, and linear
algebra; other subjects aren't tested yet.

Working now:

- **Explain**, **Hint**, **Check**, **Wait, what?**, and **Quiz me** buttons above the chat. Each one
  sets the tutor mode for that turn and tracks how many hints the student has used.
- A tutor system prompt built from the pedagogy rules, kept static so it stays cached.
- Tutor marks: `hint` (a violet card with an arrow to the student's work), `mark-error` (a
  red circle and a slip/misconception label), and `verdict` (a ✓ or ✗ stamp). The app
  picks where each mark goes, so it never covers student ink, and then locks it.
- Handwriting: before judging a handwritten line, the tutor puts a faint "Here's what I
  read" chip beside it. A read it isn't sure of is dashed and says which part is unclear,
  and the tutor won't mark it wrong until the student confirms. **Not what I wrote** on the
  chip lets the student type the line, and the tutor grades that.
- Tutor presence: a violet tutor cursor appears when a turn starts, goes to each new mark,
  and writes it in instead of popping it onto the board.
- Problems and math: `pose-problem` puts one problem in a frame with a work area below it,
  moves the view there, and hands the student the pen. `write-math` typesets a formula
  with KaTeX in tutor ink.
- Diagrams: `diagram` draws a probability tree, table, Venn diagram, number line, function
  graph, or matrix from a structured spec, laid out in code instead of drawn stroke by
  stroke. **Wait, what?** uses them to re-explain with a different picture.
- The tutor can only add to the board. Every action that moves, edits, or deletes shapes is
  turned off, and everything the tutor draws is locked.
- Claude calls use the official `@anthropic-ai/sdk` with adaptive thinking, per-button
  effort (low for Hint, medium otherwise), a cached system prompt, and server-side
  fallbacks.
- Quizzes: **Quiz me** poses one problem, chosen from the student's record. In the
  background, `/verify` solves it with Claude's code execution tool and keeps the answer on
  the server. **Check** grades the attempt against that answer. A problem the check finds
  flawed is marked as the question's fault and doesn't count.
- Evidence: each solve is logged as assisted (any hint or wrong check), independent, or
  retained, and explanations as exposure. The app decides the level, not the model. A
  **Progress** panel at the top of the chat lists it by concept, with review dates.
- Reviews: when a review is due, a card above the tutor buttons offers it. **Review now**
  poses a new problem on that concept, so a clean solve counts as retained.
- History: the **History** button in the chat header lists past sessions, newest first.
  Each problem shows how it went and the hints it took, with **Show on board** for frames
  still on the canvas. Checked answers never reach the page.
- Behavior evals (`npm run eval`).

Not done yet: accounts (progress is tied to an anonymous id in this browser), auth and rate
limits on the routes. Real model turns have only run through the
dev-only bridge below, which has no code sandbox, so answer checks there run without code. See the phase list in [docs/PLAN.md](docs/PLAN.md#5-build-phases).

## Run it

You need Node 22.12 or newer (see `.nvmrc`) and an Anthropic API key.

```bash
cp .dev.vars.example .dev.vars   # then set ANTHROPIC_API_KEY
npm install
npm run dev                      # http://localhost:5173
```

Without a key the app loads, but a chat message fails in the worker with
`AI_LoadAPIKeyError`.

### Testing without an API key

`scripts/claude-code-bridge.mjs` is a small local server that answers the worker's Messages
API calls by running the Claude Code CLI on your own login. Put these lines in `.dev.vars`
instead of a real key (they are in `.dev.vars.example`, commented out):

```bash
ANTHROPIC_BASE_URL=http://127.0.0.1:8790
ANTHROPIC_API_KEY=claude-code-bridge
CLAUDE_BRIDGE_COMMAND=claude   # or another CLI wrapper on your PATH
```

Then run the bridge and the app in two terminals:

```bash
npm run bridge
npm run dev
```

This is for testing on your own machine only. A Claude subscription or Enterprise seat is
not API access, so don't use the bridge to serve anyone else. The bridge has no tools and
folds the conversation into one user turn, so behavior and caching differ slightly from the
real API.

Other scripts:

```bash
npm run typecheck   # tsc --noEmit
npm test            # Vitest
npm run eval        # tutor behavior evals: real model calls (see below)
npm run build       # production build
```

### Evals

`npm run eval` sends each case in `evals/cases/` through the worker's own model call and
scores the tutor's actions: the verdict, which line the error mark targets, slip versus
misconception, one hint rung, the question budget, and no answer leaks. It reads its keys
from `.dev.vars` like the worker does. It refuses to call the real API unless
`EVAL_ALLOW_API=1` is set, so the default is to run it through the bridge. Results go to
`evals/results/` (gitignored), with a summary in `latest.md`. The `tutor-eval` skill
describes the case format.

## How it fits together

The app starts from tldraw's agent starter kit. Its own docs are in
[docs/agent-starter-kit.md](docs/agent-starter-kit.md).

| Path | What's there |
| --- | --- |
| `client/` | React app: the canvas, chat panel, tutor buttons, agent actions (`actions/`), prompt parts (`parts/`), and modes (`modes/`) |
| `client/tutor/` | Helpers for tutor marks: ink colors, placement, locking |
| `worker/` | Cloudflare Worker and Durable Object. Streams the model's actions back to the client. The system prompt is in `worker/prompt/` |
| `shared/` | Code used on both sides: action schemas, the shape format, the model list, tutor turn text |
| `evals/` | Tutor behavior evals: cases of student work, deterministic checks, and the runner |
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
  folder. `academic-tutor` has no upstream. Sources are listed in the provenance note in
  [pedagogy/](pedagogy/).
