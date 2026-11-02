---
name: tutor-setup
description: Build or extend a DATA 21100 StudyVault from lecture PDFs, textbooks, homework, or selected source pages, with verified source links, concept notes, and practice. Use for organizing study materials rather than conducting a quiz.
license: MIT
---

# Course study vault setup

Project adaptation of bevibing/tutor-skills, focused on this course's document
workflow. Read `CLAUDE.md` and `StudyVault/Sources.md`; extend existing notes rather
than replacing them. Keep original course materials at their current paths.

## Inspect the requested material

Inventory relevant sources with `rg --files`. Work on the requested week, topic,
or page range; avoid ingesting entire textbooks to prepare a short lesson.
Treat filenames as inventory labels until their contents have been inspected.

For PDFs, use available PDF reading/extraction tools and inspect page images for
handwriting, diagrams, or uncertain formulas. Text extraction alone does not
establish what handwritten annotations say. Cite the file and PDF page, adding
printed page numbers when useful. Keep temporary extraction/render files outside
the source directories. Use an available PDF skill for substantive PDF work.

Map each concept to actual source pages. Separate taught concepts, prerequisites,
brief mentions, and enrichment; a mention does not require a full chapter.
Flag unreadable or conflicting evidence explicitly.

## Build useful notes

Use plain Markdown under `StudyVault/`, with relative links that also work in
Obsidian. Create only notes supported by the requested scope:

- `concepts/<topic>.md`: learning objective, source pages, intuition, precise
  statement and assumptions, worked example, common trap, related concepts.
- `practice/<topic>.md`: varied retrieval and application questions with checked
  solutions in a separate answer section or collapsed answer blocks.
- `plans/<topic>.md`: a requested sequence of objectives and study activities.

Generated exercises must be labeled as practice, distinct from assigned problems.
Keep existing homework solutions intact unless the user asks to edit them.
Match course notation and distinguish an illustrative example from a proof.

Link new artifacts from `StudyVault/Dashboard.md` and update source mappings in
`StudyVault/Sources.md`. Verify relative links and formulas, and verify generated
answers with an independent argument or computation where feasible. For a
requested PDF/Word output, use its document skill and inspect the final layout.

Checkpoint completed work through `memoryctl`. Store learner assessments in the
shared bridge rather than creating a second progress tracker inside the vault.
