# Public MVP Scope v1

> **Status:** documentation only. A product-direction document — it scopes a future *public*
> version of the app and proposes a sequence of PRs. It does **not** change any code or behavior.
>
> **Audience:** product + engineering.
>
> **Companion docs:** `docs/model-primitives-v1.md` (the merged model-primitives / conceptual
> model map), `src/lib/finance/MODEL.md` (internal implementation note), and
> `docs/public-mvp-spec-and-data-contract-v1.md` (the Phase 3 spec & data contract). This
> document turns those primitives into a concrete public-product scope.
>
> **Copy & figure presentation:** the canonical rule now lives in
> `docs/public-mvp-spec-and-data-contract-v1.md` §5 (mirrored in CLAUDE.md §3 rule 8) — show the
> actual computed figure in Danish format with no "ca." and no rounding into vagueness, and
> handle uncertainty once with a single global disclaimer. Where this scope doc earlier implied
> rounding/ranging headline numbers, that rule **supersedes** it; the wording below has been
> reconciled.

---

## 1. Product principle

The current app is a **high-fidelity, single-user (Simon / Denmark) FIRE engine**. It is
correct and well-tested, but it exposes the *full advanced model* immediately — holding
companies, ASK, ratepension/livrente, Danish tax buckets, custom withdrawal orders, stress
modifiers. That is the right surface for one expert user and the wrong surface for a first-time
public user.

**Principle:** the public product should give a **guided, understandable journey** that lets a
normal user get a trustworthy answer in minutes, while the **underlying model stays the same
extensible engine**. We are not building a second engine; we are building a *simpler surface*
over the existing primitives (see model-primitives §8 "Public MVP vs Advanced Mode").

Three rules follow:
- **Progressive disclosure.** Start with a handful of inputs; reveal depth only on request.
- **Explainability over precision.** Every number a user sees must be explainable in one sentence.
- **One engine, many surfaces.** "Simple" and "Advanced" are the same projection with different
  inputs exposed — never a fork of the math.

---

## 2. Public MVP user journey

The ideal first use, in practical steps:

1. **Understand what this is.** A short framing screen: *"See when you could become financially
   independent, and what's standing in the way."* Plainly states it's an estimate, not advice,
   and that all amounts are in today's money (real terms).
2. **Enter core inputs.** A single short form (see §3 must-haves): age, income, spending,
   savings, monthly saving, a basic pension figure, expected return, and a target/stop age.
   Sensible defaults pre-filled so the user can reach a result even if unsure.
3. **See current status.** Immediately: *"Are you on track?"* — a clear FI/FIRE status (on
   track / tight / not yet), plus the headline number: **earliest sustainable stop age**.
4. **Understand the projection.** A simple net-worth-over-time chart with the planned stop age
   marked, and a one-line takeaway ("Your money lasts to age X" or "runs short at age Y").
5. **See the first bottleneck.** The single most important constraint: the **first financing
   problem / shortfall age** and the **monthly gap** at that point — phrased in plain language
   ("From age 64 you'd be about 3,000 kr/month short").
6. **Adjust a few key levers.** Two or three sliders/fields (spending, monthly saving, stop
   age) with the result updating live, so the user *feels* the trade-offs.
7. **Save / export / share (optional).** Keep a scenario locally, export a JSON, or share a
   read-only summary. No account required for the basic path.

The journey is **answer-first**: a usable result appears before the user has tuned anything,
then invites refinement. Advanced depth (extra accounts, tax detail, business capital) is a
clearly separate "Advanced" door, not on the main path.

---

## 3. Required MVP inputs

The engine already accepts far more than the public MVP should ask for. The MVP collects a
minimal set and maps everything else to safe defaults.

### Must-have (the simple form)
| Input | Maps to (current model) | Notes |
|---|---|---|
| Current age | `person.currentAge` | |
| Planning horizon / life expectancy | `person.lifeExpectancy` | default ~90; one field, not a slider war |
| Current annual income | `income.salaryGross` (gross today) | the current model takes gross income; a future public input layer may accept a net-equivalent figure and map it through a locale/tax presentation layer |
| Current annual/monthly spending | `spending.desiredMonthlyNet` | real terms; the dominant lever |
| Current savings/investments | one investment account balance (`free.balance`) | "what you've invested so far" |
| Monthly/annual saving | `free.monthlyContribution` (+ optional annual extra) | |
| Basic pension | `pension.balance` + a single access age (`pension.payoutFromAge`) | one simple pension figure, not ratepension/livrente split |
| Expected real return | `assumptions.realReturn.*` — real-return assumptions held **per bucket** (`free` / `pension` / `holding`) | the MVP exposes **one** simple field and maps it onto the underlying per-bucket assumptions; sane default |
| Desired stop age / FI target | `stopAge` and/or `target.minNetWorthAtEnd` | the user's goal |

### Nice-to-have (optional, still simple)
- Cash buffer / emergency fund (`free.cashBuffer`) — off by default.
- Inflation assumption (`assumptions.inflation`) — only surfaced if we show nominal anywhere;
  the MVP should default to **real terms** and hide this.
- A part-time/bridge income for the gap years (a single simplified income stream).
- One simple "extra spending phase" (e.g. kids) as a single life-event preset.

### Advanced (hide / defer behind an "Advanced" mode)
- Multiple accounts; ASK vs ordinary depot split; depot cost-basis / realization tax.
- Holding/business capital, exit value, distributions.
- Per-track pension detail (ratepension years/tax, livrente).
- Custom withdrawal order / tax-aware withdrawal strategies.
- Debt schedules with financing sources.
- Per-assumption confidence inputs.
- Multiple/custom life events and stress modifiers.

**Rule:** the MVP form should fit on one screen. Anything that needs an explanation paragraph
to fill in correctly belongs in Advanced.

---

## 4. Required MVP outputs

The engine already computes everything below (see `KPIs` in `types.ts`); the MVP just *shows a
subset clearly*.

> **The data contract is the binding mapping; this table is orientation only.** The exact public
> output surface — which KPI fields are public-safe, which are forbidden, the horizon-relative
> anchors, and the public-safe adapters — is specified in
> `docs/public-mvp-spec-and-data-contract-v1.md` §4.2 (outputs), §4.4 (warnings + status adapter)
> and §4.5 (drivers adapter). **That contract supersedes the table below; do not implement from
> this table alone.** The rows here have been corrected to match it: the fixed-age KPIs
> `capitalAt65`/`capitalAt95` are never used as anchors, `monthlyGapAfterStop` is never the
> bottleneck gap, and `modelStatusReason` / `robustnessBreakdown` are never surfaced raw.

### Must-have (public dashboard) — binding mapping in data contract §4.2
| Output | Public-safe source (per data contract) | Plain-language framing |
|---|---|---|
| Earliest sustainable stop age | `kpis.earliestSustainableStopAge` (`null` → "not yet on track") | the earliest age you could sustainably stop (or "not yet on track") |
| Capital at planned stop age | `kpis.capitalAtStopAge`, shown only when `currentAge ≤ stopAge ≤ lifeExpectancy` (§4.2 R1 guard) | capital at your planned stop age |
| Capital at horizon-relative anchors | net worth of the **`YearRow`** at pension-access age and at the **last** projected year — **not** `capitalAt65`/`capitalAt95` (fixed-age KPIs are never anchors; end-of-horizon is the last `YearRow`) | pension-access and end-of-horizon points on the chart |
| First financing problem / shortfall age | `kpis.firstShortfallAge` (`null` → no bottleneck) | the first age the plan can't fund spending |
| Monthly gap at the first bottleneck | `shortfallAmount / 12` of the **first shortfall `YearRow`** — **not** `monthlyGapAfterStop` (that is an after-stop *average*: a different, smaller number, never the bottleneck gap) | "from age Y you're G kr/month short" |
| Status (valid / tight / not yet) | `kpis.modelStatus` via the **status→public-copy mapping** (§4.4) — never raw `modelStatusReason` | a single clear badge + one-line reason |
| Robustness / confidence score | `kpis.financialRobustness`, `kpis.assumptionConfidence` | "How solid is this plan?" with a short explainer |
| Top 3–5 drivers | the **public-safe drivers adapter** over `robustnessBreakdown` (§4.5) — never raw (e.g. the holding-dependency factor is filtered out) | "What's helping / hurting most" |
| Warnings (fragile/invalid) | the **public-safe warnings adapter** over `sanityChecks()` (§4.4) — never raw output, raw check IDs, or raw `modelStatusReason` | plain-language cautions |

### Advanced outputs (Advanced mode only)
- Full year-by-year table (`YearRow[]`), per-bucket balances, tax breakdowns, withdrawal audit.
- Share-income/ASK/depot tax detail, holding distribution audit, capital-withdrawal audit.
- Scenario comparison side-by-side, country analysis.

### Internal / debug — never public-facing
- `runModelValidation()` pass/fail report and `runIntegrityChecks()` (the `/debug/model-validation`
  route) — engineering/test tooling.
- Raw audit JSON (`buildYearAuditJson`) and internal check IDs.
- Stress-modifier internals and `allowedFields` metadata.

**Rule:** a public output must be a *number plus a sentence*. If we can only show the number,
it isn't ready for the public surface.

---

## 5. Advanced features to hide / defer

| Feature | Decision | Why |
|---|---|---|
| Holding / business capital (`holding`) | **Defer to Advanced** | Only relevant to business owners; adds exit-year/distribution complexity most users don't have. |
| ASK-specific treatment | **Hide in MVP** | Danish-specific account with its own lager tax + deposit limit; confusing without context. Folds into a generic "investment account" in MVP. |
| Custom withdrawal order / tax-aware strategies | **Defer to Advanced** | Powerful but requires understanding accounts + tax order; MVP uses a single sensible default order. |
| Detailed tax buckets (27/42 share-income, depot realization) | **Hide in MVP** | Locale-specific and intricate; MVP uses an effective-rate approximation behind a locale pack. |
| Country analysis | **Defer** | A whole second module (relocation/FIRE-by-country); out of scope for a first public answer. |
| Life events beyond one income/spending phase | **Simplify** | Keep one optional "extra spending phase"; defer multi-event timelines, one-time capital/debt events. |
| Multiple accounts/buckets | **Collapse in MVP** | MVP exposes "investments" + "pension" + optional "cash buffer"; Advanced exposes the full bucket set. |
| Debt amortization complexity | **Defer** | Financing-source modes (holding_capital/external/exit-only) are advanced; MVP can offer at most a single simple loan or none. |
| Snapshots / history | **Lightweight or defer** | Keep simple save/export; defer frozen-snapshot history + comparison UI until users want it. |
| Internal stress modifiers (`noBarma`, `noPartTime`, `noFolkepension`, …) | **Internalize / rename** | Personal/locale-named; see §6. Replace with a small set of generic "what if" toggles or hide entirely in MVP. |

Deferral does **not** mean removal: these stay in the engine and in Advanced mode. The MVP
simply doesn't put them on the first-use path.

---

## 6. Simon-specific / Denmark-specific concepts to rename or generalize

Before public exposure, personally- or locale-named concepts should be generalized. The
*mechanisms* stay; the *labels* change (and several move behind a locale pack — see
model-primitives §6).

| Current (internal) | Generalized public concept | Notes |
|---|---|---|
| `noBarma` stress modifier | "Remove business/holding capital + distributions" | Zeroes `holding.balance/expectedExitValue/annualDistribution`; not an income-stream toggle. |
| `noFolkepension` | "Remove public / state pension" | Folkepension = Danish state pension; a locale preset. |
| `holding` bucket | "Business capital" / "company asset" / "advanced capital account" | Generic business-owner account, not a DK-specific term. |
| `ask` / depot split | "Investment account" (with a tax treatment) | ASK is a DK account type; surface as a tax-treatment option, not jargon. |
| Ratepension / livrente | "Pension (term payout)" / "pension (lifetime annuity)" | DK pension product names → generic payout shapes. |
| Folkepension / `familyFund` | Generic income-stream presets | `income.familyFundAnnualNet/UntilAge` is a personal transfer; generalize to "other income (until age)". |
| Barma / ContenTribe-specific figures | Named income/capital source or internal preset | Real personal/business specifics → a named preset, not a default for everyone. |
| Danish tax/pension terms (AM-bidrag, 27/42, 17% ASK) | Locale-specific **tax/pension pack** labels | Numbers live in a "Denmark 2026" pack; public copy stays generic. |
| `kr` / Danish number grouping / Danish UI copy | Locale formatting + i18n strings | Currency + copy become locale-driven. |

The goal: a public user never sees a personal name (`Barma`) or an unexplained Danish acronym
on the main path. "Simon" becomes one **persona preset** on the DK locale pack, not a special
code path.

---

## 7. Trust & explanation layer

A projection is only useful if the user trusts and understands it. The MVP must make these
explicit (short, plain, always available):

- **Real terms.** State once and clearly that all amounts are in **today's money / nutidskroner**
  (the chosen convention), so figures are comparable to today's prices.
- **Not financial advice.** A persistent, unobtrusive **single global disclaimer** (one calm
  statement, not per number) — the exact Danish wording is the canonical one in
  `docs/public-mvp-spec-and-data-contract-v1.md` §5 (CLAUDE.md §3 rule 8): a simplified estimate
  from the user's own numbers, a qualified picture, not a guarantee, and not financial advice.
- **Assumptions drive the result.** Make the key assumptions (return, inflation/real terms,
  pension access age) visible and editable, with a note that changing them changes everything.
- **Why valid / invalid.** Translate `modelStatus` into plain language via the status→public-copy
  mapping (data contract §4.4) — never render raw `modelStatusReason`: *valid* (plan holds),
  *target missed* (works but ends below your minimum), *invalid* (you run short — here's where).
- **What "first financing problem" means.** Explain it as *"the first year your income +
  available capital can't cover your spending"* — the first real bottleneck, not a styling glitch.
- **Why FI / stop age may not be reached.** When `earliestSustainableStopAge` is null/late,
  say why (spending too high vs. capital, pension access gap, low return) and point at the top
  drivers.
- **What the robustness / confidence score means.** One sentence each: *robustness* = how well
  the plan survives shortfalls/stress; *confidence* = how much it leans on optimistic
  assumptions. Neither is a guarantee.
- **Limitations.** A short, honest list: simplified tax, simplified pension, returns are
  assumptions not forecasts, no market-crash timing, single-person/locale scope in v1.

**Design rule:** every headline number links to a one-paragraph "how is this calculated?"
explainer. If we can't explain it simply, we don't show it in the MVP.

---

## 8. Product risks

| Risk | Description | Mitigation |
|---|---|---|
| Too much complexity too early | The advanced model overwhelms first-time users and they bounce. | Strict progressive disclosure; one-screen form; answer-first. |
| False precision | Showing kr-exact figures implies certainty the model doesn't have. | Per the canonical copy rule (`docs/public-mvp-spec-and-data-contract-v1.md` §5): show the actual computed figure in Danish format, **not** rounded into vagueness; handle uncertainty **once** with the single global disclaimer, and pair the numbers with the robustness/confidence framing ("a qualified picture, not a guarantee"). |
| Misread as advice | Users treat projections as a recommendation to act. | Persistent disclaimer; "planning estimate" language; no buy/sell guidance. |
| DK assumptions leaking into public UI | Danish tax/pension terms or `kr` appear for non-DK users. | Locale packs; generic copy on the main path; DK as one pack, not the default everywhere. |
| Hiding too much → feels generic | Over-simplification makes the tool feel like every other calculator. | Keep the *differentiators* (real bottleneck, robustness, top drivers) on the simple path. |
| Exposing advanced concepts too soon | ASK/holding/withdrawal-order shown before basics are understood. | Advanced is a separate, opt-in door; never on first use. |
| Trust loss from unexplained numbers | A number with no explanation erodes confidence. | The §7 explanation layer is a hard requirement, not a nice-to-have. |
| Engine/UI drift | A separate "simple" model diverges from the real engine. | One engine; simple = a reduced input/output *surface*, enforced by tests. |

---

## 9. Suggested next implementation PRs

A small, focused sequence after this docs phase. Ordered roughly by dependency; each is its
own PR candidate.

1. **Internalize/rename Simon-specific stress labels**
   - *Goal:* rename `noBarma`/`noFolkepension`-style keys to generic concepts (or gate them as
     internal-only) so nothing personal/DK-named is public-facing.
   - *Areas:* `src/lib/finance/stress.ts`, any UI listing modifiers, MODEL.md.
   - *Risk:* low–medium (touches model labels + persistence keys → needs a migration mapping).
   - *Tests:* update stress/persistence tests; add a test that old keys still migrate.

2. **Public/simple mode input structure**
   - *Goal:* a typed "simple inputs" shape + mapping to the full `ScenarioInputs` (no engine change).
   - *Areas:* a new mapping module under `src/lib/finance/`, types.
   - *Risk:* low (additive); must not change existing projection results.
   - *Tests:* unit tests that simple→full mapping projects identically to hand-built scenarios.

3. **Guided onboarding / simple input flow (UI)**
   - *Goal:* the one-screen form + answer-first result from §2.
   - *Areas:* new pages/components; routing.
   - *Risk:* medium (new UI surface).
   - *Tests:* Playwright smoke + a "public journey" flow; no-blank/no-error checks.

4. **Dashboard explanation copy + trust layer**
   - *Goal:* plain-language framing for status, first bottleneck, robustness, "real terms",
     disclaimer (§7).
   - *Areas:* dashboard/report components, copy/i18n.
   - *Risk:* low.
   - *Tests:* Playwright assertions that key explainer text renders (copy-loose).

5. **Hide / debug-gate advanced model details**
   - *Goal:* keep `/debug/model-validation`, raw audit, advanced buckets out of the public surface.
   - *Areas:* routing/feature flags, nav.
   - *Risk:* low–medium (don't break Advanced).
   - *Tests:* Playwright: advanced routes reachable in advanced mode, not on the public path.

6. **Public scenario validity explanations**
   - *Goal:* translate `modelStatus`/`sanityChecks()` into public-friendly messages via the
     public-safe status + warnings adapters (data contract §4.4) — never raw output or raw
     `modelStatusReason`.
   - *Areas:* a presentation mapping (status → copy), dashboard.
   - *Risk:* low.
   - *Tests:* unit tests mapping each status/check to a message; Playwright presence checks.

7. **Top drivers / sensitivity explanation**
   - *Goal:* surface the top drivers as "what helps/hurts most" via the public-safe drivers
     adapter (data contract §4.5) — never raw `robustnessBreakdown` — optionally a small
     1-lever sensitivity ("+1,000 kr/month saving → stop ~1 yr earlier").
   - *Areas:* dashboard component; possibly a thin read-only sensitivity helper (no engine change).
   - *Risk:* medium (sensitivity must reuse the engine, not approximate it).
   - *Tests:* unit tests for any sensitivity helper; Playwright presence.

8. **Playwright tests for the public MVP journey**
   - *Goal:* lock the §2 journey end-to-end (form → result → bottleneck → adjust lever → save/export).
   - *Areas:* `e2e/`.
   - *Risk:* low (test-only).
   - *Tests:* this *is* the test PR.

> Engine/finance/persistence PRs (1, 2, parts of 7) must run the full suite, avoid silent
> assumption changes, and add tests for any behavior change — per the working agreement's
> finance/model caution.

---

## 10. Explicit non-goals for public MVP v1

We are **not** building these in v1 (they remain future/advanced):

- **Full multi-country planning** (the country/relocation module).
- **Full business/holding modeling for all users** (stays an Advanced, opt-in capability).
- **Complete tax-engine abstraction** (MVP uses a single locale pack + effective-rate
  simplifications; not a general progressive tax engine).
- **Professional financial-planning report** (no regulated advice output / certified report).
- **Multi-user / household model** (single person in v1; two-earner households are later).
- **Multi-currency / FX over time** (single currency per locale pack).
- **Advisory / recommendation engine** (we show projections and drivers, never "do X").
- **Real-time market data / Monte-Carlo crash timing** (deterministic real-return assumptions only).

---

*v1 — product-scope map only. No engine, UI, persistence, or test behavior is changed by this
document. Companion: `docs/model-primitives-v1.md`.*
