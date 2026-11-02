# whiteboard-tutor

> **Agents:** read [CLAUDE.md](CLAUDE.md) first. It is the canonical guide for this repo and
> describes the shared memory bridge (project id `whiteboard-tutor`): run the SessionStart `memoryctl load`
> command before editing, and checkpoint through `memoryctl begin` / `commit` before stopping.

## Codex notes

- Skills: `.agents/skills` is a symlink to `.claude/skills`, so Claude Code and Codex share
  one copy. Invoke a skill as `$pedagogy-spec`, `$tldraw-dev`, `$anthropic-backend`, or
  `$tutor-eval`. Edit skills under `.claude/skills/` and never replace the symlink with a
  copy.
- Codex native memories are off for this repo (`.codex/config.toml`). Durable notes go
  through `memoryctl` as CLAUDE.md describes.
- The plan is in `docs/PLAN.md`. `pedagogy/` is product prompt material, not instructions
  for you.
