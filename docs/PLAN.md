# Whiteboard Tutor: brainstorm and build plan

Status: planning, no app code yet. Drafted 2026-11-01.

## 1. The idea in one paragraph

Students work problems the way they would at a whiteboard with a tutor beside them: they write
and sketch with a pen, and the tutor answers *on the board*. It circles the line where the
reasoning breaks, leaves a hint card next to it, draws a tree diagram when a formula isn't
landing, writes a worked example in its own ink, or poses the next practice problem in a frame.
The tutor's behavior comes from the DATA 21100 skills (`pedagogy/source-skills/`). Those
skills were written for chat. This app turns them into spatial behavior, where the board
replaces the transcript.

## 2. What we're carrying over from data21100

| data21100 skill | Canvas behavior |
| --- | --- |
| `math-tutor`, concept mode | Direct explanation drawn as a worked example in a tutor frame: intuition, then a small concrete case, then the formal statement. **Zero questions** by default. |
| `math-tutor`, problem mode (hint ladder) | A stack of hint cards, one rung per turn: diagnose → foundation → strategy → lead to the step → model fully plus a twist problem. The tutor puts one card on the board and stops. The student can request the next rung. |
| `math-tutor`, review mode | Verdict stamp (✓ or ✗). If ✗, an arrow points to the **earliest substantive error**, labeled *slip* or *misconception*. A sound method is left intact. |
| `math-tutor` misconceptions reference | Prompt part loaded when an error looks conceptual. For a misconception, the tutor sets up a counterexample on the board so the student produces the contradiction themselves. |
| `wait-what` | A "Wait, what?" button. The tutor re-explains with a **different representation**: table, tree, reduced sample space, area model, number line. This is where the canvas beats chat. |
| `tutor` (quiz) | Problem frames with an answer region. The tutor solves each problem privately first and verifies with code execution before grading. Bad questions are invalidated, not counted against the student. |
| `grill-me` | Oral-exam mode: one probe at a time, anchored to a specific claim in the student's work. Ends with what held up, the gap, and the next exercise. |
| `teach` | Multi-session plans, a prerequisite map drawn as a concept graph, spaced-review dates (1/3/7/21 days). |
| `tutor-setup` | Upload a PDF problem set or lecture notes. Pages become locked background images; problems are extracted into frames with source/page citations. |
| `academic-tutor` (router) | Mode router: picks a mode from the button pressed, or from the student's question and canvas state. |
| CLAUDE.md evidence rules | Every interaction logs an evidence record: *exposure* (saw an explanation), *assisted* (solved after hints; records which rungs), *independent*, *retained* (correct on delayed review). A generated lesson is never logged as mastery. |

Three cross-cutting rules move over unchanged: **one focused question per turn**, **give
direct answers when asked** (a requested full solution is delivered, followed by a twist
problem), and **check the answer before grading**.

## 3. Canvas-native ideas (new, not from data21100)

- **Two inks.** Student ink is theirs. Tutor marks use a distinct color and style, sit on a
  separate layer, and are locked. The tutor never writes over or edits student ink. A
  "hide tutor marks" toggle shows the student's own work alone.
- **"Here's what I read" transcription.** Before judging handwriting, the tutor shows a faint
  transcription of the student's line (for example `P(A|B) = P(A∩B)/P(B)`), and the student
  can tap to correct it. This guards against the biggest failure mode, which is grading a
  misread.
- **Anchored annotations.** Every tutor mark is attached to a specific student shape or line
  region. No floating essays.
- **Hint ladder as cards.** Rungs appear as collapsed cards. Opening one marks the attempt as
  assisted, so the evidence log stays honest without any nagging.
- **Tutor presence.** A tutor cursor moves to where it's about to write, and strokes animate
  in. This makes the response feel like a person at the board and makes long responses
  bearable.
- **Proactive watching (opt-in).** After the student pauses (stroke complete plus about 6 s
  idle), a cheap triage call decides whether to intervene. The default is *don't*. It only
  steps in on a clear error the student hasn't noticed after moving on.
- **Representation library.** Reusable tutor diagram builders: probability tree,
  contingency table, Venn diagram, number line, function plot, matrix grid. Claude places
  structured components instead of freehand-drawing every line.
- **Board as session record.** Each session is a page. Review mode reopens old pages so the
  student can redo a problem with the tutor's marks hidden.

## 4. Architecture

Start from tldraw's **agent starter kit** (`npm create tldraw@latest -- --template agent`):
a Vite + React client and a Cloudflare Worker with a Durable Object.

What the kit already gives us:

- Model context from both a JPEG screenshot and simplified shape JSON (blurry, focused, and
  peripheral shapes)
- Streamed, incrementally applied JSON actions
- Actions for create, update, move, label, **pen strokes**, think, review, and camera moves
- Modes (`AGENT_MODE_DEFINITIONS`) that select which prompt parts and actions are active
- Typed extension points (`AgentActionUtil`, `PromptPartUtil`), plus system prompt sections
  in `worker/prompt/sections/`

```
client (Vite + React + tldraw 5.x)
  ├─ TutorShell: mode buttons (Explain · Hint · Check · Wait what? · Quiz me · Grill me)
  ├─ custom shapes: MathShape (KaTeX), HintCard, ProblemFrame, VerdictStamp, TranscriptionChip
  ├─ tutor actions (AgentActionUtil): annotate-error, place-hint, write-math, verdict,
  │    pose-problem, draw-diagram(tree|table|venn|numberline|plot), transcribe, ask-one
  ├─ prompt parts (PromptPartUtil): ProblemStatement, StudentWorkCrop (hi-res crop of
  │    recent strokes), PedagogyMode, HintLadderState, LearnerSnapshot
  └─ watcher: store.listen(source:'user') → isComplete + idle → triage request
worker (Cloudflare)
  ├─ /stream: tutor turn (system prompt built from pedagogy/), streams actions
  ├─ /triage: cheap "should I intervene?" classifier for proactive mode
  ├─ /verify: Claude with code execution to solve and check answers before grading
  ├─ /ingest: PDF → page images + extracted problems with page citations
  └─ LearnerDO (one per student, SQLite): sessions, evidence records, review schedule
```

### Model plan (Claude API, current as of 2026-10)

- **Tutor turns: `claude-opus-5-5`** ($4/$20 per MTok, 1M context, vision). Use adaptive
  thinking, which can't be disabled on 5.5. Set `effort` explicitly: its default is
  `medium`. Try `low` for hint and annotation turns where latency matters, and `high` for
  review and verification. Enable server-side `fallbacks: "default"` for refusals.
- **Triage for proactive watching:** a cheaper second model (`claude-haiku-5-5`, $0.10/$0.50)
  is the natural fit. Per the house default, that's your call (see §8). Opus 5.5 at `low`
  effort is the single-model alternative, and it keeps a single prompt cache.
- **Answer verification:** server tool `code_execution_20260521` (sympy, exact enumeration), the newest version, with a JSON-schema `output_config.format` for the answer. Built in Phase 2.
  Output arrives as `bash_code_execution_tool_result` blocks.
- **Prompt caching:** put the frozen pedagogy system prompt and action schema first, with a
  cache breakpoint after them. Screenshots and per-turn state go last. Verify with
  `usage.cache_read_input_tokens`.
- **API gotchas for 5.5:** forced `tool_choice` returns 400, so use `auto` with `strict: true`
  or structured outputs. Assistant prefill is gone. `temperature` is rejected.
- **SDK decision (done 2026-11-02):** the worker calls Claude through the official
  `@anthropic-ai/sdk` instead of the kit's Vercel AI SDK. That gives first-class access to
  code execution, effort, fallbacks, and cache diagnostics.

### Licensing (must decide before anything is public)

The tldraw SDK is free for development and staging. **Production needs a license key.** The
options:

- 100-day free trial
- Free *hobby* license (non-commercial, application approved by tldraw, "made with tldraw"
  watermark stays visible)
- Commercial license (contact sales; startup discount exists)

The template code is MIT, but it depends on the SDK. Personal and class use fits the hobby
license.

## 5. Build phases

**Phase 0: scaffold (half a day).** Mostly done 2026-11-01.

- [x] Generate the agent template into this repo (`create-tldraw@5.6.0 --template agent`).
- [x] Switch the default model to `claude-opus-5-5` (`shared/models.ts`).
- [x] Confirm it runs locally: canvas and chat load, and `/stream` reaches the worker.
  A real model turn ran on 2026-11-01 through the dev-only Claude Code bridge (Phase 1).
- [x] Typecheck script and the project skills described in §7.
- [x] Vitest (`npm test`), added with the first Phase 1 slice.
- [ ] Lint and Playwright. Deferred until there is UI flow worth testing end to end.

**Phase 1: tutor MVP, single-player, explicit triggers.** Started 2026-11-01; built and
tested on probability first (§8 #1: the app itself is general purpose).

- [x] Problem frame plus pen, 2026-11-02. `pose-problem` puts one problem in a locked
  `problem-frame` shape (`client/shapes/ProblemFrameShapeUtil.tsx`): the statement on top,
  with inline `$...$` KaTeX, and a work area below. It goes to the right of the existing
  board, sent to the back, and the view moves to it with the draw tool selected. The
  `problem` prompt part tells the model which frame is current. Tutor marks treat a frame
  as only its header and stay inside its work area when there is room.
- [x] Hint, Check, Explain, and Wait-what buttons (`client/components/TutorButtons.tsx`).
  Each press sets the turn's intent and the hint count, sent as the `tutorTurn` prompt part.
- [x] Tutor marks as actions (`client/actions/{Hint,MarkError,Verdict}ActionUtil.ts`):
  `hint` (violet note plus an arrow bound to the student shape), `mark-error` (red ellipse
  around the shape plus a slip/misconception label), and `verdict` (check-box or x-box
  stamp). The client places each mark with `shared/tutor/placeBeside.ts` so it overlaps no
  existing shape, then locks it. Built on tldraw's own note, geo, and text shapes for now;
  custom HintCard and VerdictStamp shapes can replace them later without changing the
  action schemas.
- [x] Tutor ink tagging: every tutor shape, including `create` and `pen` output, carries
  `meta.author = 'tutor'` and a `meta.note` starting with "tutor", which the model sees in
  its shape list.
- [x] MathShape (KaTeX) and locking `create` and `pen` output too, 2026-11-02. `write-math`
  typesets one formula in tutor ink beside its anchor (`client/shapes/MathShapeUtil.tsx`,
  sized from the rendered KaTeX). `create` and `pen` output is locked once drawn. The kit
  used to unlock every shape it made when a turn ended, so the earlier tutor marks were not
  really locked; `AgentLintManager.unlockCreatedShapes` now skips tutor shapes.
- [x] Pedagogy system prompt from `pedagogy-spec` (`worker/prompt/sections/tutor-section.ts`),
  static so it stays cached. A test checks every in-scope rule id appears in it.
- [x] Tutor can only add to the board: the working mode drops every action that moves,
  edits, or deletes shapes (C1), and the client already skips actions outside the mode.
- [x] SDK swap and per-intent effort, 2026-11-02. Claude calls go through the official
  `@anthropic-ai/sdk` (`worker/do/AgentService.ts`, request shape in
  `worker/do/anthropicRequest.ts`): adaptive thinking, `output_config.effort` of `low` for
  Hint and `medium` for Explain, Check, and Wait-what, a cache breakpoint on the system
  prompt, server-side fallbacks on Opus and Sonnet 5.5, refusal checks, and a `[usage]` log
  line per turn. OpenAI and Google models stay on the Vercel AI SDK.
- [x] First real model run, 2026-11-01, through the dev-only Claude Code bridge
  (`npm run bridge`, no API key). On a Bayes problem with a planted error (P(B) missing the
  not-A branch), Check gave an `incorrect` verdict, put a misconception mark on the right
  line, and asked one guiding question without giving the answer. Two findings: the model
  first omitted `shapeId` on `mark-error` (the schema description now says it's required),
  and earlier `[THOUGHT]` text pasted back into a user turn gets refused as reasoning
  extraction (the bridge drops it).
- [x] Eval harness and seed cases, 2026-11-01 (`npm run eval`, `evals/`). Five
  probability cases: Bayes missing a branch (Check and Hint), correct Bayes work (Check),
  a die-expectation slip that carries into a later line (Check), and a concept question
  (Explain). The checks cover verdict, earliest error with slip or misconception, one
  hint rung with its anchor, the question budget, the mark budget, and no answer leaks.
  The first run found the tutor asking two questions per turn (one in the error label,
  one in chat). The prompt now counts Q1 across everything the student sees and makes
  error labels statements; after that, 50/50 checks passed over two runs of each case
  through the bridge.
- [x] More cases, 2026-11-02: a D1 full-solution request, Wait-what after a formula-only
  explanation, a second Hint press with the first hint in the chat history, a Check on
  handwritten work read from a screenshot whose last digit could be a 3 or an 8 (C3), and a
  review started from the review queue. The harness now takes `history`, `screenshot`
  (`evals/fixtures/`), `reviewConcept`, `required` content, and a list of allowed verdicts,
  and rejects bare-number problem titles. Through the bridge, 141/142 checks passed over two
  runs of all 13 cases; the one failure was a second question in a hint's `intent` on
  posed-problem-hint.
- [x] General math, 2026-11-02 (§8 #1). The tutor prompt, the `pose-problem` description,
  and the `/verify` prompt no longer name probability, and the Wait-what representation
  list gained graphs and worked numeric examples. Six non-probability cases: an algebra
  sign slip (Check), a product-rule misconception (Check), a Pythagorean hint, a correct
  determinant (Check), a derivative Explain, and a Quiz me whose learner record holds only
  algebra concepts (checked with a new `posesConceptIn` expectation). Through the bridge,
  206/206 checks passed over two runs of all 19 cases.
- [ ] The judged MRBench rubric, long-session replays, and a handwriting case the model
  actually misreads (on the fixture it read 0.63 both times).
- Done when: in a probability problem with a planted error, Check points at the right line,
  and Hint gives exactly one rung without leaking the answer.

**Phase 2: evidence and quizzes.**

- [x] Quiz me button and grading (M4), 2026-11-02. Quiz me asks for exactly one
  `pose-problem`, with the concept chosen from the learner's record (a due review first,
  then a concept only seen or solved with help). `pose-problem` now carries a kebab-case
  `concept`. The frame keeps its state in `meta` (`client/tutor/problemState.ts`): problem
  id, concept, open/solved/flawed, hint rungs opened, incorrect checks, and the check
  status. Check on an open problem grades the attempt in the frame's work area; a correct
  verdict marks it solved. A badge on the frame shows the check status.
- [x] `/verify` answer checks (V1, V2), 2026-11-02 (`worker/verify/verifyProblem.ts`,
  `worker/routes/verify.ts`). Posing a problem fires a background check: Opus 5.5 at
  `high` effort with `code_execution_20260521` and a JSON-schema `output_config.format`
  (status, answer, method, issue), resuming `pause_turn`. The answer is stored in the
  learner's Durable Object and attached to the `problem` prompt part by the worker, so the
  client never receives it. A flawed problem shows "won't count against you" on the frame,
  the tutor says the question was at fault, and it records no evidence. Through the dev
  bridge there is no sandbox, so checks report `checkedWithCode: false` and the tutor is
  told to recheck.
- [x] Evidence log (L1 to L4), 2026-11-02. `LearnerDurableObject` (SQLite, one per
  anonymous browser id until accounts, §8 #2) stores evidence records; the level is
  decided in `shared/tutor/evidence.ts`, never by the model. Any hint or earlier wrong
  check makes a solve assisted; a clean solve is independent, or retained when a clean
  solve of the same concept on another problem is at least a day old. Explain and
  Wait-what on a posed problem record exposure. Review dates follow 1, 3, 7, 21 days. The
  worker attaches a per-concept summary to each turn (the `learner` part), and a Progress
  panel at the top of the chat lists it.
- [x] Review queue, 2026-11-02 (`client/components/ReviewQueue.tsx`). When a review is due,
  a card above the tutor buttons offers the most overdue concept, with a count of the
  others. **Review now** is a Quiz me turn with `reviewConcept` in the `tutorTurn` part:
  the turn text asks for a new problem on exactly that concept, and the client files the
  frame under it whatever slug the model writes, so a clean solve counts as retained (L4).
  **Later** hides it for the page visit; it also hides while the tutor works and while
  that concept's problem is open. Problem titles now name the problem ("Spam emails with
  the word free") instead of "Problem 3".
- [ ] A session history page.
- [ ] Auth and a rate limit on `/verify` and `/evidence` before any deploy: the learner id
  is an unauthenticated browser UUID, and `/verify` spends API money per call.

**Phase 3: feel.**

- Tutor presence cursor and stroke animation, the transcription chip, the representation
  library, and opt-in proactive watching with triage.

**Phase 4: materials.**

- PDF ingest (`tutor-setup`): uploaded class materials become problem frames with page
  citations (§10), a `teach` plan drawn as a concept graph, and Grill mode. The Canvas API
  route is parked (§10.8).

**Phase 5: stretch.**

- Voice: talk while drawing.
- Multiplayer via `@tldraw/sync`, with a human TA and the AI on the same board.
- iPad and Apple Pencil polish.

## 6. Evals (built alongside Phase 1, not after)

The tutor is only as good as its behavior on hard cases. Build a fixture set of canvas
snapshots (tldraw JSON + PNG) of student work with known properties. Score each tutor turn's
action stream with deterministic checks, plus an LLM judge where judgment is needed:

- **No answer leak** in problem mode: the final numeric answer must not appear on any hint
  rung below 5.
- **Earliest error:** the verdict arrow targets the first wrong line, not a later
  consequence.
- **Question budget:** at most one question per turn, and zero in concept mode.
- **No overwrite:** no tutor shape overlaps student ink bounds.
- **Misread safety:** on ambiguous handwriting the tutor transcribes before judging.
- **Honest evidence:** an assisted solve is never logged as independent.

Seed cases can come from DATA 21100 homework and midterm practice (conditional probability,
Bayes, counting, expectation) and from published tutoring datasets (§7.3).

## 7. Skills, tooling, research

Researched 2026-11-01. Every skill below uses the SKILL.md format, so it works in Claude
Code and in Codex (Codex reads `.agents/skills`, which links to `.claude/skills`).

### 7.1 Project skills (ours, in `.claude/skills/`)

Written now, because they don't depend on code:

| Skill | Purpose |
| --- | --- |
| `pedagogy-spec` | The tutor's behavioral contract, compiled from `pedagogy/source-skills/` plus LearnLM and MRBench terms. It is the single source that the system prompt and the evals both cite. |
| `tldraw-dev` | How to work with the tldraw 5.x SDK and the agent kit: where the docs live (llms.txt slices), extension points, the license, and version pinning. |
| `anthropic-backend` | Project conventions for Claude calls: models, effort, caching layout, code-execution verification, fallbacks, and cost limits. It defers SDK details to the built-in `claude-api` skill. |
| `tutor-eval` | Design and rubric for the behavior eval harness: MRBench dimensions plus our rules. How to add a case, and what has to pass before a prompt change merges. |

Written once the code they describe exists (Phase 1–3):

| Skill | Purpose |
| --- | --- |
| `canvas-actions` | The action contract: shape format (modeled on tldraw mcp-app's MIT `focused` format), tutor ink conventions, never touching student ink. |
| `canvas-context-capture` | How a student turn is serialized: diff since last turn, crop, shape JSON, recognition output. Also the trigger rules. |
| `canvas-e2e` | Playwright for tldraw: synthesize pen strokes with pointer events, assert on the editor store rather than on pixels. |
| `handwriting-recognition` | The `recognize()` interface, the Claude-vision and Mathpix adapters, and ink fixtures with expected LaTeX. |
| `student-model-state` | Evidence ledger schema and update rules (exposure, assisted, independent, retained). |
| `tutor-prompt-change` | Checklist for editing the prompt or schemas: bump the spec version, run evals, compare to baseline. |

### 7.2 Third-party skills and MCP to install in Phase 0

- **anthropics/skills** (Apache-2.0): `webapp-testing` (Playwright + dev-server helper) and
  `frontend-design`. `skill-creator` and `claude-api` are already available globally.
- **tldraw `tldraw-migrate`** from `https://tldraw.dev/.well-known/agent-skills/index.json`,
  for SDK upgrades. tldraw's own repo skills (`write-e2e-tests`, `write-example`) are under
  the tldraw license: read them for patterns, don't copy them.
- **One methodology pack, not both:** obra/superpowers (brainstorming, writing-plans, TDD,
  systematic-debugging, verification-before-completion) *or* mattpocock/skills (tdd,
  to-spec, to-tickets, diagnosing-bugs). Both are MIT and work in Claude Code and Codex.
  Pocock's `teach`, `grill-me`, and `wait-what` share names with our pedagogy sources, so if
  we pick Pocock, install selectively.
- **cloudflare/skills** (Apache-2.0): `durable-objects`, `wrangler`, and
  `workers-best-practices`, if we stay on Workers.
- **OpenAI curated `playwright`** for Codex parity (Apache-2.0).
- **MCP:** Playwright MCP (drive the canvas), Chrome DevTools MCP (debug streaming and
  performance), Context7 (`/tldraw/tldraw` lags at v4.2, so prefer `tldraw.dev/llms-*.txt`),
  and the **tldraw MCP app**, whose `exec` against a live canvas is useful for prototyping
  actions. **canvas-mcp** (vishalsachdev/canvas-mcp, MIT) needs a Canvas access token, which
  the user's school doesn't allow, so it is parked with the Canvas API route (§10.8).

### 7.3 Research that becomes rules or evals

- **MRBench** (arXiv 2412.09416, data CC BY-SA). Eight tutor dimensions: mistake
  identification, mistake location, answer revealing, guidance, actionability, coherence,
  tone, human-likeness. This is our eval rubric. Caution: LLM judges correlate poorly with
  human ratings, so calibrate against a small hand-labeled set.
- **Bastani et al., PNAS 2025.** An unguarded GPT tutor *lowered* later exam scores by 17%,
  and teacher-designed hints removed the harm. This supports a hard no-leak rule.
- **Tutor CoPilot RCT** (arXiv 2410.03017). More guiding questions and fewer giveaways gave
  +4 percentage points mastery.
- **LearnLM** (arXiv 2412.16429). Rubric dimensions: cognitive load, active learning,
  metacognition, curiosity, adaptivity. Watch for the anti-sycophancy overcorrection
  (failing to praise real wins).
- **MathTutorBench** (arXiv 2502.18940). Strong solvers aren't automatically good tutors,
  and quality decays over long dialogues. Test long sessions.
- **MathDial / Bridge.** Student-error dialogues and expert remediation choices (error type
  → strategy → intent). These are a natural seed for hint-ladder cases. Check dataset
  licenses before vendoring.
- **Pedagogical steering** (arXiv 2410.03781). Tutoring as a state machine, not one prompt.
  This matches our explicit mode and ladder state.
- **Khanmigo learnings.** Guardrail metric for early giveaway, avoid repetitive quizzing,
  rubric scoring.

### 7.4 Handwriting recognition

Start with Claude vision on a hi-res crop plus shape JSON, behind a `recognize()` interface.
If evals show symbol errors, add **Mathpix `v3/strokes`**. It accepts tldraw stroke points
directly and returns LaTeX, is free up to 1K sessions, then about $0.01 per session.
MyScript iink is strong but commercial. Open-source options (TexTeller, pix2tex) need Python
hosting.

## 8. Open decisions (yours)

1. **Subject scope.** Decided 2026-11-02: a general-purpose tutor that starts with math,
   not probability only. Other subjects come after math works. Probability stays the best
   tested topic, since the materials, misconceptions, and seed evals are there. Done
   2026-11-02: the probability wording is out of the tutor prompt, the `pose-problem`
   description, and the `/verify` prompt, and six non-probability math cases are in (§5).
   In `pedagogy-spec` only the M6 representation list changed.
2. **Audience.** Just you and classmates (hobby license, simple auth), or a product for
   others (commercial license, accounts, privacy)?
3. **Second model for triage.** Haiku 5.5 for "should I intervene?", or Opus 5.5 at low
   effort for everything?
4. **Input device.** Laptop trackpad and mouse, or iPad with Apple Pencil as the primary
   target? This changes stroke-pause heuristics and layout.
5. **Voice in v1?** It's a large scope jump. The recommendation is Phase 5.
6. **Hosting.** Cloudflare (the kit's default, Durable Objects fit per-student state) or
   something else?
7. **Canvas access.** Decided 2026-11-02: manual uploads of PDFs and text, not the Canvas
   API. New Access Token is disabled on the user's Canvas (the old step C0), so the token
   route is closed and the app never touches Canvas (§10.1). The API design is parked in
   §10.8. Still open and optional: ask the school whether it issues tokens on request.
8. **Graded work in uploads.** The app can't tell whether an upload is open graded work.
   Treat it like any problem (recommended), or cap help on it (§10.6)?

## 9. Risks

- **Misreading handwriting** leads to wrong grading. Mitigations: the transcription chip, a
  hi-res crop prompt part, and never marking ✗ on low-confidence reads.
- **Latency.** A screenshot plus thinking can take seconds. Mitigations: low effort on
  hint turns, streaming the presence cursor early, prompt caching, and crop instead of full
  board.
- **Clutter.** The tutor can over-annotate. Mitigations: a one-mark-per-turn budget in
  problem mode, and collapsible cards.
- **Answer leakage and over-helping.** Covered by the evals in §6 and the hint ladder's
  one-rung rule.
- **tldraw license** blocks a public launch if it isn't sorted.
- **Prior art.** Small open-source projects already pair tldraw with AI tutoring:
  harjothkhara/whiteboard-tutor (built on the agent kit), abdulhamid-n/AI-notebook
  (Mathpix OCR), and SohailElskhawy/ai-live-tutor. Skim them in Phase 0 for pitfalls. The
  differentiator here is the pedagogy, the evidence model, and the evals.
- **Uploaded class materials** (§10). Problem sets and notes can print instructor answer
  keys, belong to the instructor or publisher, and cost money to read (about 1,500–3,000
  tokens a page). Mitigations: solution text kept on the worker side, the PDF held in memory
  and never stored, size and page caps, a per-learner upload cap, and a rate limit on
  `/ingest`.

## 10. Class materials from uploads (draft)

Drafted 2026-11-02 as a Canvas API integration, then rewritten the same day as an upload
path after step C0 failed (10.1). Not started.

The student downloads their class materials from Canvas, or anywhere else, and gives them to
the tutor: problem sets, lecture notes, and slides saved as PDF. The tutor extracts the
problems and poses each one in a frame on the board, with a citation back to the source page.
This is the Phase 4 `tutor-setup` path (§2). The app never talks to Canvas, so it holds no
Canvas credentials.

### 10.1 Why uploads (decided 2026-11-02)

The first draft had the worker read the course through the Canvas REST API with a personal
access token. Step C0 found that New Access Token is disabled on the user's Canvas. Schools
turn it off on purpose (UW–Madison did from November 2025 and now issues tokens on request),
and the Canvas docs say an app with more than one user needs OAuth2 and a developer key from
the institution's admin. So the token route is closed unless the school opens it, and the
plan doesn't work around the block.

Uploads need nobody's permission, work for any course or LMS, and cover the part that
matters: problems from the student's own materials. They give up live browsing of modules
and the syllabus, and automatic due dates. The Canvas API design is kept in 10.8 in case a
token ever becomes available.

### 10.2 Scope

- **In:** PDFs (standard, no password or encryption) and plain text (`.txt`, `.md`, or pasted
  text). A Canvas page can be saved with the browser's Print to PDF. That also turns
  equation-editor images into page pixels, which the model reads by vision, so nothing here
  depends on how Canvas stores equations in its HTML.
- **Out for v1:** `.docx`, `.pptx`, and `.xlsx` (the PDF docs say document blocks don't
  accept them, so save as PDF first), password-protected PDFs, any file fetched from a URL
  (the worker never fetches an address the student supplies), and any account credentials.

### 10.3 Intake, limits, and storage

- **Route.** `POST /ingest` takes one file from the client. The worker sends the PDF inline
  as a base64 `document` block in a single extraction call and drops it when the call ends.
  The Files API is for PDFs reused across calls, and v1 makes one call per upload.
- **API limits** (PDF docs, read 2026-11-02): 128 MB per request on the first-party API, 600
  pages per request (100 when the request's context window is under 1M tokens), and no
  passwords or encryption. Each page costs about 1,500–3,000 text tokens plus the page image.
- **Proposed v1 caps** (our choices, not API limits): 20 MB and 40 pages per upload, and a
  small daily upload cap per learner. Forty pages is roughly $0.25–$0.50 in text tokens at
  Opus 5.5's $4 per MTok of input, before the images, so the cap matters. The page count has
  to come from a parser that runs in Workers, chosen in U2. The byte cap is enforced first.
- **Money and auth.** `/ingest` spends API money per call like `/verify`, so it sits behind
  the same open Phase 2 item: auth and a rate limit before any deploy.
- **Storage.** The LearnerDO keeps the upload's title and, per problem, the statement, a
  source label with the page, a concept guess, and any solution the document printed. The PDF
  itself is never stored. Printed solutions stay in the worker next to checked answers (the
  `problems` table) and the client never receives them. Each upload can be deleted from the
  panel, which removes its problems and solutions. Uploads belong to one learner and are
  never shared.
- **Copyright.** Course materials usually belong to the instructor or the publisher. The
  design keeps only extracted problem text, per learner, and deletable. Whether that is
  acceptable beyond you and your classmates is a question for the school, not the code
  (§8 #2).

### 10.4 Pieces

- `worker/routes/ingest.ts` and `worker/ingest/extractProblems.ts`: validate the type, size,
  and page count, make the extraction call, and return problems without their solutions.
- The extraction call: Opus 5.5, `medium` effort, JSON-schema output. It never solves a
  problem. Per problem it returns the statement (math as `$...$`, so it goes through the
  KaTeX path), the page, a kebab-case concept guess, and any printed solution, separately.
  A problem that depends on a figure or on earlier parts is either returned with the figure
  described or skipped and counted. U1 decides which works better.
- LearnerDO: an `uploads` table and an `upload_problems` table next to `problems`. When a
  problem is posed it gets a `/verify` check like a quiz problem, and the checked answer
  lands in `problems`.
- `shared/`: the types for the route's response.
- Client: `client/components/MaterialsPanel.tsx` with a file picker, progress, each upload's
  problem list with a Pose button, and a Delete button. Posing uses the existing
  `pose-problem` path, and the frame meta carries a `source` that shows as a small citation
  label.

### 10.5 Posing imported problems

- Each problem goes through `pose-problem`, so it is a normal locked frame with hints, Check,
  and evidence. Instructor problems can have typos or missing context. A problem the check
  finds flawed is marked as the question's fault and doesn't count against the student.
- **Solution secrecy.** Problem sets and notes often print worked solutions or an answer
  key. The extraction call returns them separately, and the worker keeps them with the
  verified answer. The statements sent to the client must not contain them.
- **Page labels.** The model's page numbers aren't guaranteed to be right, and nobody has
  checked them yet. The SDK's PDF citations return a `page_location`, which is the fallback
  if U1 shows the labels drift.
- Uploads never create evidence. Levels stay decided in `shared/tutor/evidence.ts`.

### 10.6 Graded work (your call, §8 #8)

An upload can be open graded work, and the app can't tell on its own. Two options:

- **A. Same rules as any problem.** The hint ladder applies, and an explicit full-solution
  request still gets the solution (D1). No new code.
- **B. Cap help on open graded work.** The extractor flags a document with signs of it (a
  future due date, points, "submit"), and for those the tutor stops short of the full worked
  solution and says why. This needs the flag in the extraction schema and a carve-out to D1 in
  `pedagogy-spec`.

Recommended for v1: A, and store the flag now so B stays cheap.

### 10.7 Steps

- [ ] **U0.** Download two or three real files you'd study from (a problem set, lecture notes,
  slides saved as PDF). Note their page counts and sizes. Don't commit them: they may be
  copyrighted and can carry names. Optional, in parallel: ask your instructor or Canvas admin
  whether the school issues tokens on request (10.8).
- [ ] **U1.** Extraction spike on the U0 files: the schema, page-label accuracy, and how
  figure-dependent problems come out. The dev bridge folds the conversation into one text
  turn and probably can't pass document blocks (check), so this needs a real API key and a
  small budget you've approved. Write synthetic fixtures from the real response shapes and
  commit only those.
- [ ] **U2.** The `/ingest` route and its limits, with vitest tests on a mocked SDK: oversized,
  non-PDF, and encrypted files rejected, solutions never in the response, the per-learner
  cap, and the page-count parser choice.
- [ ] **U3.** LearnerDO tables, the materials panel, and Delete.
- [ ] **U4.** Pose imported problems through `pose-problem` and `/verify` with a citation.
  Eval cases: a page with inline solutions (no leak), an instructor problem with a flaw,
  extraction counts and page citations, and math from equation images.
- [ ] **U5.** Optional: page images as locked backgrounds (the original `tutor-setup`
  idea), rendered in the browser, and Quiz me drawing from uploaded material. Check that the
  renderer works under Vite and Workers first.
- Done when: uploading a PDF problem set poses its problems in frames with page citations,
  the printed answers never reach the client, and `/ingest` rejects oversized, non-PDF, and
  encrypted files.

### 10.8 Parked: the Canvas API route

Revive it only if the school issues a token. The design, kept so the research isn't lost:

- **Client.** A thin GET-only client in the worker (`worker/canvas/canvasClient.ts`) with a
  fixed allowlist of path patterns: courses, the syllabus (`include[]=syllabus_body`), modules
  and items, pages, files, and assignment descriptions and due dates. It throws on any other
  method or path, and a test fails if one gets through. Out of scope: grades, submissions,
  quiz answers, discussions, other users, and every write.
- **Token.** Kept in the browser's `sessionStorage`, sent per request, and never stored or
  logged by the worker. The base URL is a deployment setting, https only, never from the
  client.
- **Canvas behavior** (checked against the docs): a throttled request gets 429,
  `X-Rate-Limit-Remaining` appears only when throttling applies, pagination follows opaque
  `Link rel="next"` URLs with a default page size of 10, a page's `body` is HTML, and an
  assignment's `bucket` accepts upcoming, past, overdue, undated, ungraded, unsubmitted, and
  future. Not checked: whether a file's download `url` expires or needs auth, and whether
  equation images carry LaTeX in `data-equation-content`.
- **Reuse.** What the client fetches would feed the same `/ingest` extraction and posing
  path, so the upload work isn't thrown away.
- **canvas-mcp** (vishalsachdev/canvas-mcp, MIT, Python) needs the same token, so it is no
  use for exploring a course until one exists. If the tutor ever has to decide mid-turn what
  to fetch, the route is the Messages API MCP connector (SDK 1.3.0, `mcp_servers` and
  `mcp_toolset`, beta `mcp-client-2026-09-15`) with canvas-mcp self-hosted over HTTP
  (read-only unless `ALLOWED_WRITE_TOOLS` is set), a toolset allowlist, and
  `ENABLE_DATA_ANONYMIZATION`. The dev bridge can't test it (`--strict-mcp-config`).
- **Calendar feed.** Canvas gives students a private `.ics` URL with assignment titles and due
  dates and no materials, going by third-party guides, not Instructure's docs. It could feed
  the `learner` part so Quiz me leans toward what is due soon. Not planned. The URL works
  like a password.
