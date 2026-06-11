# Model Primitives v1

> **Status:** documentation only. Describes the *current* model and a generalization path.
> It does **not** prescribe code changes and does not change any behavior.
>
> **Audience:** product + engineering, planning the move from a single advanced user
> ("Simon") to a generalizable model usable by future public users.

---

## 1. Purpose

The app today is a high-fidelity **personal FIRE / financial-independence projection** built
around one advanced Danish user. It encodes real-world specifics — a holding company,
Aktiesparekonto (ASK), ratepension/livrente, Danish labor + share-income tax, folkepension —
directly into the model.

This document separates **what is genuinely general** (the primitives every projection needs)
from **what is Simon/Denmark/2026-specific** (parameters and locale rules that must become
configurable). The goal is a shared vocabulary for evolving toward a public model without
losing the precision the current engine already has (and that the test suites already lock in).

The internal Danish technical note (`src/lib/finance/MODEL.md`) describes the *implementation*.
This document is the *conceptual / product* layer above it.

---

## 2. How to read this

Each primitive is described three ways:

- **General concept** — what any user's projection needs.
- **Current (Simon-specific) realization** — how the engine does it today, with real field names.
- **Generalization note** — what must become a parameter, a locale pack, or a preset.

The single most important deliverable is the **mapping table in §5**.

---

## 3. Core mental model: a year-by-year state machine

Everything reduces to one loop (today: `projectWithStopAge` in `projection.ts`):

```
for each age from currentAge .. lifeExpectancy:
    income      = sum(active income streams at this age)
    spending    = baseSpending + life-event deltas
    cashflow    = income − debtService − spending          # "cashflow before savings"
    if cashflow >= planned savings: invest planned, allocate surplus by policy
    elif cashflow >= 0:             invest available, record planned-savings shortfall
    else (cashflow < 0):            drain capital to cover the deficit (ordered, tax-aware)
    apply growth, taxes, contributions
    close balances → emit one YearRow (a full audit record)
```

Two invariants make the model trustworthy (both enforced by existing tests):

- **Conservation / no money creation** — net worth only changes via explicit flows
  (income, growth, contributions, taxed withdrawals, debt). A deficit must reduce a bucket,
  drain the buffer (if allowed), or surface as a visible `shortfallAmount` — never vanish.
- **No negative asset buckets** — buckets floor at 0; only debt / net worth may go negative.

These two are *locale-independent* and should be preserved verbatim in any public model.

---

## 4. The primitives

### 4.1 Lifecycle & phases
- **General:** a horizon (`currentAge … lifeExpectancy`) split into implicit phases —
  **accumulation** (working), **bridge** (stopped, before pensions unlock), **drawdown**
  (pensions/decumulation active).
- **Current:** `person.currentAge/lifeExpectancy`, `stopAge`, `fullRetireAge`,
  `pension.payoutFromAge`. Phases are derived, not stored.
- **Generalization:** keep ages as the primitive; "retirement age" and "pension access age"
  must be independent parameters (they already are).

### 4.2 Capital buckets (the central abstraction)
- **General:** an *account* with attributes: balance, expected real return, tax treatment,
  liquidity, **availability age**, and a place in a **withdrawal order**.
- **Current:** three *invested* buckets — `free`, `pension`, `holding` — plus a non-invested
  cash buffer (`free.cashBuffer`) that counts toward net worth but earns no return. `ask`
  (Aktiesparekonto) is currently a **sub-account / tax treatment inside `free`** (alongside the
  `depotTax` treatment of the ordinary depot), not a fully independent bucket.
- **Generalization:** this is the prime candidate for a **generic `Account` primitive**
  `{ kind, balance, realReturn, taxTreatment, availableFromAge, withdrawable }`. Today's
  buckets become *instances/presets* of one type, the cash buffer becomes a zero-return account
  variant, and ASK could become a first-class account rather than a sub-account of `free`. ASK,
  depot, holding, pension are tax-treatment + availability variations of the same idea.

### 4.3 Income streams
- **General:** time-windowed inflows, each gross or net, taxed by a stream-specific function.
- **Current:** salary (`income.salaryGross`), `partTime`, `familyFund`, `statePension`,
  pension payout streams (`ratePension`, `lifeAnnuity`), holding distributions.
- **Generalization:** a generic **`IncomeStream` primitive** `{ amount, gross|net, fromAge,
  untilAge, taxRule }`. Folkepension/familyFund are *presets* of this; salary is the always-on
  stream during accumulation.

### 4.4 Spending
- **General:** a base spending level (real terms) plus time-bounded adjustments.
- **Current:** `spending.desiredMonthlyNet` (net, present-kroner) + life-event spending deltas.
- **Generalization:** already general; keep "net, real terms" as the contract.

### 4.5 Cashflow bridge
- **General:** `income − debtService − spending` = the disposable amount before savings.
  Drives "invest vs. drain."
- **Current:** `flows.cashflowBridge.cashflowBeforeSavings` — exposed per year for audit.
- **Generalization:** already general and is the backbone of the conservation invariant.

### 4.6 Savings / allocation policy
- **General:** how positive cashflow becomes wealth.
- **Current:** `cashflowAllocation.plannedInvestmentMethod` (`planned | cashflow | none`),
  `surplusPolicy` (`toBuffer | bufferThenInvest | investExtra | extraSpending | outOfModel`),
  and `plannedShortfallPolicy` (`capToCashflow | useBuffer | showShortfall`).
- **Generalization:** these enums are already abstract policies, not Simon-specific — keep them.

### 4.7 Decumulation / withdrawal policy
- **General:** when capital is needed, *which* accounts are tapped, in what order, subject to
  **availability gating**; plus optional *planned* withdrawals vs. *on-demand* (shortfall-only).
- **Current:** `capitalWithdrawal` `{ strategy (depotFirst | holdingFirst | askFirst |
  pensionFirst | pensionThenHolding | proRata | custom), plannedWithdrawalPolicy (none |
  fixedAnnual | fillLowShareIncomeBracket), startAge / startAtStopAge }`.
- **Generalization:** `strategy` + ordering generalizes cleanly. `fillLowShareIncomeBracket`
  is **tax-locale-specific** (Danish 27/42 bracket) and should live behind a locale-aware
  "tax-bracket-filling" policy rather than the core.

### 4.8 Taxation (pluggable)
- **General:** pure functions mapping gross↔net per income/account type, parameterized by a
  tax profile.
- **Current:** `tax.ts` — `laborTax` (AM-bidrag + two-bracket labor tax), `shareTax` and the
  **shared 27/42 share-income pool** (`ShareIncomeCtx`, used once per year across holding +
  realized depot gains), `pensionPayoutTax` (flat per-track rate), ASK lager tax (17%),
  depot realization (gain-share only).
- **Generalization:** the *function shapes* are general; the *rates/thresholds* are a
  **Danish tax pack** (`Assumptions.tax`). The "shared bracket pool used once per year" is a
  reusable **primitive** ("a tax allowance shared across sources, consumed once per period"),
  even though the 27/42 numbers are locale-specific.

### 4.9 Debt
- **General:** amortizing liabilities with interest + principal, a cashflow impact, and a
  financing source.
- **Current:** `debts[]` `{ balance, interestRate, monthlyPayment, impact (private | holding |
  risk_only), holdingFinancing (holding_capital | private_cashflow | external_company |
  exit_only | display_only), includeInNetWorth }`.
- **Generalization:** the core (amortization + cashflow impact + include-in-net-worth) is
  general; `holdingFinancing` modes are an advanced/business-owner extension, not core.

### 4.10 Buffer (cash reserve)
- **General:** non-invested cash that counts toward net worth but earns no return, with an
  explicit policy on whether it may cover shortfalls.
- **Current:** `free.cashBuffer`, `free.bufferUsableForShortfall`, surplus `toBuffer`/
  `bufferTarget`.
- **Generalization:** already general and well-tested (rehydration + multi-year suites).

### 4.11 Life events (time-windowed deltas)
- **General:** a delta applied to income / spending / capital / debt over an age window.
- **Current:** `lifeEvents[]` (recurring `privateIncome`/`privateSpending`, one-time
  `freeCapital`/`privateDebt`; other targets reserved).
- **Generalization:** already a clean general primitive; the natural home for public "presets"
  (children, home purchase, sabbatical, inheritance).

### 4.12 Shortfall & status
- **General:** the model must *show* unfunded spending rather than hide it, and grade overall
  viability.
- **Current:** `YearRow.shortfallAmount`, `plannedSavingsShortfall`, plus `KPIs.modelStatus`
  (`valid | target_missed | invalid`) and robustness scoring.
- **Generalization:** keep shortfall visibility as a hard contract; robustness *weights* can
  be tuned per audience.

### 4.13 Assumptions & confidence
- **General:** returns, inflation, and a tax profile; plus per-assumption confidence that
  affects *scoring* but never the year-by-year math.
- **Current:** `Assumptions { realReturn{free,pension,holding}, inflation, tax{…},
  statePensionAnnualNet, withdrawOrder }`; `scenario.confidence`.
- **Generalization:** split into a **return/inflation profile** and a **tax locale pack**.
  Confidence is already audience-general.

### 4.14 Scenarios, stress & persistence
- **General:** a base case, derived stress variants, independent custom copies; deterministic
  export/import and frozen snapshots.
- **Current:** `type (base | linked_stress_test | custom)`, `stress.ts` modifiers with
  `allowedFields`, `ModelExport`, `Snapshot`, versioned `persist.migrate`.
- **Generalization:** the scenario/stress *mechanism* is general; the *specific* modifiers are
  presets. Some are Simon- or Denmark-specific — e.g. `noBarma` is a Simon-specific **internal**
  modifier that removes a particular named income stream, and `noFolkepension` removes the
  Danish state pension. The public-facing concept should be generic (e.g. *"remove a named
  income stream"* / *"remove business income"*) rather than personally-named keys.

### 4.15 Outputs
- **General:** a per-year audit row, aggregated KPIs, a CSV/JSON export, and frozen snapshots.
- **Current:** `YearRow`, `deriveKPIs`, `buildProjectionExport/Csv`, `buildYearAuditJson`,
  `buildSnapshot`.
- **Generalization:** the `YearRow` audit contract is the model's public surface — keep it stable.

---

## 5. Mapping: Simon-specific → generalizable primitive

| Simon-specific feature | Generalizable primitive | What to parameterize / abstract |
|---|---|---|
| `free` + `ask` + `depot` (`depotTax`) | **Account** (taxable investment) | tax treatment becomes pluggable; ASK/depot are tax-treatment presets |
| `pension` (ratepension + livrente) | **Account + IncomeStream** with `availableFromAge` | payout schedule + access age as parameters |
| `holding` company | **Account** (advanced/business) + distribution policy | optional module; not core for most public users |
| Danish labor tax (AM-bidrag, 37/52, bracket) | **Tax rule** for labor income | move rates/brackets into a locale tax pack |
| 27/42 share-income shared bracket | **Shared once-per-period allowance** primitive | numbers are locale; the "shared pool" mechanism is reusable |
| ASK 17% lager tax + carry-forward | **Account tax treatment** (annual mark-to-market) | tax rate + carry-forward as parameters |
| Folkepension / familyFund | **IncomeStream** presets | amount + fromAge + tax rule |
| `capitalWithdrawal.fillLowShareIncomeBracket` | **Tax-aware withdrawal policy** | gate behind locale tax pack |
| Stress modifiers (e.g. `noBarma`, `noFolkepension`) | **Scenario modifier** presets | `noBarma` is a Simon-specific internal example; expose generic concepts ("remove a named income stream" / "remove business income") instead of personally-named keys |
| `desiredMonthlyNet`, buffer, life events, debts, savings/withdrawal policies | **Already general primitives** | keep as-is |

**Rule of thumb:** *mechanisms* generalize; *numbers, brackets, and named local programs* are
locale packs or presets.

---

## 6. Locale / assumption boundaries (what is Danish/2026-specific)

These must become configurable for a public model (today they are baked into `defaults.ts` /
`tax.ts`):

- Labor tax structure and rates (AM-bidrag, bottom/top rates, top bracket, personal allowance).
- Share-income brackets and rates (27% / 42%, threshold).
- ASK rate (17%) and deposit limit.
- Pension tax treatment and folkepension base/age.
- Default real returns and inflation.
- Currency, number formatting (`kr`, Danish grouping), and Danish UI copy.

Most mechanisms in §4 are *structurally* generalizable, but some current labels and presets
remain Simon- or Denmark-specific (e.g. bucket/field names like `free`/`holding`, stress-modifier
keys like `noBarma`, and the default persona) and should be renamed or moved behind presets
before public exposure. **Structurally general is not the same as public-ready.**

---

## 7. Suggested generalization layering (non-prescriptive)

A possible future shape, kept deliberately high-level:

1. **Primitive core** — lifecycle, generic `Account`, `IncomeStream`, spending, cashflow
   bridge, savings/withdrawal policies, buffer, debt, life events, shortfall, the YearRow
   audit, and the conservation invariants. Locale-free.
2. **Tax / locale packs** — pluggable tax rules + return/inflation defaults (a "Denmark 2026"
   pack is the first; others can follow).
3. **Persona presets** — bundles of accounts + income streams + stress modifiers
   (e.g. "DK employee", "DK business owner (holding)", "simple ETF investor").

"Simon" becomes one persona preset on the DK locale pack — not a special code path.

---

## 8. Public MVP vs Advanced Mode

A pragmatic productization split of the primitives above. The MVP and Advanced tiers are the
*same engine and primitives* with different surfaces — "Advanced" simply exposes more of §4.

**Simple public MVP** — the smallest model a general user needs:
- Age & horizon (current age, life expectancy, stop age).
- Income (a salary / primary income stream).
- Spending (base monthly/annual, in real terms).
- Savings & investments (one or a few investment accounts + an expected real return).
- Pension (a tax-advantaged account with an access age).
- Targets & basic outputs (stop age / FI target, net-worth path, simple shortfall/status).

**Advanced public mode** — opt-in depth for power users:
- Multiple accounts with distinct tax treatments (incl. ASK-style annual mark-to-market).
- Holding / business capital and distribution policy.
- Debt with amortization and cashflow impact.
- Life events (children, home purchase, sabbatical, inheritance).
- Custom withdrawal order and tax-aware withdrawal strategies.
- Snapshots, export/import, and scenario comparison.

**Internal / reference-only for now** — not for public exposure yet:
- Simon-specific named stress modifiers (e.g. `noBarma`).
- Exact personal/business configurations and named local programs.
- Experimental or unvalidated assumptions.

The internal/reference tier should be renamed or hidden behind presets before going public.

---

## 9. Invariants any public model must keep (already test-enforced)

- **No money creation** — `closing NW = opening NW + cashflow` for tax-free flows; deficits
  reduce capital or surface as `shortfallAmount` (multi-year + conservation suites).
- **No negative asset buckets**; debt/net worth may be negative.
- **Danish 27/42 share-income pool consumed once per year** — the low-rate share-income
  bracket is filled at most once per year, shared across holding distributions and realized
  depot gains (share-income / matrix / multi-year suites). This invariant is locale-specific
  today; it can later inspire a more general "shared allowance consumed once per period"
  primitive, but the test-enforced contract is currently the Danish pool specifically.
- **Deterministic persistence** — export/import + migration reproduce the projection exactly.
- **Rehydration safety** — corrupted/partial/legacy localStorage never blank-screens; no
  NaN/Infinity/unexpected-null in critical numeric fields.

These are the contracts a generalization effort must not regress.

---

## 10. Out of scope / open questions (for a later phase)

- Multi-currency and FX over time.
- Joint households (two earners, shared accounts) — today is single-person.
- Progressive/locale tax engines beyond the simplified two-bracket model.
- Region selection UX and a locale-pack registry.
- Whether the generic `Account` refactor is worth the churn vs. keeping the current fixed
  bucket structure — three invested buckets, a cash buffer, and ASK as a sub-account / tax
  treatment — with pluggable tax treatments (a smaller step).

---

*v1 — conceptual map only. No engine, UI, persistence, or test behavior is changed by this
document.*
