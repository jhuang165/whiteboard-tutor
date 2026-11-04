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
- Differences from a live turn: no screenshot and no chat history unless the case sets
  them (the model otherwise reads the shape list). Mark placement and the no-overlap rule
  run in the client, so they aren't checked here.

## Case format (`evals/cases/<id>.json`, type `EvalCase` in `evals/lib/EvalCase.ts`)

- `intent` (the button: `check`, `hint`, `explain`, `wait-what`, `quiz`, `chat`), `hintsGiven`,
  and an optional `message` (defaults to the button's message) and `model`. `reviewConcept`
  makes a `quiz` case a review started from the review queue.
- `history`: earlier turns, oldest first, as `{ "role": "student", "message" }` or
  `{ "role": "tutor", "actions": [...] }` with actions as the model streams them. Leave out
  `think` actions: pasted-back thoughts get refused as reasoning extraction. Needed for a
  second hint press and for Wait-what.
- `screenshot`: a PNG in `evals/fixtures/`, sized to the viewport around the board (the
  shapes' bounds plus 200 px on each side). Ink shapes are `"type": "draw"` with no `text`,
  so the model has to read them from the image.
- `board`: the student shapes as the tutor sees them: `shapeId` (simple id, no
  `shape:`), `text`, `x`, `y`, `w`, `h`, and `type` (default `text`). Use neutral ids
  (`line1`, `line2`) so the ids don't hint at the error.
- `expect`: `verdict` (`correct`, `incorrect`, or `none`, or a list of allowed ones), `markErrorOn` (a shape id or
  `none`), `errorKind`, `hints` with `hintRungs` and `hintAnchorIn`, `maxQuestions`,
  `posesProblem` (how many `pose-problem` actions, each with a concept, title, and statement),
  `posesConceptIn` (the concept slugs a posed problem may use, to show Quiz me follows the
  learner's record instead of a default topic), `maxMarks`, and `forbidden` (strings that must not appear in student-visible text,
  matched as whole values, so "0.19" doesn't match "10.19"), and `required` (groups of
  alternatives; one string from each group must appear, such as the answer on a D1
  request or the transcribed value on a C3 case), and `transcribes` (student ink shape ids
  that a `transcribe` must cover before the first verdict or error mark; it also fails an
  incorrect verdict or error mark on a low-confidence read). A transcription chip already on
  the board is a shape of type `unknown` with `note` "tutor transcription of lineN" and the
  chip's text, such as `read (low confidence): 0.63; unsure: ...; the student corrected it to: 0.68`.
  `diagram` lists the diagram kinds (`tree`, `table`, `venn`, `number-line`, `plot`,
  `matrix`) a Wait-what turn may use: at least one `diagram` action must be of an allowed
  kind, and every diagram must parse and lay out with no warnings.
- `rules`: the `pedagogy-spec` ids under test, and a `description` of what the case
  probes.
- Source: hand-built across math topics (probability and counting, algebra, geometry,
  calculus, linear algebra), adapted from MathDial or Bridge (check the license first), or
  produced by real sessions with consent. Keep a spread of topics: the tutor is general
  purpose, and a prompt change can regress one topic while helping another.

## Deterministic checks (on the action stream)

Implemented in `evals/lib/checks.ts`: answer leak, earliest error, question budget, mark
budget, plus the verdict, one hint rung with its anchor, and mode-only actions. Still to
build: overlap and mutation (placement runs in the client). C3 is covered by a screenshot
case (`ambiguous-digit-check`) with `transcribes` and `required` on the transcribed value,
and by `corrected-read-check`, where the student's correction turns a right read into a
wrong answer. `transcribe` is not a mark; its `unsure` note counts as visible text. `poses-problem`
also rejects bare-number titles such as "Problem 3". L is decided in code, not by the model, so it is unit-tested in `shared/tutor/evidence.test.ts` instead. `pose-problem` and `write-math` count as marks;
their `latex`, `title`, and `statement` are scanned for leaks but not counted as questions.
`diagram` counts as a mark too; its labels, cells, outcomes, and expressions are scanned for
leaks (numbers placed by value, like a point on a number line, aren't). `draws-diagram` (M6)
runs on `wait-what-after-explain`, `inequality-number-line-wait-what`, and
`absolute-value-wait-what-after-table`, where the earlier turn already drew a table, so
another table fails.
A case can set `problem` (the full `ProblemPart` problem, including `verified` for the checked answer the worker would attach) and `learnerSummary` (the per-concept evidence summary). Put the checked answer in `forbidden` on hint cases.

| Check | Rule |
| --- | --- |
| Answer never appears in hint rungs H1–H4 | H, Bastani et al. |
| The single `mark-error` targets the first wrong line, with the right slip/misconception kind | M3, E1 |
| ≤1 question across chat, hint cards, and labels, and 0 in concept mode | Q1, Q2 |
| No tutor shape overlaps student ink bounds, and no student shape is mutated | C1 |
| ≤1 new tutor mark in problem mode | C4 |
| Low-confidence handwriting is transcribed before any ✗ | C3 |
| A Wait-what re-explanation draws a valid `diagram` of an allowed kind | M6 |
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
