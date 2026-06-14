# Product Vision — Economic Freedom Explorer

> Status: living document. This is the canonical, in-git source of the product
> direction (it supersedes any earlier PDF/plan). Companion docs:
> `docs/model-primitives-v1.md`, `docs/public-mvp-scope-v1.md`, `src/lib/finance/MODEL.md`.
>
> Internal/product name: **Economic Freedom Explorer**. Public UI brand: **Frihedsmodel**
> (Danish). Public interface language: **Danish**.

---

## 1. Vision

Economic Freedom Explorer helps people understand:

- when they may realistically become financially independent,
- what assumptions drive that result,
- which financial levers matter most,
- and how robust or fragile their plan is.

It should not feel like a complex spreadsheet. It should feel like a **guided financial
planning experience**.

Long-term direction: **one general financial engine, with multiple UI and configuration
layers on top.** The product supports both simple public users and advanced scenarios
*without splitting the model into separate systems.*

---

## 2. Core principle

**Simple on the surface, powered by a strong underlying model.**

A first-time user first meets: simple inputs, understandable outputs, clear assumptions,
practical levers, and warnings where results are fragile. Advanced features exist, but
they never dominate the first-time experience.

---

## 3. The public MVP question

The first public version answers one main question:

> *"When can I realistically become financially free, and what affects that timeline
> most?"*

The MVP guides the user through a simple flow: enter basic financial information →
generate a scenario → see the estimated FI timeline → understand the key assumptions →
adjust the most important levers → save/export/revisit later.

The journey is **answer-first**: a usable result appears before the user has tuned
anything, then invites refinement. Full detail lives in `docs/public-mvp-scope-v1.md`.

---

## 4. Product structure (decided)

- **One app, not two.** The public simple flow is the **default entry**. The existing
  advanced surface lives behind an opt-in **"Advanced" door** — same engine, same data.
- **One engine.** "Simple" is a *reduced input/output surface* over the real engine
  (`src/lib/finance/simpleInputs.ts`), enforced by tests — never a second model.
- Simon's own advanced setup is treated as a **reference case / advanced preset / stress
  test** for the model, not as a special-case system.

Generalized model primitives (income, expenses, savings, investments, pensions, tax
profiles, debt, life events, capital buckets, business/holding capital, withdrawal
strategies, country/locale assumptions) are documented in `docs/model-primitives-v1.md`.
For the public MVP, only the simplest versions are exposed.

---

## 5. Where the project is now

**Foundation is largely complete:**

- Strong, well-tested finance engine (`src/lib/finance/`) with unit + scenario tests,
  conservation invariants, multi-year checks, golden scenarios, persistence/export
  tests, and a GitHub Actions CI gate (`npm test` → build → Playwright).
- Model conceptually generalized into reusable primitives
  (`docs/model-primitives-v1.md`, merged).
- Public MVP scope defined (`docs/public-mvp-scope-v1.md`, merged).
- A typed **simple public input mapping** bridging simple inputs into the existing
  scenario model — additive, no engine change (`feat/public-simple-inputs-v1`, merged as
  PR #12).
- Repository foundation docs added: `README.md`, `CLAUDE.md`, `AGENTS.md`, this file.

**Decided this phase:** Danish public UI; one app with an Advanced door; English internal
product name.

The test foundation is now a **safety net** while the product moves toward public UX/UI.
The next phase is *not* more abstract test work unless a concrete bug or risk appears.

---

## 6. Roadmap

| Phase | Focus | Status |
|---|---|---|
| 1 | Foundation: stabilize engine, tests/CI, model primitives, public MVP scope, simple input mapping | Mostly complete |
| 2 | UI audit + public flow spec (review the live app, decide reuse vs. hide, define the public journey) | **Next** |
| 3 | Public MVP UX specification (screens, cards, inputs/outputs, copy direction) | Planned |
| 4 | Claude Design / UI concept (visual direction, after the flow is defined) | Planned |
| 5 | Public onboarding UI v1 (simple input flow over the mapping layer) | Planned |
| 6 | Public result dashboard v1 (the must-have outputs, plainly shown) | Planned |
| 7 | **Stress test & security — mid-build gate** (model edge cases & invariants, input validation, persistence/migration, performance, security/RLS) | Planned |
| 8 | Explanation & trust layer (estimates not advice, assumptions, real terms, robustness) | Planned |
| 9 | Hide/defer advanced complexity (keep advanced features in the engine, off the public path) | Planned |
| 10 | Sensitivity & top drivers ("what moves your FI age most?") | After dashboard v1 |
| 11 | Save, share, export (local save, summary export; share link / accounts later) | Planned |
| 12 | **Stress test, security & go-live readiness — pre-launch gate** (full regression, RLS pen-check, dependencies, privacy/GDPR, data backup, load/uptime, go/no-go) | Planned |

Phases 7 and 12 are deliberate **gates**: the mid-build gate runs a thorough stress test
and security review once a working public surface exists (onboarding + dashboard), before
the trust/advanced/export layers are stacked on top; the pre-launch gate is the final
go/no-go review before launch. Neither is skipped — we don't build past a failing mid-gate
or launch on a failing pre-launch gate.

### Phase 7 — mid-build stress & security gate (checklist)

- Model: run golden scenarios + edge cases (0 savings, extreme spending, very early stop age, extreme returns).
- Confirm model invariants: conservation (money never vanishes), no negative asset buckets, no NaN/Infinity in output.
- Input validation: boundary and unreasonable inputs — public inputs must not bypass important validation.
- Persistence: localStorage rehydration, corrupt data, and legacy migration without crashing (e2e already exists).
- Performance: large horizons + rapid slider changes (live recompute) without jank.
- Security: confirm Supabase Row Level Security on every table; only browser-facing keys exposed (no `service_role`); `npm audit`; no secrets in the bundle or repo.
- Robustness / a11y: keyboard, visible focus, no blank-screen crashes on any route.

### Phase 12 — pre-launch stress, security & go-live gate (checklist)

- Full regression: whole suite green (unit + e2e + build) and CI green on the release branch.
- End-to-end stress test of the whole public journey under realistic *and* hostile conditions.
- Security: RLS penetration check (can a user read/write another's data?), auth flows, rate limiting, CORS, security headers / CSP.
- Dependencies: `npm audit` / Dependabot — no known vulnerabilities in production dependencies.
- Privacy & legal: visible "not financial advice" disclaimer, privacy policy, cookie/consent if relevant; GDPR (data minimization, consent, deletion).
- Data: cloud backup/restore, export/import round-trip, migration safety.
- Robustness / load: app works during Supabase downtime (offline-first), error handling, test under concurrent users.
- Content: every number explained, no false precision, no DK/personal assumptions leaked, copy proofread.
- Go-live: monitoring / error logging, rollback plan, prod env vars, domain + SEO/robots in place.

Implementation order after the flow is clear: UI audit → public MVP flow → Claude Design
concept → onboarding UI → result dashboard → **mid-build stress/security gate** →
explanation/trust layer → hide advanced → sensitivity/top drivers → save/share/export →
**pre-launch stress/security/go-live gate**.

---

## 7. Public MVP inputs & outputs

**Required inputs (the simple form):** current age, current income, current spending,
current savings/investments, monthly savings, expected real return, target FI age/goal,
and a simple pension assumption. (Optional, later: partner/family, debt, home ownership,
detailed pension, tax profile, country/locale, life events, business income, advanced
asset buckets.)

**Primary outputs:** estimated FI age; estimated capital at FI and at key future ages;
whether the plan appears sustainable; first age financing fails; monthly/annual gap or
surplus; top risks/warnings; top levers to improve the plan.

**Secondary:** assumptions summary, capital-over-time chart, simplified cashflow,
exportable summary. **Deferred:** detailed tax tables, advanced withdrawal schedules,
account-by-account projections, country comparisons, business/holding distributions.

The exact input→model mapping is in `src/lib/finance/simpleInputs.ts` and
`docs/public-mvp-scope-v1.md`.

---

## 8. Design principles

The public UI should feel **simple, calm, trustworthy, practical, visually guided** —
not spreadsheet-heavy, not overly technical. Use cards, summaries, and progressive
disclosure; avoid exposing every underlying model field.

The user should always know: what they entered, what the model assumes, what the result
means, and what they can change next. Because financial projections create false
precision easily, the explanation/trust layer (Phase 8) is a hard requirement, not a
nice-to-have.

---

## 9. Main risks

**Product:** public UI gets too complex too early; the model gets over-simplified and
loses its strength; users mistake projections for advice; too many exact numbers create
false confidence; Simon/DK-specific assumptions leak into the public UI.

**Technical:** UI changes accidentally alter model behavior; persistence/data formats
change without documentation; tests get weakened to make builds pass; advanced engine
concepts get duplicated instead of reused; public inputs bypass important validation.

**Workflow:** too many small decisions slow implementation; too much autonomy creates
broad, unfocused changes; agents start coding before the flow is clear; stale
branches/PRs create confusion.

Mitigations are encoded in `CLAUDE.md` (guardrails + working method) and the model
invariants in `docs/model-primitives-v1.md`.

---

## 10. Working method

One focused branch at a time, scope agreed up front; the agent works autonomously inside
that scope; no changes to secrets/env, no destructive git ops, no unrelated areas; tests
and build must pass; a final report precedes the PR; Codex (and/or `@claude`) reviews;
CI must be green; **Simon merges manually.** `main` is never changed directly by an
agent. Full detail in `CLAUDE.md`.

---

## 11. Current next step

With the repository foundation in place, the next phase is **Phase 2 — UI audit + public
flow spec**: audit the current app from source, decide what is reused vs. hidden for the
public MVP, and define the public journey (and a public data contract) *before* any UI is
built. That spec becomes the input to Claude Design.
