---
name: tldraw-dev
description: Work with the tldraw 5.x SDK and tldraw agent starter kit in this repo — finding current docs, adding agent actions, prompt parts, custom shapes, store listeners, image export, and sync. Use before writing or changing any code that touches the tldraw editor, the agent kit, or canvas shapes.
---

# tldraw development

The target is `tldraw` 5.x (5.6.0 as of 2026-11-01) with React 18.2+ or 19.2+. The app
starts from the agent starter kit (`npm create tldraw@latest -- --template agent`). Pin
exact versions in `package.json`. Use the `tldraw-migrate` skill for upgrades once it's
installed.

## Get current docs, not memory

The tldraw API changed a lot across v3 → v5 (for example, draw shapes now use
delta-encoded `segments`, and text uses rich text). Check before you write:

- `https://tldraw.dev/llms.txt` is the index. Fetch a narrow slice: `llms-docs.txt`,
  `llms-examples.txt`, or `llms-releases.txt`. Avoid the 2.6 MB `llms-full.txt` unless you
  need it.
- Examples live in the tldraw repo under `apps/examples/src/examples/`. The most relevant
  ones here are `shapes/tools/keyboard-math-input` (KaTeX MathShape),
  `use-cases/education-canvas`, `use-cases/exam-marking`, `editor-api/locked-shapes`, and
  `events/store-events`.
- Context7 `/tldraw/tldraw` lags at v4.2. Verify against tldraw.dev.

## Agent kit extension points

- **Action:** add a Zod schema with a `_type` in `shared/schema/AgentActionSchemas.ts`.
  Then add `registerActionUtil(class extends AgentActionUtil)` with `applyAction`, and
  optionally `sanitizeAction` and `getInfo`. Enable it in a mode in
  `AGENT_MODE_DEFINITIONS`. Actions stream in partially, so check `action.complete` before
  doing anything irreversible.
- **Prompt part:** a client `PromptPartUtil.getPart()` plus a worker
  `PromptPartDefinition.buildContent()` with a priority.
- **System prompt:** `worker/prompt/sections/`. Tutor behavior text must come from the
  `pedagogy-spec` skill, cited by rule id.
- **Model call:** `worker/do/AgentService.ts`. Follow the `anthropic-backend` skill.

## Editor patterns

- Batch tutor writes: `editor.run(fn, { history: 'ignore', ignoreShapeLock: true })`. Tutor
  shapes are locked (`toggleLock`) and carry tutor meta. Never mutate student shapes
  (`pedagogy-spec` C1).
- Student activity: `editor.store.listen(fn, { source: 'user', scope: 'document' })`. A
  finished stroke is a draw shape whose `isComplete` turns true. Debounce for idle. There is
  no official "drawing ended" event.
- Crops for the model: `editor.toImage(shapes, { format, bounds, scale, padding })`.
- Text: `toRichText()`. Math: `client/shapes/MathShapeUtil.tsx`, adapted from the KaTeX
  example.
- Custom shapes (5.6): augment `TLGlobalShapePropsMap` in `declare module 'tldraw'`, use
  `TLShape<'type'>`, and implement `getIndicatorPath` (not `indicator`). Register them in
  `client/shapes/tutorShapeUtils.ts`, which both `App.tsx` and the chat diff viewer
  (`TldrawViewer.tsx`) use. A shape missing from the viewer crashes the chat panel.
- Implement `getText` on custom shapes: the model sees it as `text` on unknown shapes.
- The kit unlocks every shape it created when a turn ends
  (`AgentLintManager.unlockCreatedShapes`); tutor shapes are skipped there so they stay
  locked.
- Vite hot reload re-runs `registerActionUtil` and logs "already registered". Reload the
  page after editing action utils.

## License

The SDK needs a license key in production (100-day trial, a hobby license with a
watermark, or commercial). Never add code that hides the watermark or bypasses the license
check. Development and staging are fine without a key.
