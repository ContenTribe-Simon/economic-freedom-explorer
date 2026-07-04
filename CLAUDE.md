# CLAUDE.md — agent guide for Economic Freedom Explorer

This file is the canonical operating guide for any AI agent (Claude Code, Codex, or
other) working in this repository. Read it before making changes. It encodes the
working method, the guardrails, and the model rules that protect this project.

> Human-facing project intro lives in `README.md`. Product direction lives in
> `docs/`. This file is about **how work is done** here.

---

## 1. What this project is

**Economic Freedom Explorer** is a financial-independence / FIRE planning tool. The
public UI brand is currently **"Frihedsmodel"** and the public interface is **Danish**.

The long-term shape is: **one general financial engine, with simple and advanced
configuration layers on top** — never two parallel models. The public MVP is a
*reduced input/output surface* over the same engine the advanced app uses.

Stack: Vite + React + TypeScript + shadcn/ui (Radix) + Tailwind + Zustand
(`useFinanceStore`). Supabase is an **optional cloud overlay** — the app works 100%
offline with `localStorage` persistence. Originated as a Lovable project.

---

## 2. Where the source of truth lives

Read these before touching the relevant area. Keep them updated when behavior changes.

| Topic | File |
|---|---|
| Product vision / overall plan | `docs/product-vision.md` |
| Generalized model primitives | `docs/model-primitives-v1.md` |
| Public MVP scope (de-facto PRD) | `docs/public-mvp-scope-v1.md` |
| Finance engine flow & scenario types | `src/lib/finance/MODEL.md` |
| Cloud persistence rules | `src/lib/cloud/CLOUD_MODEL.md` |
| ASK (Aktiesparekonto) design note | `src/lib/finance/ASK_NOTE.md` |
| Simple public input mapping | `src/lib/finance/simpleInputs.ts` |

The finance engine is `src/lib/finance/` (notably `projection.ts`, `types.ts`,
`defaults.ts`, `stress.ts`, `kpis.ts`, `fire.ts`, `integrity.ts`, `sanity.ts`,
`modelValidation.ts`). Runtime state is `src/store/financeStore.ts`. Pages are in
`src/pages/`.

---

## 3. Golden rules (non-negotiable)

1. **Never commit, push, or merge to `main` from an agent.** Work on a branch.
   Simon merges manually after review. Enforcement is layered, and deliberately honest
   about its limits:
   - `.claude/settings.json` denies `git push`, `git merge`, `git reset --hard`, `rm -rf`,
     and read/write/edit of `.env*` files. These are **static, best-effort string-prefix
     patterns**, not a hard block: because they match on the command prefix, a `git`
     global option before the subcommand (e.g. `git -C . push`, `git -c user.name=x merge
     feat`) slips past them un-denied. That is an accepted limitation, not a gap to chase
     with ever more patterns.
   - The `PreToolUse` hook `.claude/hooks/block-commit-on-main.sh` is the **sole
     authoritative guard** against a `git commit` landing on `main`: it walks the command
     and denies the commit whenever the *effective* branch is `main` (directly, or after
     switching to main in the same command) — a branch-aware check the static patterns
     cannot make. There are intentionally **no** `git checkout main` / `git switch main`
     deny rules; the hook covers being on main however the session got there.
2. **One focused branch at a time, with scope agreed before work begins.** Do not
   make broad, unfocused changes across unrelated areas.
3. **Do not touch secrets, `.env` files, tokens, or run destructive git operations**
   (force-push, history rewrite, branch deletion of others' work).
4. **Tests and build must pass before a PR.** Never weaken, skip, or delete tests to
   make a build go green. If a test must change, explain why and add coverage for the
   new behavior.
5. **Finance/model caution.** Never *silently* change projection numbers. Any change
   that alters engine output requires (a) a clear explanation and (b) tests. The model
   has a large, deliberate test suite acting as a safety net — respect it.
6. **One engine.** "Simple" is a reduced input/output *surface* (see `simpleInputs.ts`),
   not a second model. Never fork or duplicate engine logic for the public path.
7. **Don't leak advanced / DK-personal concepts into the public surface.** Holding/
   business capital, ASK, `depotTax`, custom withdrawal order, `folkepension`-style
   labels, country analysis and detailed tax buckets stay behind the Advanced door.
8. **Public copy voice.** All Danish user-facing copy follows this voice (the public
   data contract, `docs/public-mvp-spec-and-data-contract-v1.md` §5, is the canonical
   reference):
   - Plain, human Danish. Sentence case, short, active voice. Name things by what the
     person controls, not by how the system works.
   - No em dashes. Use commas or full stops.
   - Avoid classic AI phrasings and filler.
   - Show the actual computed figures, formatted in Danish convention (period as
     thousands separator, whole kroner, e.g. 3.486.500 kr). Do not hedge figures with
     "ca." and do not round them into vagueness.
   - Handle model uncertainty once, globally, with a single calm disclaimer (not per
     number): "En forenklet beregning ud fra dine egne tal og antagelser. Tag tallene
     som et kvalificeret billede, ikke en garanti, og ikke som økonomisk rådgivning."
   - Honest and reassuring, never salesy or alarmist.

---

## 4. The model invariants (preserve verbatim)

These are locale-independent and must hold in any version of the model, public or
advanced (see `docs/model-primitives-v1.md`):

- **Conservation:** a deficit must reduce a bucket, drain the buffer (if allowed), or
  surface as a visible `shortfallAmount` — **money never vanishes.**
- **No negative asset buckets:** invested/cash buckets floor at 0. Only debt and net
  worth may go negative.

Scenario types (see `src/lib/finance/MODEL.md`): `base`, `linked_stress_test`
(computed dynamically via `resolveScenario(scenario, scenarios)` as *current base +
active modifiers*), and `custom`. All compute call sites resolve a scenario via
`resolveScenario(...)` before calling `project(...)`. Each `StressModifier` declares
explicit `allowedFields`.

---

## 5. How to run things

```bash
npm install            # install deps (CI uses npm ci)
npm run dev            # Vite dev server (http://localhost:8080)
npm test               # unit tests — Vitest, single run
npm run test:watch     # unit tests in watch mode
npm run build          # production build (must pass before PR)
npm run lint           # ESLint

# End-to-end (Playwright) — needs a Chromium binary the first time:
npm run test:e2e:install   # one-time: download Chromium
npm run test:e2e           # run e2e against the local dev server
npm run test:e2e:ci        # CI variant: install Chromium + OS deps, then run
```

Env: copy `.env.example` → `.env` and fill the `VITE_SUPABASE_*` values (these are
public browser-facing keys; the real security boundary is Supabase Row Level
Security). The app runs without them — cloud save/login is simply disabled.

---

## 6. CI gates

- **`.github/workflows/test.yml`** runs on PRs to `main` and pushes to `main`:
  `npm ci` → `npm test` → `npm run build` → `npm run test:e2e:ci`. All must be green.
- **`.github/workflows/claude-review.yml`** runs a Claude code review when a PR/issue
  comment contains `@claude`.
- Codex reviews PRs as well. CLAUDE.md and `AGENTS.md` describe the same rules so both
  reviewers check against the same standard.

---

## 7. Working method (PR-candidate workflow)

1. Sync `main` (`git switch main && git fetch && git pull`), confirm a clean tree.
2. Create one focused branch. Naming: `docs/<topic>-v1`, `feat/<topic>-v1`,
   `fix/<topic>`. Example: `docs/current-ui-audit-and-public-flow-v1`,
   `feat/public-mvp-onboarding-v1`.
3. Confirm scope before coding. For UI/feature work, the public MVP flow should be
   defined first (see `docs/`), so the agent isn't designing blind.
4. Work autonomously **inside that scope only**. Inspect the repo as needed.
5. Make tests + build pass. Add tests for any behavior change.
6. Commit only when the work is coherent. Do **not** push, open a PR, or merge until
   approved.
7. Provide a final report: files changed, summary of decisions, remaining open
   questions, recommended next PR.
8. Codex (and/or `@claude`) reviews the PR. CI must be green. **Simon merges.**

---

## 8. Definition of done

- **Docs-only PR:** no app code, tests, package files, workflows, config, model logic,
  persistence, or data formats changed. The document is coherent and self-contained.
- **Feature PR:** scoped to one area; unit + e2e + build green; behavior changes covered
  by tests; no advanced/DK concepts leaked into the public surface; relevant
  source-of-truth doc updated.

---

## 9. Glossary (quick)

- **FI / FIRE** — financial independence / "financially free": the earliest sustainable
  stop age.
- **First financing problem / shortfall age** — the first age the plan can't fund
  desired spending from available capital.
- **Bridge years** — after stopping work but before pensions unlock.
- **Robustness / confidence** — how fragile the plan is to worse assumptions
  (`robustnessBreakdown`).
- **Real terms** — inflation-adjusted, present-kroner values (the model's default).
