# Personlig aktieindkomst v1 – plan

## Mål
Indfør én årlig personlig aktieindkomst-pulje, som holdingudlodning og realiserede depotgevinster deler 27/42 %-grænsen i. ASK forbliver helt separat (17 % lagerbeskatning). Default-adfærd uændret — alle eksisterende tests skal passere.

## Designprincipper
- **Backwards compat first**: `depotTax.method = "legacy"` er default. Når legacy gælder, kører projection præcis som i dag (også 80.000 brutto → 21.600 skat → 58.400 netto for holding-only).
- **Én pulje, deterministisk rækkefølge**: holding bruger lav-sats-grænsen først, depotgevinst får resterende. Ingen optimering.
- **ASK rør jeg ikke**: ASK-skat, audit, withdrawalStrategy og tests forbliver uændrede. ASK-afkast/-udtræk indgår aldrig i den fælles pulje.
- **Refaktor med minimal blast radius**: ekstrahér en `applyShareIncomeTax(ctx, gross)`-helper og brug den både for holding (alle tre eksisterende kald: planned/extra) og for depot-realisation. Når depot-skat er legacy og ingen depotgevinst findes, er ctx tom og helperen returnerer nøjagtigt samme tal som `shareTax(...)` i dag.

## Datamodel (types.ts)
- `FreeBucketInputs.depotTax?: DepotTaxInputs`
  ```
  { enabled: boolean; method: "legacy" | "realizationSimple" | "annualShareIncomeTax";
    costBasis: number | null; showDeferredTax: boolean }
  ```
  Default undefined ⇒ legacy. `costBasis === null` ⇒ initial cost basis = almindeligt depot markedsværdi (= free.balance − ask.currentValue).
- `YearFlows.shareIncome?: ShareIncomeTaxYearAudit` med: holdingGross, extraHoldingGross, realizedDepotGain, annualDepotTaxable, totalShareIncome, taxedAtLow, taxedAtHigh, taxLow, taxHigh, taxTotal, thresholdUsedByHolding, thresholdRemainingForDepot.
- `YearFlows.depot?: DepotYearAudit` med primo/ultimo værdier, costBasis primo/ultimo, urealiseret gevinst, latent skat, brutto salg, realiseret gevinst, skat, netto.

## Projection.ts ændringer
1. **State**: ud over `bal.free` (= almindeligt depot ekskl. ASK) trackes `depotCostBasis` (kun når depotTax aktiv). Init = `costBasis ?? bal.free`.
2. **Per-år context**:
   ```
   ctx = { threshold, lowRate, highRate, used: 0 }
   applyShareIncomeTax(ctx, gross) -> { tax, net, atLow, atHigh }
   ```
   Holding-planned + holding-extra køres gennem ctx (legacy-resultat er identisk, fordi de allerede deler `shareTax`-logikken — og ctx.used akkumuleres på tværs af kilder).
3. **Indskud til depot**: når depotTax aktiv, `depotCostBasis += freeContribution_til_depot` (ASK-delen påvirker ikke kostpris).
4. **Afkast**: depotCostBasis ændres ikke ved afkast. Når `method = annualShareIncomeTax`, kør positivt depotafkast gennem ctx; træk skat fra bal.free.
5. **Udtræk fra fri kapital**: `withdrawFromBucket("free", …)` udvides så depot-delen gross-up'es når `method = "realizationSimple"`:
   - gainRatio = max(0, (bal.free − costBasis)) / bal.free
   - Solve grossSale så `grossSale − tax(gainRatio·grossSale, ctxRemaining) = netNeeded` (bisection, 30 iter, eps=1 kr).
   - realizedGain = grossSale·gainRatio → kør gennem ctx.
   - costBasis reduceres proportionalt: `costBasis *= (1 − grossSale/depotBeforeSale)`, clampes ≥ 0.
   - ASK-grenen er uændret — ASK-udtræk udløser aldrig aktieindkomstskat.
6. **Withdrawal strategy samspil**: bevarer eksisterende depotFirst/askFirst/proRata. For proRata gross-up'es kun depot-delen.

## Tax helper (tax.ts)
Tilføj `applyShareIncomeTax(ctx, gross)` og `shareTaxForGainGivenContext(ctx, gain)`; eksisterende `shareTax()` røres ikke, så øvrige callsites er uændrede.

## UI
- **Inputs.tsx**: ny mini-sektion under "Fri/investerbar kapital" der viser depot ekskl. ASK + (når depotTax.enabled) felt for kostpris, urealiseret gevinst og latent skat. Microcopy om kostpris=depotværdi.
- **Assumptions.tsx**: omdøb sektion til "Personlig aktieindkomst & holding" + forklarende tekst. Ny "Almindeligt frit depot"-blok med method-vælger (legacy/realizationSimple/annualShareIncomeTax) og note om prioriteringsrækkefølge.
- **Projection.tsx (AuditPanel)**: ny "Personlig aktieindkomstskat"-blok (kilder, lav/høj fordeling, skat). Ny "Almindeligt frit depot"-blok (primo, kostpris, urealiseret, brutto salg, realiseret gevinst, skat, netto, ultimo) — vises kun når method ≠ legacy.

## Persistens
- `cloud/models.ts`: serialisér `free.depotTax` + per-år shareIncome/depot audit; tolerér manglende felter ved indlæsning.
- Snapshots: ingen kode­ændring nødvendig — `resolvedInputs` + `years` indeholder allerede de nye felter via types.
- JSON import/export: samme.

## Scenarier
DepotTax følger almindelig scenario-arkitektur. Linked stress-tests bruger resolved basecase som i dag. Manuel redigering eskalerer til custom via eksisterende mekanisme — ingen ny modal-logik.

## FIRE / Lande / Dashboard / Report
Ingen ændringer — de bruger projection-output (closing.free, kpis). Lavere fri kapital pga. depot-skat propagerer automatisk.

## Tests (nyt: `share-income-tax-v1.test.ts`)
A. Legacy-default = uændret resultat (smoke + holding 80k → 21.600 skat).
B. Fælles grænse: holding spiser hele lav-grænse → depotgevinst beskattes 42 %.
C. Realisation: costBasis=marketValue ⇒ gainRatio=0, ingen skat.
D. Realisation: costBasis=60k/market=100k ⇒ gainRatio=0,4; salg 10k brutto giver 4k gevinst og skat efter ctx.
E. Gross-up: netNeeded=50k med gainRatio>0 giver grossSale så netto efter skat ≈ 50k (±1 kr).
F. Kostpris reduceres proportionalt; aldrig negativ.
G. annualShareIncomeTax: positivt afkast beskattes; negativt giver 0 skat (ingen carryforward i v1).
H. ASK-separation: ASK-vækst/-udtræk påvirker ikke ctx.totalShareIncome.
I. WithdrawalStrategy: depotFirst/askFirst/proRata — kun depot-delen beskattes; ask ultimo + depot ultimo = closing.free.
J. Persistens: roundtrip JSON med/uden depotTax; gamle modeller indlæses uden crash.
K. Regression: alle eksisterende suites passerer (mål: 288/288 → ≥288 + nye).

## Acceptkriterier
Som specificeret i opgaven §19.

## Eksplicitte forenklinger (vil blive nævnt i microcopy)
- Holding bruger lav-grænsen før depot (ingen optimerings-strategi i v1).
- Latent skat på depot vises som indikator, ikke som skattegæld.
- Negativt depotafkast giver ingen carryforward i annual-mode (v1).
- Ingen fond/udbytte/kildeskat-håndtering.

Bekræft planen, så implementerer jeg.
