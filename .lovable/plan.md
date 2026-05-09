## Mål

Indføre en tydelig scenarie-arkitektur med tre typer (`base`, `linked_stress_test`, `custom`) hvor linked stress-tests beregnes dynamisk fra aktuel basecase + modifiers — så ændringer i basecase automatisk slår igennem, mens manuelle ændringer eskalerer scenariet til `custom`.

## Datamodel (`src/lib/finance/types.ts`)

Udvid `Scenario`:
```ts
type ScenarioType = "base" | "linked_stress_test" | "custom";

interface Scenario {
  // eksisterende felter...
  type?: ScenarioType;          // default: "custom" for legacy uden modifiers, "base" hvis ingen baseScenarioId
  manuallyEdited?: boolean;     // sat når bruger eskalerer fra linked → custom
  changedFields?: string[];     // valgfri sporing
}
```

Bump `MODEL_VERSION` ikke (ingen breaking change i beregningsmotor) men tilføj migration i persist.

## Modifier-katalog (`src/lib/finance/stress.ts`)

Hver `StressModifier` får et eksplicit `allowedFields: string[]` (dot-paths) udover `apply`:

| Modifier | Tilladte felter |
| --- | --- |
| `noBarma` | `inputs.holding.balance`, `inputs.holding.expectedExitValue`, `inputs.holding.annualDistribution` |
| `noPartTime` | `inputs.income.partTime.grossAnnual`, `inputs.income.partTime.netMonthly`, `inputs.fullRetireAge` |
| `lowReturn` | `assumptionsOverride.realReturn.free/.pension/.holding` |
| `higherSpending` | `inputs.spending.desiredMonthlyNet` |
| `noFolkepension` | `inputs.income.statePension.mode` |

Tilføj helper `resolveScenario(scenario, baseScenario)` som for `linked_stress_test`:
1. Tager dyb kopi af `baseScenario`
2. Bevarer scenarie-ID/navn/type/modifiers
3. Anvender hver aktiv modifier via `apply`

## Beregning (`projection.ts` / `kpis.ts`)

**Ingen ændring i selve motoren.** I stedet wrapper på indgangen — alle steder der i dag kalder `project(scenario, assumptions)` skal i stedet hente det resolvede scenarie:

```ts
const resolved = resolveScenarioForCompute(scenario, scenarios);
const years = project(resolved, assumptions);
```

Tilføj én ny helper i `stress.ts` (eller ny `resolve.ts`) — opdater call sites:
- `Dashboard.tsx`
- `Projection.tsx`
- `Scenarios.tsx`
- `Report.tsx`
- evt. tests

## Manuel redigering eskalering

`Inputs.tsx` (og `Assumptions.tsx`) — wrap input-handlers så ændring på et `linked_stress_test` udløser bekræftelses-dialog:

> "Dette er et linket stress-test scenarie. Hvis du ændrer dette felt, bliver scenariet konverteret til et manuelt scenarie."
> [Konvertér til custom] [Annullér]

Konvertering sker via store-action `convertToCustom(id)` der:
1. Materialiserer det resolvede scenarie (kopierer alle felter ind som concrete values)
2. Sætter `type = "custom"`, `manuallyEdited = true`
3. Bevarer `baseScenarioId`/`baseScenarioName` til reference

Whitelist: hvis det ændrede felt er i modifierens `allowedFields`, blokér ændringen helt (eller tillad og opdater stress-konfigurationen — vi vælger blokér, da modifier-værdier er deterministiske).

## Store-actions (`src/store/financeStore.ts`)

Nye/ændrede actions:
- `convertToCustom(id)` — materialiser linked → custom
- `rebaseOnCurrentBase(id)` — for custom: kopier basecase-felter ind igen, behold modifiers, sæt `manuallyEdited = false`, type=`linked_stress_test` hvis modifiers findes
- `resetToCleanStressTest(id)` — drop alle ad-hoc ændringer, bliv `linked_stress_test`
- Migration ved persist hydrate: scenarier uden `type` får:
  - `type = "base"` hvis `!baseScenarioId && !modifiers`
  - `type = "linked_stress_test"` hvis modifiers && passer med modifier whitelist (deep-equal mod resolved)
  - ellers `type = "custom"`, `manuallyEdited = true`

## UI

**Sidebar / Scenarie-vælger (AppShell)**: badge ved hvert scenarie:
- "Base" / "Linket stress-test" / "Custom"

**Scenarios.tsx**: 
- Header-cellen viser badge + kort tekst:
  - linked: "Beregnes ud fra aktuel basecase + modifier."
  - custom: "Manuelt scenarie – følger ikke basecase."
- For custom: knapper "Rebasér på basecase" / "Nulstil til stress-test" / "Behold"

**Inputs.tsx**: Banner øverst når aktivt scenarie er `linked_stress_test`:
> "Linket stress-test. Felter låst og styres af basecase + modifier."

Inputs disables for ikke-allowed-felter; allowed-felter er også låst (deterministiske).

For `custom`: lille banner med rebase/reset-handlinger.

## Eksport/import (`financeStore.exportJson` / `importJson`)

`Scenario` eksporteres som-er — de nye felter (`type`, `manuallyEdited`, `changedFields`) følger med naturligt. Validering i `importJson` accepterer manglende felter (kører migration igen).

## Tests (`__tests__/scenario-types.test.ts` ny)

1. Linked "uden Barma" + ændring af basecase `desiredMonthlyNet` 21000 → 15000 → resolved scenarie bruger 15000 og `holding.balance === 0`.
2. Linked "uden deltid" + ændring af basecase `income.partTime.grossAnnual` (men noPartTime nuller den, så test på et andet felt fx `salary`) → resolved følger ny basecase.
3. `convertToCustom` på et linked scenarie → type=`custom`, manuallyEdited=true, efterfølgende basecase-ændring påvirker IKKE scenariet.
4. Eksport→import bevarer `type`, `baseScenarioId`, `modifiers`, `manuallyEdited`.
5. Migration: legacy scenarie uden `type` men med modifiers og kun modifier-felter ændret → klassificeres som `linked_stress_test`.
6. Migration: legacy scenarie med modifiers + ekstra ændringer → `custom` + manuallyEdited.

## Filer

| Fil | Ændring |
| --- | --- |
| `src/lib/finance/types.ts` | Tilføj `ScenarioType`, udvid `Scenario` |
| `src/lib/finance/stress.ts` | Tilføj `allowedFields` pr. modifier, `resolveScenarioForCompute`, classify-helper til migration |
| `src/store/financeStore.ts` | Migration, nye actions, applyStressModifier markerer som linked_stress_test |
| `src/pages/Scenarios.tsx` | Badges, custom-handlinger, brug resolved scenarie til KPI |
| `src/pages/Dashboard.tsx` | Brug resolved scenarie |
| `src/pages/Projection.tsx` | Brug resolved scenarie |
| `src/pages/Report.tsx` | Brug resolved scenarie |
| `src/pages/Inputs.tsx` | Eskalerings-dialog, lock UI for linked, banners |
| `src/components/AppShell.tsx` | Badge i scenarie-listen |
| `src/lib/finance/__tests__/scenario-types.test.ts` | Ny testsuite |
| `src/lib/finance/MODEL.md` | Dokumentér scenarie-typer |

## Garantier

- Ingen ændring i `projection.ts`, `kpis.ts`, `tax.ts`, `sanity.ts`.
- Ingen ændring i shortfall/holding/pension/score-logik.
- Eksisterende scenarier bevares via migration.
- Alle eksisterende tests skal fortsat passere.
