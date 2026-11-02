---
name: tutor
description: Run DATA 21100 diagnostics, practice quizzes, weak-area drills, or mock exams from course materials. Use for explicit testing and retrieval practice rather than standalone explanations or checking a submitted solution.
license: MIT
---

# Course quiz tutor

Project adaptation of bevibing/tutor-skills. Follow `CLAUDE.md` and read the
relevant sources and shared-memory topic before selecting questions. A vault is
helpful but optional: an exact course PDF or pasted problem is sufficient.

## Start and ask

Use the topic, scope, and format already requested. For an unspecified diagnostic,
start with a short representative question from the current course material and
adjust from its answer. Historical weak areas are candidates for retesting.

Default to one question per turn and a free-response calculation, explanation, or
counterexample. Use a batch, multiple choice, or timed mock exam when requested.
Pose questions in ordinary chat; no special question-widget tool is required.
Separate the question from its answer so the learner can attempt it first.

Before presenting a question:

1. Identify the concept, prerequisites, source location, and intended difficulty.
2. Solve it independently. Check assumptions, boundary cases, and uniqueness;
   use exact enumeration or symbolic/numeric computation when it adds confidence.
3. For multiple choice, use plausible distractors based on specific errors, vary
   the correct position, and ensure exactly one correct option unless stated otherwise.
4. Keep hints and explanations out of test questions. If the learner requests a
   hint, give it and classify the subsequent answer as assisted practice.

## Grade and adapt

Wait for the learner's actual answer. Assess the reasoning as well as the result;
distinguish an arithmetic slip, an unsupported step, and a conceptual error.
Give a concise verdict, the decisive reason, and a correction when needed.
If the learner disputes the answer, recheck both the source and calculation.
Invalidate an ambiguous or incorrect question without counting it against them.

After a misconception, use a changed-context question rather than immediately
repeating the same numbers. If prerequisites are missing, briefly teach them
before continuing. Honor requests to skip, change format, or end the drill.

## Record evidence

At a natural round boundary, checkpoint through the shared-memory bridge. Record
the date, concept, source/problem, observed reasoning, result, and assistance.
Record only submitted attempts; unanswered questions are pending. Do not equate
one right answer or a small quiz percentage with mastery. Independent explanation,
transfer to a new context, and later recall provide stronger evidence.

Use one focused memory topic per learning thread, updating an existing topic when
appropriate. Keep durable scores, error history, and next-review dates there;
the StudyVault dashboard links study materials rather than duplicating those fields.
