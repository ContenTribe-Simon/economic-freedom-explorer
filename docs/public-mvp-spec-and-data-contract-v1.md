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
| 4 | **Projection over time** | Make the path tangible. | A simple net-worth-over-time chart with the planned stop age marked and a one-line takeaway ("Dine penge rækker til ca. alder X" / "slipper op ved alder Y"). Anchor points are **horizon-relative** (stop/FI age, pension access age, end of horizon) — never a hardcoded age that may fall outside the projection (see §4.2). |
| 5 | **First bottleneck** | Surface the single most important constraint. | A card naming the **first shortfall age** and the **monthly gap in that year** (sourced from the first shortfall year itself, not an after-stop average — see §4.2), in plain language ("Fra alder 86 mangler du ca. 18.300 kr/md"). If no shortfall: a reassuring "ingen flaskehals fundet". |
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
- **Key numbers card:** capital at **horizon-relative anchors** — planned stop/FI age,
  pension access age, and end of horizon — each a *number + one sentence*. Do **not** use a
  hardcoded calendar age (e.g. 65) that may not exist in the projection (see §4.2 for why
  `capitalAt65` is unsafe).
- **Projection chart card:** net worth over time, planned stop age marked, plain takeaway line.
- **First bottleneck card:** first shortfall age + the **monthly gap in that year**
  (`shortfallAmount / 12` from the first shortfall `YearRow`, **not** the after-stop average),
  or "ingen flaskehals".
- **Robustness card:** "Hvor solid er planen?" — a 0–100 robustness score (`financialRobustness`)
  + the top 3 drivers (helps/hurts) via the **public-safe drivers adapter** (§4.5) — never raw
  `robustnessBreakdown`, which always includes advanced/internal factors (holding, buffer).
- **Warnings card (conditional):** plain-language cautions produced by a **public-safe
  warnings adapter** over `sanityChecks()` + a status→copy mapping over `modelStatus` —
  never raw `sanityChecks()` output, raw check IDs, or `modelStatusReason` verbatim. Only
  allowlisted checks surface (see §4.4); advanced/DK/internal checks are filtered out.
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

### 4.0 Two cross-cutting rules (apply to every output)

These two rules govern **every** row of the output surface. They exist because the engine's
KPIs are built for the advanced/internal surface, where out-of-horizon ages silently return
`0` and lists/text contain advanced/DK/internal items. The public path must never inherit
those behaviours. Every row in §4.2 has been audited against both rules.

- **R1 — Horizon-boundary rule.** The projection runs **exactly `[currentAge, lifeExpectancy]`**
  (`projection.ts`: `age = currentAge + i` for `i` in `0 .. lifeExpectancy − currentAge`).
  Every **age-anchored** output must be explicitly bounded to that range, with a **defined
  conditional/fallback** when the age falls outside it. Several KPIs use the pattern
  `years.find(y => y.age === A)?.netWorth ?? 0`, which returns a real-looking **`0`** when
  age `A` is out of horizon (e.g. `capitalAt65`, and `capitalAtStopAge` if `stopAge` is out
  of range). The public UI must guard the age, not trust the `?? 0`.
- **R2 — Public-safe-adapter rule.** **No raw engine list or text** is exposed on the public
  path — not warnings (`sanityChecks()`), not robustness drivers (`robustnessBreakdown`), not
  assumption-confidence drivers (`confidenceBreakdown`), not status reasons
  (`modelStatusReason`). Each passes a **default-deny adapter** that (a) filters out
  advanced/DK/internal items and (b) translates survivors to public-facing Danish copy.
  Adapters are specified in §4.4 (warnings + status) and §4.5 (drivers).

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
| Capital at planned stop/FI age | `capitalAtStopAge` | DKK | "Ca. N ved din planlagte stop-alder". **R1:** `capitalAtStopAge = yAtStop?.netWorth ?? 0`, so it silently returns 0 if `stopAge` is out of horizon. Show only when `currentAge ≤ stopAge ≤ lifeExpectancy` (which §4.1 input validation must enforce); never trust the `?? 0`. |
| Capital at pension access age | net worth of the `YearRow` at `pensionAccessAge` (read from the projection series; **not** a precomputed KPI) | DKK | "Ca. N når din pension bliver tilgængelig (alder {pensionAccessAge})". **R1:** the projection only spans `[currentAge, lifeExpectancy]`, so there is **no** `YearRow` when `pensionAccessAge < currentAge`. Render the card only when `currentAge ≤ pensionAccessAge ≤ lifeExpectancy`. **Fallbacks:** if `pensionAccessAge < currentAge` (pension already accessible) → show capital at `currentAge` with copy "Din pension er allerede tilgængelig", **or** omit the card; if `pensionAccessAge > lifeExpectancy` (never opens in horizon) → omit the card. |
| Capital at end of horizon | `capitalAt95` | DKK | "Ca. N ved planperiodens slutning". **Note:** despite the name, this field is `years.find(age===95) ?? years[last]` — it **falls back to the last horizon year**, so with horizon 90 it is capital at 90. Treat it as the end-of-horizon anchor; never label it literally "ved 95". |
| First shortfall age | `firstShortfallAge` | integer years or `null` | "Første år pengene ikke rækker: alder Y" (or none) |
| **Monthly gap at the first bottleneck** | `shortfallAmount / 12` of the **first shortfall `YearRow`** (`years.find(y => y.shortfall)`; equivalently that row's `monthlyGap`) | DKK / month | "Fra alder Y mangler du ca. G kr/md" — the gap **in that year**, the number the bottleneck card shows |
| After-stop average monthly gap (optional) | `monthlyGapAfterStop` | DKK / month | The **average** monthly gap across all years from stop age onward — a different, smaller number. If shown at all, label it explicitly as an average ("gns. efter stop"); never use it as the bottleneck gap. |
| Status | `modelStatus` | `valid` / `target_missed` / `invalid` | One clear badge + one-line reason via a **status→public-copy mapping** (§4.4). Never show `modelStatusReason` verbatim — it is raw Danish engine text. |
| Robustness score | `financialRobustness` | 0–100 | "Hvor solid er planen?" with a short explainer |
| Assumption confidence | `assumptionConfidence` | 0–100 | "Hvor meget hviler planen på optimistiske antagelser?" |
| Top drivers (help/hurt) | a **public-safe adapter** over `robustnessBreakdown` (§4.5) | allowlisted, plain Danish copy | "Hvad hjælper / hvad trækker ned" — show top 3–5. **R2:** never point the UI at raw `robustnessBreakdown`; it always contains advanced/internal factors (e.g. the holding-dependency factor, present even when holding = 0). |
| Warnings | a **public-safe adapter** over `sanityChecks()` (§4.4) | allowlisted, plain Danish copy | Plain-language cautions, only when relevant — never raw `sanityChecks()` output |

Optional, if shown: `minNetWorthAtEnd`, `endShortfallVsTarget` (only meaningful when the
user set `fiTargetMinNetWorth`). **Never public-facing:** `firstFinancingIssueKind/Amount`,
`unfinancedHoldingDebt/Years`, full `YearRow[]`, raw audit JSON, `runModelValidation()`,
`modelStatusReason` (raw text), `robustnessBreakdown`/`confidenceBreakdown` as raw lists
(use the §4.5 adapter), and `capitalAt65` (see below).

**Per-row audit against R1 / R2.** Age-anchored rows (R1): *capital at stop/FI age* (guard
`stopAge` in horizon — see row), *capital at pension access age* (guard + fallbacks — see
row), *capital at end of horizon* (safe — `capitalAt95` falls back to the last horizon year).
Scalar age values that only need null/﻿out-of-range display handling, not a `YearRow` lookup:
*earliest sustainable stop age* (`null` → "ikke på sporet endnu"), *planned stop age* (echo
of a validated input), *first shortfall age* (`null` → no bottleneck). List/text rows (R2):
*status* → §4.4 mapping, *warnings* → §4.4 adapter, *top drivers* → §4.5 adapter. Plain
scalars with no boundary/adapter risk: *robustness score*, *assumption confidence*,
*after-stop average gap*, *monthly gap at first bottleneck* (guarded by `firstShortfallAge`
being non-null).

**Why not `capitalAt65`?** `deriveKPIs` computes `capitalAt65 = years.find(y => y.age === 65)?.netWorth ?? 0`. When age 65 is not in the projection (e.g. `currentAge > 65`, or a short horizon), it silently returns **0** — a real-looking but false number. The public surface must use the horizon-relative anchors above instead. If a fixed-age card is ever kept, it must be **conditional**: render only when the age is within `[currentAge, lifeExpectancy]`, and otherwise fall back to an in-horizon anchor (stop/FI age, pension access age, or end of horizon). The supported `currentAge` range may stay broad; the anchors must not assume any fixed age is in the projection.

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
| Capital at stop age (`capitalAtStopAge`) | ≈ 4.240.000 kr | "Ca. 4,2 mio. kr ved stop" |
| Capital at pension access age (67) | ≈ 3.580.000 kr | "Ca. 3,6 mio. kr når pensionen åbner" |
| Capital at end of horizon (90) (`capitalAt95` fallback) | 0 kr | "Formuen er brugt op inden planperiodens slutning" |
| `firstShortfallAge` | 86 | "Første flaskehals: alder 86" |
| **Monthly gap at first bottleneck** (year-86 `shortfallAmount / 12`) | ≈ 18.255 kr/md | "Fra alder 86 mangler du ca. 18.300 kr/md" — this is the bottleneck-card number |
| After-stop average gap (`monthlyGapAfterStop`) | ≈ 3.170 kr/md | A different, smaller average across all years from stop; only show if explicitly labelled "gns. efter stop" |
| `financialRobustness` | 25 / 100 | "Lav robusthed" |
| `assumptionConfidence` | 75 / 100 | "Rimelig antagelsessikkerhed" |
| Top driver (via §4.5 adapter) | raw `robustnessBreakdown[0]` = "Cashflow-shortfall ved alder 86" (negative, critical) | Public copy: "Trækkes mest ned af: pengene slipper op ved 86." The raw list **also** contains "Lav margin til minimumsmål", "Lav kontant buffer" and "Lav afhængighed af holding" — all filtered out by the drivers adapter. |
| Warning (allowlisted) | `planned-over-cashflow` ("Planlagt opsparing overstiger cashflow i 25 år") | Surfaced via the §4.4 adapter as plain copy: "Du forsøger at spare mere op, end din økonomi tillader i 25 år." |

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
| Capital at stop age (`capitalAtStopAge`) | ≈ 8.070.000 kr | "Ca. 8,1 mio. kr ved stop" |
| Capital at pension access age (67) | ≈ 9.500.000 kr | "Ca. 9,5 mio. kr når pensionen åbner" |
| Capital at end of horizon (90) (`capitalAt95` fallback) | ≈ 13.520.000 kr | "Formuen vokser planperioden ud" |
| `firstShortfallAge` | `null` | "Ingen flaskehals fundet" |
| Monthly gap at first bottleneck | — (no shortfall) | Bottleneck card hidden; show "ingen flaskehals" |
| After-stop average gap (`monthlyGapAfterStop`) | 0 kr/md | "Ingen mangel efter stop" |
| `financialRobustness` | 90 / 100 | "Høj robusthed" |
| `assumptionConfidence` | 76 / 100 | "Rimelig antagelsessikkerhed" |
| Top positive driver (via §4.5 adapter) | raw `robustnessBreakdown` includes "Ingen cashflow-shortfall" (positive) + "Komfortabel slutmargin" (positive); also "Lav kontant buffer" and "Lav afhængighed af holding" — the latter two filtered out | Public copy: "Forbruget er dækket hele perioden." / "God margin ved planperiodens slutning." |

> These two fixtures bracket the common cases: a plan that needs work and a comfortable
> plan. Design the result screen so both read clearly without redesign.

### 4.4 Public-safe warnings & status adapter

`sanityChecks()` and `modelStatusReason` are **internal, advanced, and DK-specific** by
design — they reference holding companies, ASK, folkepension, ratepension/livrente, part-time
income, family fund, debt double-counting, the stress-test "No Barma", and the internal
audit panel. **None of this raw output may reach the public path.** The public surface must
go through two small adapters that the onboarding/result PR will implement (UI-side, no
engine change):

**(a) Status → public copy** — map `modelStatus` (`valid` / `target_missed` / `invalid`)
to plain Danish (see §5). Never render `modelStatusReason` (raw engine text) verbatim.

**(b) Warnings allowlist** — a **default-deny** adapter: only checks whose `id` is on the
allowlist may surface, each rewritten to plain, jargon-free Danish. Everything else is
dropped. Match on the stable `id`, not the title text.

**Allowlist (may surface on the public path):**

| `sanityChecks()` id | Why it's public-safe | Public Danish copy (indicative) |
|---|---|---|
| `planned-over-cashflow` | Generic: the user is trying to save more than their cashflow allows. Drop the internal "Hybrid/Planlagt" wording. | "Du forsøger at spare mere op, end din økonomi tillader i {n} år. Resultatet bruger det, der reelt er plads til." |

> The allowlist is intentionally tiny for v1 — under the simple input mapping
> (`toScenarioInputs`), most checks are unreachable (holding, debt, life events, part-time,
> state pension, annuity are all zeroed/off). `planned-over-cashflow` is the one check that
> is both reachable and publicly meaningful. New entries are added deliberately, each with
> reviewed plain-Danish copy — never by surfacing checks wholesale.

**Explicitly filtered out (must never surface publicly), with the reason:**

| id(s) | Category to filter |
|---|---|
| `sp-manual-high` | Folkepension / DK state pension |
| `private-pension-note` | Pension jargon (ratepension / livsvarig / tax rates) |
| `exit-far`, `holding-overlap`, `holding-dependency`, `holding-financing-short`, `holding-debt-external` | Holding / business capital (incl. text referencing the "No Barma" stress test) |
| `parttime-low-gross`, `parttime-late-start` | Deltid / part-time + familiefond income |
| `liab-double-*` | Debt / personal-liability double-counting (advanced) |
| `unallocated-cashflow` | References the internal **audit panel** |
| `savings-logic-explain` | Internal savings-logic explainer (jargon, not a warning) |
| `le-*` (all life-event checks) | Life events — not in the simple surface |

**Filter rule (robust to new checks):** default-deny — drop anything not on the allowlist —
**and** additionally hard-block any check whose `id`, `title`, or `detail` references the
advanced/DK/internal vocabulary: *Folkepension, Holding, "No Barma", Barma, ASK, ratepension,
livrente, livsvarig, deltid, familiefond, exit, audit-panel(et), stress-test*. This keeps a
newly-added engine check from leaking onto the public path before it has reviewed public copy.

### 4.5 Public-safe robustness-drivers adapter

The robustness card's "what helps / what hurts" must **not** point at raw `robustnessBreakdown`.
`deriveKPIs` always pushes advanced/internal factors into that list regardless of the simple
inputs — in particular:

- a **holding-dependency** factor ("Lav/Moderat/Høj afhængighed af holding", detail "Holding
  udgør X % af slutaktiverne") — pushed unconditionally, so it shows even when holding = 0;
- a **cash-buffer** factor ("Lav/OK/Solid kontant buffer") — pushed unconditionally, and since
  the simple surface has no buffer input (`cashBuffer = 0`) it always reads "Lav kontant
  buffer / 0,0 måneders forbrug", nagging about something the public user can't set;
- end-margin factors whose copy references "minimumsmål" even when the user set no FI target.

**Important structural caveat:** unlike `SanityCheck`, a `ScoreFactor` has **no stable `id`** —
only `label` / `detail` / `impact` / `magnitude`, and the labels embed dynamic numbers. So the
adapter must **not** match on label text. Two robust options (the implementation PR picks one):

1. **Preferred — compose public drivers from already-public KPI fields**, not from
   `robustnessBreakdown` at all: derive "what helps/hurts" from `firstShortfallAge` /
   monthly bottleneck gap (cashflow coverage), end-of-horizon capital vs. `fiTargetMinNetWorth`
   (end margin), and the headline `financialRobustness`. This sidesteps the no-`id` problem
   entirely.
2. **Or — classify factors into a small set of public "families"** by their known origin in
   `kpis.ts` and apply a **default-deny allowlist** of families, each with reviewed Danish copy.

**Allowlist of public driver families** (default-deny — anything not listed is dropped):

| Driver family (origin in `kpis.ts`) | Public Danish copy (indicative) |
|---|---|
| Cashflow coverage — positive ("Ingen cashflow-shortfall") | "Dit forbrug er dækket hele perioden." |
| Cashflow coverage — negative ("Cashflow-shortfall ved alder X" / "Månedligt hul efter stop") | "Pengene slipper op ved alder {X}." / "Du mangler i gennemsnit ca. {G} kr/md efter stop." |
| End-of-horizon margin ("Komfortabel slutmargin" / "Lav margin …") | "Du har god margin ved planperiodens slutning." / "Der er kun lille margin ved planperiodens slutning." Mention a target only when `fiTargetMinNetWorth` is set. |

**Explicitly filtered out (never public):**

| Driver family | Reason |
|---|---|
| Holding-dependency ("… afhængighed af holding", "Holding udgør X %") | Advanced / business capital — present even when holding = 0 |
| Cash-buffer ("… kontant buffer") | Buffer is not in the simple input surface; always reads "lav" and can't be acted on |
| Concentration / part-time source factors | Advanced / deltid |
| Minimumsmål-not-met critical factor | Only meaningful with an FI target; rephrase via the end-margin family, never raw |

**Filter rule (mirrors §4.4):** default-deny on family, **and** hard-block any factor whose
`label`/`detail` references *holding, buffer, kontant buffer, deltid, ASK, koncentration,
minimumsmål* (unless an FI target is set) — so a newly-added engine factor can't leak before
it has reviewed public copy.

> **Same treatment applies to `confidenceBreakdown`.** It is not shown in the MVP (only the
> `assumptionConfidence` score is). If a future PR surfaces assumption drivers, they must pass
> an equivalent adapter: allow `returns`, `spending`, `salary`; filter `familyFund`,
> `statePension`, `ratePension`, `lifeAnnuity`, `holdingExit` (advanced/DK), and drop factors
> flagged "Bruges ikke i scenariet".

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
  chart), reading `KPIs` via the existing `project`/`deriveKPIs` pipeline. Includes the
  UI-side adapters from §4.4 (status→public-copy mapping; default-deny warnings allowlist)
  **and §4.5 (drivers adapter)**, horizon-relative capital anchors with the §4.0 **R1**
  boundary guards (incl. the pension-access-age guard + fallbacks and the `capitalAtStopAge`
  in-horizon guard from §4.2), and the first-bottleneck gap sourced from the first shortfall
  `YearRow` (`shortfallAmount / 12`), not `monthlyGapAfterStop`. Every age-anchored and
  list/text output must satisfy the two cross-cutting rules in §4.0.
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
- **Anchors & adapters (resolved in this revision):** the public surface uses horizon-relative
  anchors (stop/FI age, pension access age, end of horizon) bounded to `[currentAge,
  lifeExpectancy]` per §4.0 R1 — including the pension-access-age guard + fallbacks and the
  `capitalAtStopAge` in-horizon guard; `capitalAt65` is not used (silently returns 0 when 65
  is out of horizon). All raw engine lists/text go through public-safe adapters per §4.0 R2:
  warnings + status (§4.4) and robustness drivers (§4.5), with `confidenceBreakdown` reserved
  for the same treatment if ever surfaced. Remaining engine-side nicety (later, optional):
  rename `capitalAt95`/`capitalAt65` in the engine to horizon-relative names so the field
  names stop implying fixed ages — an engine change with tests, out of scope for this docs PR.
- **Net vs. gross income input:** the engine takes gross salary; a public user may think in
  net. Do we add a net→gross presentation step now or defer to a locale/tax layer? (Noted in
  scope §3.)

---

*v1 — specification + data contract only. No engine, UI, persistence, or test behavior is
changed by this document. Companions: `docs/public-mvp-scope-v1.md`, `docs/product-vision.md`,
`docs/model-primitives-v1.md`, `src/lib/finance/simpleInputs.ts`.*
