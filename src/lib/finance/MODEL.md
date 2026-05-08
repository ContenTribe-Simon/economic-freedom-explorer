# Finansmodel — teknisk note

Kort overblik over beregningsflowet i `src/lib/finance/`. Bruges som internt referencekort for fremtidige udvidelser.

## Filstruktur

| Fil | Ansvar |
| --- | --- |
| `types.ts` | Centrale typer: `ScenarioInputs`, `Assumptions`, `YearRow`, `KPIs`, `LifeEvent`, `MODEL_VERSION`, `ModelExport`. |
| `defaults.ts` | Standard-input + `makeBaseScenario()`. |
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
- Lokalt bruger vi fortsat `zustand/persist` med `migrate()` for opadkompatibilitet.

## Hvad senere skal til Supabase

| Lokal | Supabase-tabel (forslag) |
| --- | --- |
| `scenarios[]` | `scenarios(id, user_id, name, inputs jsonb, modifiers jsonb, metadata jsonb, created_at, updated_at)` |
| `assumptions` | `user_assumptions(user_id, payload jsonb, updated_at)` |
| `activeScenarioId` | `user_settings(user_id, active_scenario_id)` |
| Eksport-blob | `model_snapshots(user_id, model_version, payload jsonb, created_at)` |

RLS skal bruges fra dag ét — bruger må kun læse/skrive egne rækker.
