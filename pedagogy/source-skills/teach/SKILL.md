---
name: teach
description: Plan and deliver multi-session DATA 21100 learning with focused lessons, prerequisite checks, retrieval practice, and spaced review. Use for a study plan or sustained learning goal, rather than a single math explanation.
license: MIT
---

# Sustained course learning

Adapted from Matt Pocock's teach workflow, with DeepTutor-inspired separation of
coverage and demonstrated learning. Read `CLAUDE.md`, relevant shared memory,
and the selected course sources. Use `academic-tutor` only if mode routing is needed.

## Choose the next useful objective

Use the learner's stated goal and time budget. Infer what can be established from
the course materials; ask briefly about deadlines or constraints only when they
would change the plan. Do not invent an exam date or repeat an intake already done.

For a plan, identify observable abilities, order their prerequisites, and map each
to a relevant lecture page or textbook section. Include a realistic next action
and optional enrichment. When exam scope is unknown, mark that uncertainty.
Save a requested plan under `StudyVault/plans/` and link it from the dashboard.

For a lesson, target one useful ability at the learner's current level. Start with
intuition and a small worked example, then formalize the rule and assumptions.
Use the learner's request to decide when to move into practice. Plain Markdown
and chat suffice; create HTML, interactive tools, or a PDF when they add value or
the user requests them. Reuse existing study artifacts where suitable.

## Make practice informative

Use recall, an explanation in the learner's own words, or a changed-context
problem. Mix related methods after the learner has the prerequisites to choose
between them. Distinguish fluent recognition from independent performance.
If practice fails, identify the missing concept and adjust the explanation.

Offer spaced review after demonstrated independent success. A useful starting
schedule is 1, 3, 7, and 21 days, adjusted to evidence and the learner's deadline.
These are proposed review dates, not a validated optimal schedule or automatic
reminders. Create a scheduled reminder only when the user asks for one.

## Preserve continuity

Record durable preferences, objectives, observed performance, assistance, and
next-review dates through the shared-memory bridge. Mark exposure and assisted
practice honestly; a generated lesson does not demonstrate learner mastery.
Keep StudyVault for source-grounded learning artifacts. Use the bridge for the
learning record instead of creating `MISSION.md`, `NOTES.md`, or parallel score logs.

End a planning request with a concrete plan. End a teaching exchange at a useful
boundary; sustained learning does not require a question after every explanation.
