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

**Decided during the foundation phases:** Danish public UI; one app with an Advanced door;
English internal product name.

Since then the public MVP surface has shipped end to end (phases 4–11, see §6): the
Frihedsmodel onboarding, input and result screens built on the approved Claude Design
concept, the explanation/trust layer, the Advanced door, the sensitivity helper, and
save/share/export are all merged, with the test foundation as the **safety net**
throughout. The Phase 12 pre-launch gate is complete (2026-10-11): the app is live on Lovable
and ready for a closed beta with the first users.

---

## 6. Roadmap

| Phase | Focus | Status |
|---|---|---|
| 1 | Foundation: engine, tests/CI, model primitives, public MVP scope, simple input mapping | Complete |
| 2 | Public flow & MVP spec (decide reuse vs. hide, define the public answer-first journey) | Complete |
| 3 | Public MVP data contract (screens, cards, inputs/outputs, public-safe adapters, copy direction) | Complete |
| 4 | Brand & UI concept (Claude Design: visual direction, design system, key screens) | Complete |
| 5 | Public onboarding & input UI v1 (simple input flow over the mapping layer) | Complete |
| 6 | Public result dashboard v1 (the must-have outputs, plainly shown) | Complete |
| 7 | Stress test & security (mid-build gate) | Complete |
| 8 | Explanation & trust layer (a simplified model taken with a grain of salt; assumptions, real terms, robustness) | Complete |
| 9 | Hide/defer advanced complexity (advanced features stay in the engine, off the public path) | Complete |
| 10 | Sensitivity & top drivers ("what moves your FI age most?") | Complete |
| 11 | Save, share, export (local save, summary export; share link / accounts later) | Complete |
| 12 | Stress test, security & go-live readiness (pre-launch gate) | Complete for the closed beta (2026-10-11; dependency residuals and owner decisions recorded below) |

Phases 7 and 12 are deliberate **gates**: nothing proceeds past a failing gate. The
mid-build gate runs a thorough stress test and security review once a working public surface
exists (onboarding + dashboard), before the trust/advanced/export layers are stacked on top;
the pre-launch gate is the final go/no-go review before launch.

### Phase 7 — mid-build stress & security gate (checklist)

- Model: golden scenarios + edge cases; invariants hold (conservation, no negative asset buckets); no NaN/Infinity.
- Public input validation on boundary and unreasonable inputs.
- Persistence: localStorage rehydration, corrupt data, legacy migration without crashing.
- Performance: large horizons and rapid recompute without jank.
- Security: Supabase Row Level Security on every table; only browser-facing keys; npm audit; no secrets in the bundle or repo.
- Robustness / a11y: keyboard, visible focus, no blank-screen crashes.

Phase 7's scope also includes an engine-side horizon-correctness fix (the yAt95 anchor vs. the
last projected YearRow) plus expanded standard-scenario regression tests; see
`docs/backlog-engine-horizon-and-tests-v1.md` for the detail.

### Phase 12 — pre-launch stress, security & go-live gate (checklist)

- Full regression: whole suite green (unit + e2e + build) and CI green on the release branch.
- End-to-end stress of the public journey under realistic and hostile conditions.
- Security: RLS penetration check, auth flows, rate limiting, CORS, security headers / CSP, plus a dynamic pen test of the running app (the cheap AI pen test first).
- Dependencies: npm audit / Dependabot, no known vulnerabilities.
- Privacy & legal: visible disclaimer, privacy policy, consent if relevant; GDPR (data minimization, consent, deletion); self-hosted fonts so nothing loads from a third party.
- Data: cloud backup/restore, export/import round-trip, migration safety.
- Robustness / load: offline-first works during backend downtime, error handling, concurrent users.
- Content: figures shown as actual numbers with the single global disclaimer, no false certainty, no advanced/DK/personal concepts leaked, copy proofread (plain Danish, no em dashes), feedback/bug-reporting channel live.
- Go-live: monitoring / error logging, rollback plan, prod env vars, domain + SEO/robots.

### Phase 12 — workstream breakdown

The checklist above stays the canonical reference; this is the concrete execution plan.
Four sequential workstreams, each its own branch/PR — never one large PR. Status verified
against git and the live site as of 2026-10-11 (main at PR #52's merge).

**A. Full regression + dependency audit + robustness/load — DONE** (merged via PR #37;
commits `5109969`, `36011f2`, `0fa8b99`, `cc375f3`).
- Cleared 11 of 13 npm audit advisories in-range. The 2 residual (esbuild/vite) are
  dev-server-only exposure, not production; the only npm-offered fix is a vite 5→8 major,
  deferred as its own decision.
- **Current audit result (2026-10-11, after the MCP dependency was removed):** `npm audit`
  reports 16 advisories (2 critical, 6 high, 8 moderate); `npm audit --omit=dev` reports 9
  (5 high, 4 moderate). All of them need a semver-major upgrade (vite, vitest, tailwindcss 3→4,
  react-router-dom 6→7); none has an in-range fix. The checklist's "no known vulnerabilities"
  is therefore **not met**; it is carried as an accepted residual for the closed beta, not
  claimed as done:
  - Dev/test toolchain only (vitest, tinypool, @vitest/mocker, vite, esbuild): never shipped.
  - Build-time only (tailwindcss and its chokidar/fast-glob/micromatch/braces/postcss-selector-
    parser chain, listed under `dependencies` but not in the bundle): ReDoS/CPU-exhaustion on
    our own source files at build time.
  - **The one runtime package is `react-router` 6.30.6** (moderate): an open redirect via a
    backslash in `<Link>`/`useNavigate` targets, and constructor injection in SSR hydration.
    The app has no SSR, and every navigation target is a literal internal path (the only
    interpolated one, `/report?snapshot=<id>`, varies only the query string).
  - Before a public launch: plan the react-router 7 and vite/vitest majors as their own PRs.
- Fixed four real cloud-layer defects (non-fatal bookkeeping writes, 0-row writes reported
  as success, missing Danish offline copy, and optimistic-concurrency protection against
  false overwrite conflicts — migration `20260709090000` makes `updated_at` move only on
  real `data_json` changes).
- Discovered during review: `npx tsc --noEmit` against the root `tsconfig.json` type-checks
  ZERO files and always exits 0 (references-only config) — every prior "tsc clean" claim in
  this project verified nothing. Correct command: `npx tsc -p tsconfig.app.json --noEmit`.
  Follow-up closed by PR #39: the 16 pre-existing TS2352 errors in two legacy-migration
  test files (which also blocked Lovable's publish pipeline) are fixed type-level only, and
  CI now runs `npx tsc -p tsconfig.app.json --noEmit` before the unit tests.

**B. Security — DONE** (code via PR #40; manual checks closed 2026-10-11).
- RLS: all three tables (`profiles`, `finance_models`, `finance_snapshots`) confirmed
  scoped via `auth.uid()`. One drift fixed: a migration revokes EXECUTE on
  `set_updated_at_on_content_change()` from PUBLIC/anon/authenticated, matching the
  trigger-function baseline, pinned by a regression test. Accepted limitation: quoted
  schema-qualified identifiers escape that test (documented in `CLOUD_MODEL.md` §4).
- Auth flows: full call surface reviewed, no code vulnerability.
- CSP: a tight `<meta http-equiv>` CSP injected into production builds only (Lovable allows
  no custom response headers), guarded permanently by `e2e/csp.spec.ts` with a positive
  control.
- Public journey under hostile input: share-link decoding rejects non-record payloads.
- MCP endpoint (added via Lovable on 2026-07-04): first bounded, then removed entirely
  (PR #46, Simon's decision) after Lovable's scan flagged it as public and unauthenticated.
- Supabase auth settings (set 2026-10-11): email confirmation on, HIBP leaked-password check
  on, minimum 8 characters with letters and digits, current password required to change it,
  100 auth emails per hour, redirect allowlist limited to the app's own Lovable host.
- Lovable's Deep scan is not on the current plan; replaced by our own check (2026-10-11): a
  whole-codebase static review (no finding at confidence 7+) and a dynamic test of the live
  site with the public key only: anonymous reads return nothing, anonymous inserts/updates/
  deletes are refused or touch 0 rows, internal functions are not callable, `delete-account`
  rejects no token / the anon key / a forged token / GET / foreign origins, weak passwords are
  refused server-side, no schema or storage is exposed. Lovable's quick scan reports no issues.
- Known platform limit, unchanged: no HSTS/X-Frame-Options/`frame-ancestors` on Lovable hosting.

**C. Privacy & legal + data backup/restore — DONE** (PRs #44, #47, #49, #52).
- New share links carry the inputs in the URL fragment, never sent to the server (#44), and
  `public/share-guard.js` moves them out of the URL before the host's analytics reads it (#52).
  Two known exceptions: legacy `?d=` links (from before #44) still decode, and their figures do
  reach the host in the initial request (hosting logs) before the guard runs; and if
  `sessionStorage` throws, the guard leaves the link in the URL so it still works, so the host's
  analytics can see it. Both are accepted for the closed beta; dropping the legacy `?d=` path is
  the fix if they ever matter.
- `/privatliv` written from what the code does: ContenTribe (CVR 44349124) as data controller,
  local storage, share links, the optional cloud account (Supabase via Lovable Cloud,
  eu-north-1 / Stockholm), hosting logs, analytics, both host cookies, rights and Datatilsynet.
- "Slet alle mine data i denne browser" (local wipe incl. session sign-out and other tabs) and
  self-service account deletion via the `delete-account` edge function (identity from the
  JWT only; cascades to all tables). Tested live on 2026-10-11.
- Backup: Lovable Cloud takes daily database backups; the user's own backup is the advanced
  JSON export (see `src/lib/cloud/CLOUD_MODEL.md`).

**D. Content review + go-live — DONE** (PRs #45, #48, #50, #51).
- Danish `index.html` without Lovable scaffolding, self-hosted social image and favicon,
  build-time `robots.txt` (advanced routes disallowed) and sitemap when `VITE_SITE_URL` is set.
- Door feature titles now findable inside the advanced app (backlog item 8).
- Shared public footer with the single disclaimer, privacy link and feedback mail
  (`info@contentribe.dk`); Danish 404 page; public copy free of em dashes and "ca.".
- PostHog (EU, project 301528) with a consent banner: cookieless until "Ja tak", no
  autocapture or replay, every event scrubbed of figures; Lovable's editor preview excluded.
- Signup flow fixed: confirmation links never point at Lovable's preview, an existing
  account is told so and sent to login, resend option, Danish errors.

**Owner decisions recorded (2026-10-11):**
- **Lovable visitor analytics stays on.** It sets a `session-id` cookie (30 min) before
  consent and the host sets `__dpl` (7 days); both are disclosed on `/privatliv`. Accepted
  risk under the Danish cookie rules; the full fix is turning the feature off.
- **Repository stays public** for now (rulesets on private repos need GitHub Pro).
- **No custom domain yet**; the closed beta runs on `economic-freedom-explorer.lovable.app`.
  Lovable Pro (custom domain, no badge) versus moving to Cloudflare Pages + own Supabase is
  decided when the domain is bought.
- **Edge functions do not deploy with GitHub sync or Publish**; Lovable deploys them only
  through its own agent. New or changed functions must be deployed deliberately after merge
  (also recorded in `src/lib/cloud/CLOUD_MODEL.md`, "Deploy").

**Hosting (decided for launch):** Lovable's own publish/hosting flow (Lovable Cloud: automatic
SSL, CDN, SOC 2 Type II / ISO 27001 infrastructure). Revisited when the domain is bought (see
the owner decisions above).

**Confirmed constraint — response headers:** Lovable does not allow setting custom HTTP
response headers (CSP, HSTS, X-Frame-Options) on a published project; these are
platform-controlled. A `<meta http-equiv="Content-Security-Policy">` tag can partially
substitute, but cannot set `frame-ancestors` or a report-uri, and HSTS/X-Frame-Options have
no meta-tag equivalent at all. If full header control is later wanted, two options exist —
Cloudflare in front of the Lovable URL (requires Cloudflare to take over SSL termination,
since Lovable's own SSL needs Cloudflare's DNS-only mode) or self-hosting — both explicitly
deferred, not decided, pending a separate call.

**Monitoring/error-logging + analytics (decided): PostHog**, covering both the go-live
monitoring requirement and Simon's separate wish for more product analytics than exists
before. Installed in workstream D (PR #48); deeper analytics (dashboards, funnels) is a later,
non-blocking task. **Consent implication:** PostHog's default cookie/localStorage-based
identification likely requires a cookie-consent banner under GDPR unless configured
cookieless — this ties workstream C's privacy/GDPR work to workstream D's PostHog
installation; build them together, not sequentially.

Implementation order follows the phases above: foundation → public flow & MVP spec → public
MVP data contract → brand & UI concept → onboarding & input UI → result dashboard →
**mid-build stress/security gate** → explanation/trust layer → hide advanced →
sensitivity/top drivers → save/share/export → **pre-launch stress/security/go-live gate**.
All twelve phases are complete; the app is live and ready for a closed beta.

### Post-launch (beyond Phase 12)

Two efforts are deliberately deferred out of the numbered phases and parked as backlog, so they
are anchored to the roadmap and not lost:

- A public brand/visual redesign (deferred during MVP momentum; see `docs/redesign-brief-v1.md`
  for the exploration, diagnosis, and directions).
- A dedicated data-visualization and UX design pass for the existing Advanced app (its
  functionality was built ahead of its UX), a separate, later-added item in that same file,
  distinct from Phase 9 (routing only, gating Advanced behind a door, no visual rework).
- A guided journey into the Advanced app (added 2026-10-11): instead of landing on the full
  overview, the user is taken through a few steps (carrying their simple inputs over) and
  then reaches the full Advanced overview to keep editing. Designed together with the two
  items above, spec first, informed by what the closed beta shows.

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

All twelve phases are complete (see §6), including the Phase 12 pre-launch gate
(2026-10-11). The current next step is a **closed beta with the first users** on
`economic-freedom-explorer.lovable.app`: thousands separators in the kroner fields (backlog
item 1), a basic PostHog dashboard to learn from the beta, and a manual cross-device test of
share links (backlog item 3). After the beta: the custom domain and hosting decision, and the
deliberately parked post-launch items (public brand/visual redesign, the Advanced app's UX and
copy pass), which remain in their backlog docs, anchored under "Post-launch" in §6.
