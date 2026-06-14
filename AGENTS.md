# AGENTS.md

This repository is worked on by AI agents (Claude Code, Codex, and others) under a
review-before-merge workflow.

**The canonical agent guide is [`CLAUDE.md`](./CLAUDE.md).** Read it before making or
reviewing changes. It defines the working method, the guardrails, the finance/model
rules, and the run/test commands. This file exists so tools that look for `AGENTS.md`
(e.g. Codex) land on the same rule set.

## Non-negotiables (summary — full detail in CLAUDE.md)

- Never commit, push, or merge to `main` from an agent. Simon merges manually.
- One focused branch at a time; scope agreed before work begins.
- Never touch secrets/`.env`/tokens; no destructive git operations.
- Tests and `npm run build` must pass; never weaken or skip tests to go green.
- Finance/model caution: never silently change projection output; behavior changes
  need tests. Preserve the model invariants (conservation; no negative asset buckets).
- One engine — "simple" is a reduced input/output surface, never a second model.
- Keep advanced / DK-personal concepts (holding, ASK, `depotTax`, `folkepension`,
  country analysis) out of the public surface.

## For reviewers (Codex / `@claude`)

Review each PR against CLAUDE.md §3 (golden rules), §4 (model invariants), and §8
(definition of done). Flag any silent change to projection numbers, any weakened test,
and any advanced/personal concept leaking into the public path.

## Run & test

```bash
npm ci
npm test            # Vitest
npm run build
npm run test:e2e:ci # Playwright (installs Chromium + OS deps)
```
