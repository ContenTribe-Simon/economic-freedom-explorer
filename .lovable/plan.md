
# MVP: Personligt økonomi- & pensionsværktøj

Dansk UI, lokal lagring (localStorage), scenarie-sammenligning og DK-realistisk skattemodel. Fokus på korrekt, gennemsigtig beregningsmotor før polish.

## 1. Datastruktur

Tre lag: **Inputs** (brugerens variable), **Assumptions** (skat/afkast/inflation), **Projection** (beregnet år-for-år).

```text
Scenario {
  id, name, createdAt, notes
  inputs: ScenarioInputs
  assumptionsOverride?: Partial<Assumptions>   // nedarver fra global
}

ScenarioInputs {
  person: { currentAge, lifeExpectancy = 95 }
  buckets: {
    free:    { balance, monthlyContribution, annualExtraContribution }
    pension: { balance, monthlyContribution, employerContribution }
    holding: { balance, expectedExitValue, exitYear, annualDistribution }
    debt:    { balance, interestRate, monthlyPayment }
  }
  income: {
    salaryNet, partTimeNetFromAge, partTimeAnnualNet,
    familyFundAnnual, familyFundUntilAge,
    statePensionFromAge = 67
  }
  spending: { desiredMonthlyNet, oneOffEvents: [] }   // events bruges i fuld version
  stopAge: number                                      // fuldtidsstop
  fullRetireAge: number                                // helt stop
}

Assumptions {
  realReturn: { free, pension, holding }
  inflation
  tax: {
    labor: { amBidrag: 0.08, bottomRate, topRate, topBracket, personalAllowance }
    capital: { shareLow: 0.27, shareHigh: 0.42, shareThreshold }
    pensionPayout: 0.40           // pensionsafgift v. udbetaling
    corporate: 0.22
    dividendFromHolding: { low: 0.27, high: 0.42, threshold }
  }
  statePensionAnnualNet
  realTermsMode: true             // alt vises i nutidskroner
}

YearRow {
  age, year
  openingBalances {free, pension, holding, debt}
  flows {
    contributions {free, pension, holding}
    income {salary, partTime, familyFund, statePension, holdingDistribution, pensionPayout}
    taxes  {labor, capital, pensionPayout, dividend}
    spending, debtInterest, debtPrincipal
    withdrawals {free, pension, holding}      // hvad der reelt blev hævet
  }
  closingBalances {free, pension, holding, debt}
  netWorth, shortfall (bool), monthlyGapAfterStop
}
```

## 2. Beregningslogik (årlig motor)

Pure funktion: `project(scenario, assumptions) → YearRow[]`. Ingen UI-afhængighed → let at unit-teste.

For hvert år fra `currentAge` til `lifeExpectancy`:

1. **Indtægter før stop**: løn (efter AM, bund/top, personfradrag), arbejdsgiverpension.
2. **Indtægter efter stopAge**: deltid indtil `fullRetireAge`, familiefond indtil `familyFundUntilAge`, holdingudlodning (beskattes som aktieindkomst, lav/høj sats), pensionsudbetaling fra `fullRetireAge` (40% afgift), folkepension fra `statePensionFromAge`.
3. **Holding-exit**: i `exitYear` lægges `expectedExitValue` til holding-balance (selskabsskat antages allerede afregnet, evt. justerbart).
4. **Forbrugsbehov** = `desiredMonthlyNet * 12` (i realværdi) + engangsevents.
5. **Cashflow-fald-igennem**:
   - Hvis indkomst-efter-skat ≥ forbrug → overskud → indbetales til free (eller pension hvis stadig arbejdende).
   - Hvis underskud → træk i prioriteret rækkefølge: **free → holdingudlodning → pension** (efter respektive skatter). Brugeren kan senere ændre rækkefølgen.
6. **Vækst**: alle balancer vokser med `realReturn` (efter inflation, da vi er i nutidskroner).
7. **Gæld**: rente tilskrives, månedlig ydelse trækkes fra free-cashflow.
8. **Shortfall**: når samlet kapital ikke kan dække forbrug → marker år, fortsæt med 0.

**DK-realistisk skat (MVP)**:
- Lønindkomst: AM-bidrag 8%, derefter progressiv (bund + top over topgrænse), personfradrag.
- Aktieindkomst (holdingudlodning + frie aktier): 27% under tærskel, 42% over.
- Pensionsudbetaling: flad 40% afgift (kan udvides til ratepension/livrente senere).
- Folkepension: indtastes som nettobeløb (samspil med pension er kompliceret → flagges i assumptions).
- Alle satser/grænser ligger i `Assumptions` og kan redigeres.

## 3. UI-struktur (MVP)

```text
/                       Dashboard (aktivt scenarie + KPI'er + graf)
/inputs                 Inputside (alle variable, grupperet)
/assumptions            Skatte-/afkast-/inflationsantagelser
/projection             År-for-år tabel (eksporterbar)
/scenarios              Scenarie-sammenligning (3-5 side om side)
```

Venstre sidebar med navigation + scenarie-vælger (dropdown + "nyt scenarie", "dupliker", "omdøb", "slet").

### Inputside (grupperet i kort)
- Person & alder
- Fri kapital
- Pension
- Holding (inkl. exit)
- Gæld
- Indkomst (løn, deltid, familiefond, folkepension)
- Forbrug & stopalder

### Dashboard / aktivt scenarie viser
- KPI-kort: Tidligste mulige stopalder, Kapital ved stopalder, Kapital ved 65, Kapital ved 95, Første shortfall-år, Månedligt hul efter stop, Robusthedsscore (simpel: andel af år uden shortfall + buffer ved 95).
- Graf: stacked area af free/pension/holding over tid + linje for forbrug.
- Banner hvis shortfall + forklaring.

### Scenarie-sammenligning
Tabel: scenarienavn × KPI'er. Highlight bedste/værste pr. række. Knap "dupliker som nyt scenarie".

### Assumptions-side
Alle skatteparametre, afkast, inflation, realterms-mode. Tydelig "Antagelser bag modellen" tekst med disclaimers.

## 4. Robusthedsscore (MVP-definition)
Simpel 0-100: 40 point for "ingen shortfall før 95", 30 for "kapital > 0 ved 95", 30 skaleret efter buffer (kapital ved 95 / årligt forbrug). Vises med farve.

## 5. Lagring
- `localStorage`-key `finance-tool.v1` med `{ scenarios[], assumptions, activeScenarioId }`.
- Eksport/import som JSON-fil (knap i header) → giver migration-vej til cloud senere.
- Ét seed-scenarie ("Base case") oprettes ved første besøg.

## 6. Teknisk

- React + TypeScript + Tailwind + shadcn (allerede i projektet).
- Beregningsmotor i `src/lib/finance/` som rene funktioner:
  - `tax.ts` (labor, capital, pensionPayout, dividend)
  - `cashflow.ts` (forbrug vs. indkomst, withdraw-prioritet)
  - `projection.ts` (hovedløkken)
  - `kpis.ts` (afled KPI'er fra YearRow[])
  - `defaults.ts` (DK-satser 2026 som startværdier)
- Vitest unit-tests for skat + projection (allerede vitest opsat).
- State: Zustand store + localStorage-persist; React Query ikke nødvendig endnu.
- Recharts til graf, shadcn `<Table>` til år-for-år.
- React Hook Form + Zod til inputs.
- Routing: tilføj de 5 ruter i `App.tsx`.

## 7. Eksplicit ude af MVP (gemmes til fuld version)
- Sensitivity sliders, stress-test-presets, livsbegivenhedstidslinje, snapshots over tid, cloud-sync/login, multi-valuta, nominel/real toggle pr. felt, samspilseffekter på folkepension.

## 8. Leverancerækkefølge
1. Typer + defaults + skattefunktioner + tests.
2. `projection.ts` + KPI'er + tests (verificér med håndregnet base case).
3. Zustand store + localStorage + seed-scenarie.
4. Layout med sidebar + scenarie-vælger.
5. Inputside + Assumptions-side.
6. Dashboard (KPI + graf) + Projection-tabel.
7. Scenarie-sammenligning.
8. Eksport/import JSON + disclaimers.
