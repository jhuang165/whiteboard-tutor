---
name: tutor-eval
description: Design, extend, and run the tutor behavior eval suite — board fixtures of student work, deterministic checks on the tutor's action stream, and an MRBench-style judged rubric. Use when adding an eval case, changing the tutor prompt, modes, or actions, or judging whether a tutor change is an improvement.
---

# Tutor behavior evals

The tutor is judged by what it does on the board, not by how nice the prose reads. Any
change to the prompt, a mode, or an action runs this suite before it merges. Record the
before/after scores in the change description. For eval-building methodology and cost
approval, follow the `claude-api` skill's `build-eval` and `hillclimb` guides. Running
evals spends API money, so get the developer's OK on the budget first.

## Running

`npm run eval` (config `vitest.eval.config.ts`, kept out of `npm test`). It builds the prompt
the client would send (`evals/lib/buildCasePrompt.ts`), streams it through the worker's
`AgentService`, and scores the completed actions (`evals/lib/checks.ts`, unit-tested in
`checks.test.ts`). Each case is a vitest test that fails on any failed check. Results go
to `evals/results/<stamp>.json` with a table in `latest.md` (gitignored).

- Keys come from `.dev.vars` only, never the shell: a host app can export
  `ANTHROPIC_BASE_URL`. Point it at the bridge (`npm run bridge`) to run without API spend.
- Without the bridge, the runner refuses to start unless `EVAL_ALLOW_API=1` is set. Get
  the developer's OK on the budget first.
- `EVAL_REPEAT=n` runs each case n times (the model is not deterministic; report pass
  rates, not single runs). `EVAL_MODEL=<name>` overrides the model.
  `npm run eval -- -t <substring>` runs matching cases only.
- Differences from a live turn: no screenshot (the model reads the shape list) and no
  chat history. Mark placement and the no-overlap rule run in the client, so they aren't
  checked here.

## Case format (`evals/cases/<id>.json`, type `EvalCase` in `evals/lib/EvalCase.ts`)

- `intent` (the button: `check`, `hint`, `explain`, `wait-what`, `chat`), `hintsGiven`,
  and an optional `message` (defaults to the button's message) and `model`.
- `board`: the student shapes as the tutor sees them: `shapeId` (simple id, no
  `shape:`), `text`, `x`, `y`, `w`, `h`, and `type` (default `text`). Use neutral ids
  (`line1`, `line2`) so the ids don't hint at the error.
- `expect`: `verdict` (`correct`, `incorrect`, or `none`), `markErrorOn` (a shape id or
  `none`), `errorKind`, `hints` with `hintRungs` and `hintAnchorIn`, `maxQuestions`,
  `maxMarks`, and `forbidden` (strings that must not appear in student-visible text,
  matched as whole values, so "0.19" doesn't match "10.19").
- `rules`: the `pedagogy-spec` ids under test, and a `description` of what the case
  probes.
- Source: hand-built from DATA 21100 topics (conditional probability, Bayes, counting,
  expectation), adapted from MathDial or Bridge (check the license first), or produced by
  real sessions with consent.

## Deterministic checks (on the action stream)

Implemented in `evals/lib/checks.ts`: answer leak, earliest error, question budget, mark
budget, plus the verdict, one hint rung with its anchor, and mode-only actions. Still to
build: overlap and mutation (placement runs in the client), C3 on ambiguous handwriting
(needs screenshot cases), and L (Phase 4). `pose-problem` and `write-math` count as marks;
their `latex`, `title`, and `statement` are scanned for leaks but not counted as questions.
A case can set `problem` (shape id, title, statement) to put a posed problem in the prompt.

| Check | Rule |
| --- | --- |
| Answer never appears in hint rungs H1–H4 | H, Bastani et al. |
| The single `mark-error` targets the first wrong line, with the right slip/misconception kind | M3, E1 |
| ≤1 question across chat, hint cards, and labels, and 0 in concept mode | Q1, Q2 |
| No tutor shape overlaps student ink bounds, and no student shape is mutated | C1 |
| ≤1 new tutor mark in problem mode | C4 |
| Low-confidence handwriting is transcribed before any ✗ | C3 |
| Evidence level matches the hints actually opened | L |

## Judged rubric (MRBench dimensions, 1–3 each)

Mistake identification, mistake location, answer revealing (reverse-scored), guidance,
actionability, coherence, tone, human-likeness. LLM judges correlate poorly with human
ratings. Keep a hand-labeled calibration set of about 20 cases and report judge-versus-human
agreement before trusting judge deltas.

## Also test

- Long sessions. MathTutorBench finds tutoring quality decays over many turns, so include
  10+ turn replays.
- Sycophancy in both directions: false praise of near-misses, and failing to praise
  correct work.
- D1: an explicit full-solution request gets the solution, not a refusal.
