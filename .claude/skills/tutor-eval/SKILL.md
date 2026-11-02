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

## Case format (planned: `evals/cases/<id>/`)

- `board.json`: a tldraw snapshot of the student's work. `board.png` is optional.
- `case.yaml`: mode or button pressed, problem statement, known facts (correct answer,
  first wrong line's shape id, error type: slip or misconception), hint-ladder state, and
  the `pedagogy-spec` rule ids under test.
- Source: hand-built from DATA 21100 topics (conditional probability, Bayes, counting,
  expectation), adapted from MathDial or Bridge (check the license first), or produced by
  real sessions with consent.

## Deterministic checks (on the action stream)

| Check | Rule |
| --- | --- |
| Answer never appears in hint rungs H1–H4 | H, Bastani et al. |
| Verdict arrow targets the first wrong line | M3 |
| ≤1 question, and 0 in concept mode | Q1, Q2 |
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
