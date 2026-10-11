# Finansmodel — teknisk note

Kort overblik over beregningsflowet i `src/lib/finance/`. Bruges som internt referencekort for fremtidige udvidelser.

## Scenarie-typer

Hvert `Scenario` har en `type`:

| Type | Adfærd |
| --- | --- |
| `base` | Uafhængigt basisscenarie. Frit redigerbart. |
| `linked_stress_test` | Linket til et `baseScenarioId`. Beregnes dynamisk via `resolveScenario(scenario, scenarios)` som *aktuel basecase + aktive modifiers*. Egne `inputs` er kun cache. Manuel ændring eskalerer til `custom`. |
| `custom` | Uafhængigt scenarie (typisk eskaleret fra et linket stress-test eller oprettet manuelt). `manuallyEdited=true` markerer at brugeren har ændret noget. Følger ikke længere basecase. |

Hver `StressModifier` i `stress.ts` deklarerer eksplicit `allowedFields` — det dokumenterer hvilke felter modifieren styrer. Andre felter skal komme fra basecase.

Helpers:
- `resolveScenario(scenario, scenarios)` — bruges af alle compute call sites (Dashboard, Projection, Report, Scenarios) før `project()`.
- `classifyLegacyScenario(scenario, base)` — bruges af persist-migration v11 og `importJson` til at klassificere scenarier uden `type`-felt.

Store-actions: `convertToCustom(id)`, `rebaseOnCurrentBase(id)`, `resetToCleanStressTest(id)`.



## Filstruktur

| Fil | Ansvar |
| --- | --- |
| `types.ts` | Centrale typer: `ScenarioInputs`, `Assumptions`, `YearRow`, `KPIs`, `LifeEvent`, `MODEL_VERSION`, `ModelExport`. |
| `defaults.ts` | Standard-input + `makeBaseScenario()` (motorens faste referencescenarie, som testene regner på) og `makeNewUserInputs()`/`makeNewUserScenario()` (neutral start for en ny bruger: holding slået fra, ingen andre indtægter). |
| `otherIncome.ts` | "Anden indtægt": `otherIncomesOf()` (læser også gamle familiefond-felter), `normalizeIncomeInputs()`, `otherIncomeForAge()`, `otherIncomeNetOf()`. |
| `holdingToggle.ts` | Holding til/fra: `isHoldingEnabled()` og `withHoldingToggleApplied()`. |
| `tax.ts` | Skatteberegninger (arbejdsindkomst, aktie, pension). Rene funktioner. |
| `projection.ts` | Hovedmotor: bygger år-for-år `YearRow[]` ud fra scenarie + antagelser. |
| `kpis.ts` | Aggregerer `YearRow[]` til `KPIs` (robusthed, antagelsessikkerhed, breakdowns). |
| `sanity.ts` | Brugervendte advarsler (vises i dashboard). |
| `integrity.ts` | Interne integritets-checks brugt i tests/debug — ingen UI-effekt. |
| `stress.ts` | Stress-test modifiers (no Barma, no part-time …) + dedup-logik. |

## Beregningsflow

```text
ScenarioInputs ──► mergeAssumptions ──► project()  ──►  YearRow[]
                                                │
                                                ├─► deriveKPIs()  ──►  KPIs (dashboard)
                                                ├─► sanityChecks() ──► SanityCheck[] (UI)
                                                └─► runIntegrityChecks() (tests/debug)
```

1. **Input-transformation** sker udelukkende i `projection.ts` — ét sted hvor brutto/netto, skat, opsparing, udtræk og saldi konverteres til en sekvens af `YearRow`.
2. **Scenarier** påvirker kun input (`ScenarioInputs`) eller `assumptionsOverride`. Stress-modifiers i `stress.ts` muterer en kopi af scenariet og lader resten af motoren være urørt.
3. **Pension**: Ratepension udbetales over `ratePensionPayoutYears` fra `payoutFromAge`. Livsvarig livrente kører som en stream uden saldo. Ekstra pensionsudtræk ved shortfall registreres i `pensionExtra` og lægges sammen i `pensionPayoutNet`.
4. **Holding**: Planlagt udlodning (`holdingPlanned`) + evt. ekstra udtræk (`holdingExtra`) → `holdingDistributionNet`. Holdinggæld kan finansieres af holdingkapital, privat cashflow, ekstern, exit eller display-only.
   - **Til/fra** (`holding.enabled`, 2026-10-11): `false` betyder ingen holding. `projectWithStopAge`, `computeFireAnalysis`, `deriveKPIs` og `sanityChecks` læser inputs gennem `withHoldingToggleApplied()`, som da nulstiller saldo, exit og udlodning og udelader holdinggæld (og hæftelser koblet til den) samt holding-livsbegivenheder. De indtastede tal bliver liggende i inputs. Mangler feltet (alle modeller fra før), er holding slået til, og objektet sendes uændret videre. Testet som "slået fra = samme model uden holding" i `other-income-holding-toggle.test.ts`.
4b. **Anden indtægt** (`income.otherIncomes`, 2026-10-11, afløser familiefond): en liste af poster med navn, beløb pr. år, fra/til alder (udbetales når `fromAge <= alder < untilAge`) og beskatning. `"net"` lægges direkte til (også et negativt beløb, som det gamle familiefond-felt tillod); `"gross_labor"` beskattes med `laborTax()` for sig selv (samme forenkling som deltid brutto), og skatten indgår i årets `taxes`. Summen er `flows.otherIncomeNet`. Gamle modeller med `familyFundAnnualNet`/`familyFundUntilAge` læses som én netto-post fra alder 0 til den gamle slutalder, hvilket regner præcis som den gamle formel; store v18 og `importJson` migrerer dem. Frosne årsrækker med `familyFundNet` læses via `otherIncomeNetOf()`, og en gemt antagelsessikkerhed for `familyFund` gælder for `otherIncome`.
5. **Opsparing**: Tre logikker — `planned`, `cashflow`, `hybrid`. `investedAmount` = faktisk lagt i fri kapital. `unallocatedCashflow` = positivt overskud der ikke er investeret.
6. **Cashflow** og **nettoformue** beregnes pr. år; `cashflowSurplus` kan være negativ (shortfall).
7. **Scorekort** (`kpis.ts`):
   - *Finansiel robusthed* er failure-driven: cashflow-shortfall og missed minimumsmål capper scoren hårdt.
   - *Antagelsessikkerhed* afledes af `confidence` på scenariet og påvirker IKKE år-for-år beregningen.

## LifeEvents (forberedt, ikke aktiv)

`ScenarioInputs.lifeEvents?: LifeEvent[]` er en placeholder for fremtidige bolig/børn/FIRE-moduler. Beregningsmotoren ignorerer feltet bevidst. Når events skal aktiveres:

1. Læg en transformation i `projection.ts` lige efter at årets indkomst/forbrug er sat — fx en helper `applyLifeEvents(year, events)`.
2. `LifeEvent.type` afgør hvilken bucket der påvirkes (`income`/`expense` → cashflow, `asset`/`liability` → opening saldi).
3. `LifeEvent.confidenceKey` kan kobles på antagelsessikkerheds-vægtningen.
4. Tilføj UI under Variabler eller en ny "Livsfaser" side — uden at røre selve motoren.

## Persistens & versionering

- `MODEL_VERSION` (i `types.ts`) bumpes når data-skemaet ændres.
- `ModelExport` er det stabile eksport/import-skema (`exportJson` i `financeStore.ts`).
- Hver `Scenario` har `createdAt`/`updatedAt`/`metadata` — klar til senere migration mod Supabase (én tabel pr. scenarie + én pr. assumptions).
- Lokalt bruger vi fortsat `zustand/persist` med `migrate()` for opadkompatibilitet (v18: familiefond → `otherIncomes`).
- Hver migreringsblok i `migrate()` kører kun på data gemt før dens version (`if (version < N …)`); kun rene "udfyld hvis mangler"-normaliseringer kører altid. Før v18 var blokkene ugatede, så f.eks. v8-genopbygningen af `free`/`pension` kørte ved hvert versionsskift og smed nyere felter væk (ASK, depotskat, stopregel).
- `MODEL_VERSION` er 2 fra 2026-10-11 (`otherIncomes`, `otherIncomeNet`, `holding.enabled`).

## Hvad senere skal til Supabase

| Lokal | Supabase-tabel (forslag) |
| --- | --- |
| `scenarios[]` | `scenarios(id, user_id, name, inputs jsonb, modifiers jsonb, metadata jsonb, created_at, updated_at)` |
| `assumptions` | `user_assumptions(user_id, payload jsonb, updated_at)` |
| `activeScenarioId` | `user_settings(user_id, active_scenario_id)` |
| Eksport-blob | `model_snapshots(user_id, model_version, payload jsonb, created_at)` |

RLS skal bruges fra dag ét — bruger må kun læse/skrive egne rækker.
