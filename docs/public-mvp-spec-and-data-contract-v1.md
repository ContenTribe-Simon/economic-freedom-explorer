# Public MVP Spec & Data Contract v1

> **Status:** documentation only. This is the **Phase 3** deliverable (per
> `docs/product-vision.md` §6 roadmap): a forward-looking UX specification and an explicit
> **data contract** that feeds the Claude Design / UI-concept phase. It changes no code,
> tests, persistence, or model behavior.
>
> **Audience:** product + design (Claude Design) + engineering.
>
> **Replaces** the old "UI audit" idea. The current app is generic Lovable scaffolding with
> no real design, so there is nothing worth cataloguing in depth. Section 1 is a brief
> keep/replace/hide inventory; the rest of the document is the forward-looking spec.
>
> **Companion docs:** `docs/public-mvp-scope-v1.md` (the de-facto PRD — inputs/outputs/risks),
> `docs/product-vision.md` (direction), `docs/model-primitives-v1.md` (conceptual model),
> `src/lib/finance/MODEL.md` (engine note), `src/lib/finance/simpleInputs.ts` (the typed
> simple-input surface this spec builds on).

## Product context assumed throughout

- **One app, one engine.** The public **simple flow is the default entry**; the existing
  advanced surface lives behind an opt-in **"Advanced" door** — not a separate app or model.
- **Public UI is Danish** (brand **"Frihedsmodel"**); internal product name is **Economic
  Freedom Explorer**. All proposed user-facing copy below is therefore in Danish; the spec
  prose is English to match the existing docs.
- **"Simple" = a reduced input/output surface** over the real engine
  (`src/lib/finance/simpleInputs.ts`), never a second model.
- **Visual design starts fresh.** Nothing in the current generic UI is preserved. What we
  keep is the **engine, the store, the `simpleInputs` mapping, persistence, and the tested
  pipeline.**

---

## 1. Keep / replace / hide (brief inventory)

This is an inventory of what to reuse vs. rebuild — not a deep audit. Grounded in the
current source: routes in `src/App.tsx`, pages in `src/pages/`, state in
`src/store/financeStore.ts`, engine in `src/lib/finance/`.

| Area | Decision | What & why |
|---|---|---|
| Finance engine — `src/lib/finance/*` (`projection.ts`, `kpis.ts`, `sanity.ts`, `stress.ts`, `tax.ts`, `fire.ts`, `defaults.ts`, `types.ts`) | **KEEP** | Correct, well-tested, invariant-protected. The product's core value. Never forked for the public path. |
| Runtime state + persistence — `src/store/financeStore.ts`, `zustand/persist` (`finance-tool.v1`), `MODEL_VERSION`/`migrate()` | **KEEP** | Proven local-first persistence with versioned migration. The public flow reads/writes through it. |
| Simple-input mapping — `src/lib/finance/simpleInputs.ts` (`SimplePublicInputs`, `toScenarioInputs`, `toAssumptions`, `toScenario`, `DEFAULT_SIMPLE_INPUTS`) | **KEEP** | The exact bridge the public UI sits on. This spec's data contract (§4) is its surface. |
| Cloud overlay — `src/lib/cloud/*`, `/cloud`, `/auth` (optional Supabase save/login, RLS) | **KEEP (optional, deferred in flow)** | Works today and is offline-optional. Not on the first-use path; surfaced as optional "save to cloud" later. |
| Tested pipeline — Vitest unit/scenario suites + Playwright e2e + CI gate | **KEEP** | The safety net. New public UI adds e2e coverage; it must not weaken existing tests. |
| Public page/route UI + visual layer — `Dashboard`, `Inputs`, `Assumptions`, `Projection`, `Report`, the `AppShell` nav, generic Lovable `Index.tsx` | **REPLACE** | Generic scaffolding, no design, exposes the full advanced model immediately. The public path is rebuilt from this spec. |
| Advanced routes/features — `/scenarios`, `/snapshots`, `/life-events`, `/fire`, `/countries`, full year-by-year tables, holding/business, ASK, `depotTax`, custom withdrawal order, detailed tax buckets, stress modifiers | **HIDE behind Advanced door** | Real and valuable, but advanced/locale-specific. Stays in the engine + Advanced mode; never on first use (CLAUDE.md §3 rule 7). |
| `/debug/model-validation` (`ModelValidation` page, `runModelValidation()`) | **HIDE (internal only)** | Engineering/test tooling. Never public-facing (scope §4 "internal/debug"). |

**Net:** keep everything below the UI (engine, store, mapping, persistence, tests);
rebuild the public UI surface from scratch; keep advanced + debug surfaces but off the
default path.

---

## 2. Public MVP flow (answer-first journey)

Reconciled with `docs/public-mvp-scope-v1.md` §2. The journey is **answer-first**: a usable
result appears on sensible defaults before the user tunes anything, then invites refinement.
All amounts are **real terms / today's money (nutidskroner)**.

| # | Step | Purpose | What the user sees |
|---|---|---|---|
| 1 | **Intro / framing** | Set expectation: this is an estimate, not advice; all amounts are in today's money. | One calm screen: headline question *"Hvornår kan du blive økonomisk fri?"*, one-line framing, a single primary CTA to start. A persistent, unobtrusive "ikke rådgivning" note. |
| 2 | **Simple inputs** | Collect the minimal input set (§4) with defaults pre-filled so a result is always reachable. | One short form/card fitting one screen: age, horizon, income, spending, current investments, monthly saving, pension balance + access age, expected return, desired stop age. Defaults from `DEFAULT_SIMPLE_INPUTS`. |
| 3 | **Answer-first result** | Give the headline answer immediately. | A result hero: status badge (on track / tight / not yet) + the headline number **earliest sustainable stop age**, plus a one-line plain-language takeaway. |
| 4 | **Projection over time** | Make the path tangible. | A simple net-worth-over-time chart with the planned stop age marked and a one-line takeaway ("Dine penge rækker til ca. alder X" / "slipper op ved alder Y"). Anchor points at stop age and key ages. |
| 5 | **First bottleneck** | Surface the single most important constraint. | A card naming the **first shortfall age** and the **monthly gap** there, in plain language ("Fra alder 86 mangler du ca. 3.200 kr/md"). If no shortfall: a reassuring "ingen flaskehals fundet". |
| 6 | **Adjust a few levers** | Let the user *feel* the trade-offs. | 2–3 live controls (monthly spending, monthly saving, stop age). Result + chart + bottleneck update live. Advanced depth stays behind the Advanced door. |
| 7 | **Save / export (optional)** | Let the user keep or share a result. No account required for the basic path. | Local save + JSON export; optional "save to cloud" (login) as a clearly secondary action. |

Advanced depth (extra accounts, tax detail, business capital, scenarios, snapshots,
countries) is a **separate opt-in "Advanced" door**, never on the main path.

---

## 3. Screens & cards for Claude Design

Concrete structural brief. For each screen: the cards/sections, what each shows, and what
is hidden/deferred. This is what a designer builds from. Copy shown is indicative Danish
(see §5 for tone); final microcopy is a copy pass, not locked here.

### Screen A — Intro / framing
- **Hero card:** product brand "Frihedsmodel", headline question, one-line framing, primary
  CTA (*"Kom i gang"*).
- **Trust strip (persistent):** "Et estimat til planlægning — ikke økonomisk rådgivning."
  + "Alle beløb er i nutidskroner."
- *Hidden/deferred:* sign-in, advanced mode entry (a small, low-emphasis link only).

### Screen B — Simple inputs
- **Input card "Om dig":** current age, planning horizon (life expectancy).
- **Input card "Økonomi i dag":** annual gross income, monthly spending.
- **Input card "Opsparing & investering":** current investments, monthly saving.
- **Input card "Pension":** pension balance, pension access age.
- **Input card "Antagelser & mål":** expected real return (one field), desired stop age,
  (optional) FI target minimum net worth.
- **Primary action:** *"Se mit resultat"*. Defaults pre-filled so this is reachable instantly.
- *Hidden/deferred:* multiple accounts, ASK/depot tax, cash buffer, part-time/bridge income,
  state pension, ongoing pension contributions, annuities, debt, life events, withdrawal
  order, per-assumption confidence. (All mapped to safe off/zero by `toScenarioInputs`.)

### Screen C — Result (answer-first dashboard)
- **Status hero card:** status badge (valid / tight / not yet) + headline **earliest
  sustainable stop age** + one-line takeaway. Maps from `modelStatus` + `earliestSustainableStopAge`.
- **Key numbers card:** capital at planned stop age; capital at a key age (e.g. 65); each a
  *number + one sentence*.
- **Projection chart card:** net worth over time, planned stop age marked, plain takeaway line.
- **First bottleneck card:** first shortfall age + monthly gap, or "ingen flaskehals".
- **Robustness card:** "Hvor solid er planen?" — a 0–100 robustness score + the top 3
  drivers (helps/hurts), in plain language. Maps from `financialRobustness` +
  `robustnessBreakdown`.
- **Warnings card (conditional):** plain-language cautions from `sanityChecks()` /
  `modelStatusReason`, shown only when relevant. Never raw check IDs.
- **"How is this calculated?" affordance:** each headline number links to a one-paragraph
  explainer (real terms, what FI age means, what robustness means).
- *Hidden/deferred:* full year-by-year `YearRow[]` table, per-bucket balances, tax
  breakdowns, withdrawal audit, scenario comparison, country analysis, raw audit JSON,
  `/debug/model-validation`.

### Screen D — Adjust levers (may be inline on Screen C)
- **Lever controls:** monthly spending, monthly saving, stop age (2–3 controls, live recompute).
- **Live result echo:** status badge + stop age + bottleneck update as the user drags.
- *Hidden/deferred:* stress modifiers, custom scenarios, assumption-by-assumption editing.

### Screen E — Save / export (optional, secondary)
- **Local save card:** name + save to `localStorage`.
- **Export card:** download JSON summary.
- **Cloud (optional) card:** "Gem i skyen" → login (Supabase). Clearly secondary; never required.
- *Hidden/deferred:* snapshot history + comparison UI, share links, accounts-first flows.

### The Advanced door (out of MVP scope, present as a link only)
- A single low-emphasis entry ("Avanceret") that leads to the existing advanced surface
  (scenarios, snapshots, life events, FIRE, countries, full tables). Not designed in this
  spec — it reuses the current advanced pages until a later phase.

---

## 4. Public data contract

The explicit handoff for Claude Design. Two halves: the **input surface** (what the UI
collects) and the **output surface** (what the result UI must show), plus **example
fixtures** to design against.

### 4.1 Input surface — `SimplePublicInputs`

The exact typed fields from `src/lib/finance/simpleInputs.ts`. All monetary values are
**DKK, real terms (today's money)**. Defaults are `DEFAULT_SIMPLE_INPUTS`.

| Field | Type / unit | Default | Meaning | Suggested input range* |
|---|---|---|---|---|
| `currentAge` | integer years | 35 | Start of the projection horizon | 18–75 |
| `lifeExpectancy` | integer years | 90 | Planning horizon end age | `currentAge+1`–110; default ~90 |
| `annualIncome` | DKK / year, gross | 500,000 | Current gross annual income | 0–5,000,000 |
| `monthlySpending` | DKK / month, net | 20,000 | Desired monthly spending (the dominant lever) | 0–200,000 |
| `currentInvestments` | DKK | 200,000 | What you've invested so far | 0–50,000,000 |
| `monthlySavings` | DKK / month | 8,000 | Ongoing monthly saving into investments | 0–500,000 |
| `pensionBalance` | DKK | 300,000 | Current pension balance | 0–50,000,000 |
| `pensionAccessAge` | integer years | 67 | Age pension becomes accessible / starts paying | 50–80 |
| `expectedRealReturn` | decimal (0.04 = 4%) | 0.04 | One simple real-return field, mapped to all per-bucket returns | 0.00–0.10 |
| `desiredStopAge` | integer years | 60 | Desired stop / retirement age (the goal) | `currentAge`–`lifeExpectancy` |
| `fiTargetMinNetWorth?` | DKK, optional | omitted ⇒ 0 | Optional FI target: minimum net worth at end of horizon | 0–50,000,000 |

\* **Ranges are design guidance, not yet enforced.** `simpleInputs.ts` does no validation;
input validation/clamping is an **open item for Phase 7** (mid-build stress/security gate).
Design should assume validation will exist (e.g. "stop age must be ≥ current age") and show
inline error states accordingly.

**Mapping notes (so design understands the simplifications):** the simple form maps to a
single salary stream while working; one investment account (no ASK/depot-tax/cash buffer);
a pension as a starting balance + access age (no ongoing contributions/annuity); business/
holding capital, debt, life events, part-time income, state pension, and advanced
withdrawal/allocation policies are all set to safe off/zero. These are surface choices in
`toScenarioInputs` — the engine and existing scenarios are unchanged.

### 4.2 Output surface — what the result UI must show

The MVP shows a clear subset of `KPIs` (from `src/lib/finance/types.ts`) plus
`sanityChecks()`. Each output is a **number + a plain sentence** (scope §4 rule).

| Output | Source field (`KPIs.*`) | Type / unit | Plain-language meaning |
|---|---|---|---|
| Earliest sustainable stop age | `earliestSustainableStopAge` | integer years or `null` | "Du kan tidligst stoppe omkring alder X" (or "ikke på sporet endnu" when `null`) |
| Planned stop age (echo of input) | `plannedStopAge` | integer years | The stop age the user chose, for comparison with the earliest sustainable one |
| Capital at planned stop age | `capitalAtStopAge` | DKK | "Ca. N ved din planlagte stop-alder" |
| Capital at key age (65) | `capitalAt65` | DKK | An anchor point on the chart |
| Capital at age 95 (end anchor) | `capitalAt95` | DKK | **Note:** falls back to the **last horizon year** when there is no age 95 (e.g. horizon 90 ⇒ this is capital at 90). Frame as "ved planperiodens slutning". |
| First shortfall age | `firstShortfallAge` | integer years or `null` | "Første år pengene ikke rækker: alder Y" (or none) |
| Monthly gap after stop | `monthlyGapAfterStop` | DKK / month | "Ca. G kr/md for lidt efter du stopper" (0 when the plan holds) |
| Status | `modelStatus` (+ `modelStatusReason`) | `valid` / `target_missed` / `invalid` | One clear badge + one-line reason, in plain Danish (not raw reason strings verbatim) |
| Robustness score | `financialRobustness` | 0–100 | "Hvor solid er planen?" with a short explainer |
| Assumption confidence | `assumptionConfidence` | 0–100 | "Hvor meget hviler planen på optimistiske antagelser?" |
| Top drivers (help/hurt) | `robustnessBreakdown` (`ScoreFactor[]`) | label + impact + magnitude + detail | "Hvad hjælper / hvad trækker ned" — show top 3–5 |
| Warnings | `sanityChecks()` → `SanityCheck[]` | severity + title (+ detail) | Plain-language cautions, only when relevant |

Optional, if shown: `minNetWorthAtEnd`, `endShortfallVsTarget` (only meaningful when the
user set `fiTargetMinNetWorth`). **Never public-facing:** `firstFinancingIssueKind/Amount`,
`unfinancedHoldingDebt/Years`, full `YearRow[]`, raw audit JSON, `runModelValidation()`.

### 4.3 Example projected results (design fixtures)

Computed by tracing the engine (`toScenario`/`toAssumptions` → `project` → `deriveKPIs`/
`sanityChecks`) — via a temporary, uncommitted script; **no code was committed**. Numbers are
real-terms DKK. Use these as realistic design fixtures (one "not yet on track", one "on track").

**Fixture 1 — `DEFAULT_SIMPLE_INPUTS` persona (the default form state).**
Inputs: age 35, horizon 90, income 500,000, spending 20,000/md, investments 200,000,
saving 8,000/md, pension 300,000 @ access 67, return 4%, desired stop 60.

| Output | Value | Designed-for framing |
|---|---|---|
| `modelStatus` | `invalid` | Badge: "Ikke på sporet endnu" |
| `plannedStopAge` | 60 | "Du vil gerne stoppe ved 60" |
| `earliestSustainableStopAge` | 62 | "Tidligst holdbare stop: ca. 62" |
| `capitalAtStopAge` | ≈ 4.240.000 kr | "Ca. 4,2 mio. kr ved stop" |
| `capitalAt65` | ≈ 3.810.000 kr | anchor point |
| `capitalAt95` (= age 90 here) | 0 kr | "Formuen er brugt op inden planperiodens slutning" |
| `firstShortfallAge` | 86 | "Første flaskehals: alder 86" |
| `monthlyGapAfterStop` | ≈ 3.170 kr/md | "Ca. 3.200 kr/md for lidt" |
| `financialRobustness` | 25 / 100 | "Lav robusthed" |
| `assumptionConfidence` | 75 / 100 | "Rimelig antagelsessikkerhed" |
| Top driver | "Cashflow-shortfall ved alder 86" (negative, critical) | "Trækkes mest ned af: pengene slipper op ved 86" |
| Warning | "Planlagt opsparing overstiger cashflow i 25 år" (warn) | shown in warnings card |

> Useful for design: this default persona is **deliberately not on track** — it exercises
> the "not yet" badge, a real bottleneck, and a low robustness score on first load. A lever
> nudge (lower spending or later stop) should move it toward valid.

**Fixture 2 — Higher-saver persona (an "on track" contrast).**
Inputs: age 35, horizon 90, income 650,000, spending 18,000/md, investments 600,000,
saving 15,000/md, pension 500,000 @ access 67, return 4%, desired stop 55.

| Output | Value | Designed-for framing |
|---|---|---|
| `modelStatus` | `valid` | Badge: "På sporet" |
| `plannedStopAge` | 55 | "Du vil gerne stoppe ved 55" |
| `earliestSustainableStopAge` | 48 | "Du kunne stoppe allerede ved ca. 48" |
| `capitalAtStopAge` | ≈ 8.070.000 kr | "Ca. 8,1 mio. kr ved stop" |
| `capitalAt65` | ≈ 9.250.000 kr | anchor point |
| `capitalAt95` (= age 90 here) | ≈ 13.520.000 kr | "Formuen vokser planperioden ud" |
| `firstShortfallAge` | `null` | "Ingen flaskehals fundet" |
| `monthlyGapAfterStop` | 0 kr/md | "Ingen mangel efter stop" |
| `financialRobustness` | 90 / 100 | "Høj robusthed" |
| `assumptionConfidence` | 76 / 100 | "Rimelig antagelsessikkerhed" |
| Top positive driver | "Ingen cashflow-shortfall" (positive, high) | "Forbruget er dækket hele perioden" |

> These two fixtures bracket the common cases: a plan that needs work and a comfortable
> plan. Design the result screen so both read clearly without redesign.

---

## 5. Copy direction (Danish)

Tone: **calm, plain, trustworthy, practical.** Not advice, not jargon, not salesy, no false
precision. Short sentences. Numbers are rounded/approximate in headlines ("ca."). Never show
personal names (Barma) or unexplained Danish acronyms (ASK, AM-bidrag, 27/42) on the public
path. Currency is `kr`; amounts are nutidskroner.

Principles:
- **Every headline number gets one explaining sentence.** A number with no sentence is not ready.
- **Estimate, not advice.** Persistent, unobtrusive: *"Et estimat til planlægning — ikke
  økonomisk rådgivning."*
- **Real terms, stated once, clearly:** *"Alle beløb er i nutidskroner (dagens købekraft)."*
- **Plain bottleneck language**, not engine terms: *"flaskehals"* not *"cashflow-shortfall"*.

Example labels / microcopy (indicative — final copy is a later pass):

| Context | Danish copy |
|---|---|
| App brand | **Frihedsmodel** |
| Intro headline | "Hvornår kan du blive økonomisk fri?" |
| Intro sub | "Få et estimat på få minutter — og se, hvad der betyder mest." |
| Start CTA | "Kom i gang" |
| Result CTA | "Se mit resultat" |
| Status: valid | "På sporet" |
| Status: tight / target_missed | "Lige på vippen" |
| Status: invalid | "Ikke på sporet endnu" |
| Headline answer | "Du kan tidligst stoppe omkring alder {X}." |
| No FI age yet | "Med de nuværende tal er du ikke på sporet endnu." |
| Capital at stop | "Ca. {N} kr ved din planlagte stop-alder." |
| Bottleneck | "Fra alder {Y} mangler du ca. {G} kr/md." |
| No bottleneck | "Ingen flaskehals fundet — planen holder hele vejen." |
| Robustness | "Hvor solid er planen?" |
| Confidence | "Hvor meget afhænger resultatet af optimistiske antagelser?" |
| Levers nudge | "Prøv at justere forbrug, opsparing eller stop-alder og se effekten." |
| Disclaimer | "Et estimat til planlægning — ikke økonomisk rådgivning." |
| Real terms note | "Alle beløb er i nutidskroner." |

---

## 6. Suggested first implementation PR after this spec

Per `docs/public-mvp-scope-v1.md` §9 and the roadmap, the input mapping (PR #12) already
exists. The natural **next PR** is the first piece of public UI:

**`feat/public-onboarding-and-result-v1` — guided simple-input flow + answer-first result**
- **Goal:** build Screens B and C (§3) over the existing `simpleInputs` mapping: the
  one-screen simple form (pre-filled from `DEFAULT_SIMPLE_INPUTS`) and the answer-first
  result hero (status badge + earliest sustainable stop age + headline takeaway + projection
  chart), reading `KPIs` via the existing `project`/`deriveKPIs` pipeline.
- **Scope guardrails:** UI only. No engine, persistence, or data-format changes. Reuse the
  store and mapping; do not fork engine logic. Keep advanced/DK concepts off the path
  (CLAUDE.md §3). Use Danish copy per §5.
- **Tests:** Playwright smoke of the public journey (form → result renders, no blank/error),
  plus presence checks for the headline number and status badge. No weakening of existing tests.
- **Risk:** medium (new UI surface), low model risk (additive, mapping already tested).
- **Defers to later PRs:** live levers (Screen D), trust/explanation copy depth, save/export
  (Screen E), hiding/debug-gating advanced routes, sensitivity/top-drivers polish — each its
  own focused PR per scope §9.

A small earlier/parallel PR is also reasonable if preferred: a **Claude Design visual
concept** (Phase 4) built directly from §3 + §4 before writing the onboarding UI, so the
UI PR has a visual target.

---

## 7. Open questions

- **Surplus policy:** the simple mapping leaves surplus beyond `monthlySavings` un-invested
  (`outOfModel`). Should the public MVP auto-invest surplus (`investExtra`)? (Flagged in
  `simpleInputs.ts`; product decision, would change result numbers — needs tests.)
- **Input validation/clamping:** not implemented in `simpleInputs.ts`; ranges in §4.1 are
  guidance only. Where does validation live (UI vs. mapping) and what are the enforced bounds?
  (Phase 7 item.)
- **"Tight" status:** scope mentions a "tight / lige på vippen" state; the engine exposes
  `valid | target_missed | invalid`. Confirm the mapping (likely `target_missed` → "tight").
- **`capitalAt95` framing:** with a default horizon of 90, this field is capital at the end
  of the horizon, not literally age 95. Confirm whether the public copy says "ved
  planperiodens slutning" or whether the horizon default should change.
- **Net vs. gross income input:** the engine takes gross salary; a public user may think in
  net. Do we add a net→gross presentation step now or defer to a locale/tax layer? (Noted in
  scope §3.)

---

*v1 — specification + data contract only. No engine, UI, persistence, or test behavior is
changed by this document. Companions: `docs/public-mvp-scope-v1.md`, `docs/product-vision.md`,
`docs/model-primitives-v1.md`, `src/lib/finance/simpleInputs.ts`.*
