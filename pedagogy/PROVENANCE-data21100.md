# Tutoring skills: research and integration

Researched and installed on 2026-10-16. This project uses seven local skills,
shared by Claude Code and Codex through the existing `.agents/skills` symlink to
`../.claude/skills`. The setup adds instructions and Markdown learning artifacts;
it does not install background services or upload course materials.

## Sources and choices

| Source reviewed | Adopted here | Decision |
| --- | --- | --- |
| [Academic Tutor listing](https://mcpmarket.com/tools/skills/academic-tutor) | `academic-tutor` | Original course router informed by the listing's guided-learning approach. No verbatim installation: the listing does not establish a reusable upstream license. Omitted its unrelated topic bans and mandatory question endings. |
| [Matt Pocock productivity skills](https://github.com/mattpocock/skills/tree/49dd158d1076134a641b33efb035946536778336/skills/productivity) | `teach`, `grill-me`, `wait-what` | Adapted focused lessons, retrieval, and clearer explanations. Replaced mandatory HTML and multiple-question design interviews with course-appropriate outputs. |
| [bevibing/tutor-skills](https://github.com/bevibing/tutor-skills/tree/397110c9fefbc6bd5444277686600aec28063c05) | `tutor-setup`, `tutor` | Rewrote the document-vault and quiz workflows for this repo. Preserved source mapping and concept-level diagnosis; removed dependency on unavailable `AskUserQuestion` calls, fixed four-question rounds, a required pre-existing vault, and a parallel learner database. |
| [cdmorozov/claude-tutors](https://github.com/cdmorozov/claude-tutors/tree/0a76e25d99de25c8f925974f26a8df1da8a33865) | `math-tutor` | Installed the complete math skill and its two references at a pinned revision, adding a project-integration paragraph. Its explain/practice/review distinction fits probability coursework. |
| [HKUDS/DeepTutor](https://github.com/HKUDS/DeepTutor/tree/6cf793bd868ba5ecbe64722936d4be8fab5a01df) | Design input to `academic-tutor`, `teach`, `tutor` | Studied its mastery and course-study prompts. Adopted source grounding, prerequisite-aware objectives, assistance-aware evidence, and invalid-question correction as ideas. No DeepTutor code, prompt text, CLI, service, or engine tools were installed. |

DeepTutor's [mastery prompt](https://github.com/HKUDS/DeepTutor/blob/6cf793bd868ba5ecbe64722936d4be8fab5a01df/deeptutor/capabilities/mastery/prompts/en/mastery_loop.yaml)
was especially useful for distinguishing explanation from evidence of learning.
Its runtime owns mastery gates and scheduling; this Markdown setup does not
claim those engine capabilities. Review dates here are recorded suggestions.

Additional online candidates reviewed:

- [adityakumar68/claude-study-skills](https://github.com/adityakumar68/claude-study-skills):
  useful examples of lecture-to-topic maps, explicit depth targets, and delayed
  review. Not installed: its separate study-state files would duplicate this
  project's shared memory, and its always-questioning default is unsuitable for
  direct explanation requests.
- [bstellato/ai-teaching-skills](https://github.com/bstellato/ai-teaching-skills):
  a useful optional direction for learning by teaching a novice. Not installed
  because the selected skills already support explanation-back and guided study.

The remainder of Matt's productivity directory was inspected. `handoff` overlaps
the bridge's continuity workflow; `to-questionnaire` targets async stakeholder
decisions; `writing-for-agents` targets agent-document authoring; `grilling` is a
design interview underlying `grill-me`. These were not installed as additional
course skills. The general and programming tutors were also omitted to avoid
overlapping routing in a probability-focused project.

## Project behavior

- `academic-tutor` routes mixed sessions; specialist descriptions distinguish
  one-off math help, testing, artifact setup, and sustained learning.
- The learner's current request controls the output: explanations are direct,
  guided practice uses one useful hint at a time, and requested complete
  solutions or reviews are delivered directly.
- Course notes and exact problem statements define notation and known scope.
  Textbooks clarify and verify. Generated prep and existing solutions require
  checking. A filename alone is not content evidence.
- PDF text extraction is useful, but handwriting and diagrams need visual
  inspection. Inventory setup did not re-read or summarize the course PDFs.
- Shared memory is the sole durable learner-state store. StudyVault contains
  learning artifacts and source mappings, without replicated scores or dates.
- A generated lesson, one correct answer, or success after a hint does not
  automatically establish mastery. Unsupported assessments are corrected.

## Files, licenses, and maintenance

`skills-sources.json` records pinned upstream revisions, installed skill names,
and adaptation status. Each MIT-derived skill includes the corresponding
upstream `LICENSE`; `academic-tutor` is original integration text informed by the
listed sources. No unlicensed marketplace text was copied.

Use the skill-installer helper for a future upstream refresh into a temporary
directory, compare the pinned version and local adaptations, then merge deliberately.
Replacing these folders wholesale would lose the project integration.
Keep the `.agents/skills` symlink and canonical `.claude/skills` layout intact.

Validation for this setup: run the skill-creator `quick_validate.py` on every
skill, verify all relative Markdown links, confirm discovery through both paths,
and review routing against the examples on the dashboard. Metadata validation
does not demonstrate tutoring effectiveness; refine the skills from real sessions.

For another course project, use [CLASS-STUDY-SETUP-PLAN.md](../CLASS-STUDY-SETUP-PLAN.md).
It includes a standalone implementation path, complete subject-neutral templates,
memory selection, preservation rules, validation, and recovery procedures.
