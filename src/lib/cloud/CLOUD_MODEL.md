# Cloud persistence — source of truth & garantier

Dette dokument beskriver hvordan Supabase-laget bruges som save/load for
modellen, og hvilke regler der gælder for data-konsistens. Cloud er **valgfrit
overlay**. Appen virker 100% uden login.

### Valgfri konfiguration (Phase 7-hærdning, 2026-07-06)

"Valgfrit overlay" gælder også selve konfigurationen: mangler
`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`, er
`supabase`-klienten (`src/integrations/supabase/client.ts`) **`null`** i stedet
for at `createClient()` kaster ved module-load (det blankede hele appen,
inkl. den offentlige flade, fordi `AuthProvider` omslutter alle ruter).
Regler for forbrugere:

- Tjek `isSupabaseConfigured` (eller `supabase !== null`) før brug.
- `AuthProvider` lander straks i logget-ud-tilstand uden klient; `signOut` er no-op.
- `src/lib/cloud/models.ts`-funktionerne kaster en klar dansk fejl via
  `requireSupabase()` i stedet for at dereferere null.
- Login-siden viser en rolig note og deaktiverer formularerne.

Reguleret af `src/hooks/__tests__/supabase-optional.test.tsx`.

### Nedbrud og samtidighed (Phase 12-hærdning, 2026-07-08)

- **`loadModel` er lokal-først i fejlrækkefølgen:** `last_opened_at`-opdateringen er ren
  bogføring og kører EFTER at modellen er lagt i den lokale store. Fejler den (typisk
  mistet forbindelse midt i en session), fejler indlæsningen IKKE — modellen ER indlæst.
- **0-rækkers skrivninger er fejl, ikke succes:** PostgREST rapporterer en UPDATE, der ikke
  matcher nogen række, som succes med 0 rækker. `overwriteModel` og `renameModel` tjekker
  rækkeantallet og kaster en dansk fejl, hvis modellen er slettet i en anden session.
- **Optimistisk samtidighed på overskriv:** `overwriteModel(id, expectedUpdatedAt)` tager
  `updated_at` fra den liste brugeren ser (Cloud-siden sender den altid). Matcher tokenet
  ikke rækkens nuværende `updated_at`, rammer opdateringen 0 rækker og afvises med besked
  om at opdatere listen — sidste-skriver-vinder-tab af data kræver nu et bevidst nyt forsøg.
  PRÆCIS udløsermekanik (migration `20260709090000`): `updated_at` er server-ejet og
  flyttes af triggeren KUN når `data_json` reelt ændres (`IS DISTINCT FROM`). At åbne en
  model (`last_opened_at`-bogføring) eller omdøbe den flytter IKKE tokenet — kun et reelt
  indholds-gem fra en anden session udløser altså en konflikt. (Konsekvens: "Sidst gemt"
  følger indholdet, ikke omdøbninger.) Klienten sender aldrig selv `updated_at`.
  Cloud-sidens Overskriv-knap er deaktiveret mens listen genindlæses, så et forældet token
  ikke kan sendes i kapløb med `refresh()`.
  **Kan ikke enhedstestes:** selve trigger-adfærden kræver den rigtige database — verificér
  ved deploy af migrationen (åbn model i fane A, overskriv fra fane B med gammel liste:
  skal LYKKES; gem indhold i A, overskriv fra B: skal afvises).
- **Netværksfejl får rolig dansk offline-besked** via `cloudErrorMessage()` (Cloud-sidens
  catches): "Ingen forbindelse til cloud lige nu. Dine data ligger stadig lokalt på denne
  enhed." Den offentlige flade rører aldrig cloud og er upåvirket af nedetid.

Reguleret af `src/lib/cloud/__tests__/cloud-offline-robustness.test.ts`.

## 1. Source of truth

| Lag | Rolle |
|-----|-------|
| **Lokal Zustand store** (`useFinanceStore`) | **Primær runtime-state.** Alle beregninger, scenarier, snapshots og rapporter læser herfra. |
| **`finance_models.data_json`** | **Primær cloud source of truth** for hele modellen, inkl. `scenarios`, `assumptions`, `activeScenarioId`, `snapshots`, `metadata`, `modelVersion`. Serialiseres via `useFinanceStore.exportJson()` og deserialiseres via `importJson()`. |
| **`finance_snapshots`** | Kun **supplerende indeks/metadata** (snapshot-navn, note, scenarie-type, oprettelsestidspunkt). Bruges ikke til beregninger eller rapporter. Kanoniske snapshot-tal lever i `finance_models.data_json.snapshots[]`. |

### Sync-regel

Snapshots gemmes inde i `data_json` ved `saveAsNewModel` / `overwriteModel`.
`finance_snapshots`-tabellen er forberedt til fremtidigt brug (snapshot-historik
på tværs af modeller) og må aldrig være eneste kilde til snapshot-data.

RLS-hærdning (Phase 7, migration `20260706120000`): `model_id` skal, når den er
sat, pege på en `finance_models`-række ejet af samme bruger — INSERT/UPDATE
afvises ellers. Pinned af `src/lib/cloud/__tests__/snapshots-rls-migration.test.ts`
(tekstuel kontrol af migrationskæden; verifikation mod den DEPLOYEDE database er
et manuelt trin i Supabase-dashboardet).

## 2. Roundtrip-garanti

`lokal model → save → load → exportJson → importJson` skal bevare 1:1:

- `scenarios[]` (inkl. id, navn, inputs, modifiers, baseScenarioId,
  baseScenarioName, manuallyEdited, type: `base` / `linked_stress_test` / `custom`)
- `assumptions`
- `activeScenarioId`
- `snapshots[]` (inkl. snapshotId, snapshotName, notes, frosne kpis,
  frosne years/projections, scenarioType)
- `modelVersion`, `modelRelease`, `metadata`

Verificeret af `cloud-stabilization.test.ts`.

## 3. Snapshot-frysning

- Snapshots bygges af `buildSnapshot()` med `structuredClone` — ingen delte
  referencer med live state.
- `loadModel()` kalder `importJson()` som **sætter snapshots direkte** uden at
  kalde `buildSnapshot` eller `project()` igen. Snapshots genberegnes aldrig.
- Rapport-siden læser fra `state.snapshots` når `?snapshot=…` er sat —
  ikke fra det aktive scenarie.

## 4. RLS

Alle tre tabeller har RLS aktiveret med ejerbegrænsning via `auth.uid()`:

| Tabel | SELECT | INSERT | UPDATE | DELETE |
|-------|--------|--------|--------|--------|
| `profiles` | `auth.uid() = id` | `auth.uid() = id` | `auth.uid() = id` | — (ingen policy) |
| `finance_models` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` |
| `finance_snapshots` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` | `auth.uid() = user_id` |

Resultat: en bruger kan udelukkende læse, oprette, ændre og slette egne
modeller og snapshots.

## 5. Lokal fallback

Cloud er aldrig påkrævet. Følgende virker uden login:

- Beregningsmotor (`projection`, `kpis`, `stress`, `sanity`)
- Snapshots (`buildSnapshot`, gemt i Zustand-persist `finance-tool.v1`)
- Rapport (`/report` og `/report?snapshot=…`)
- Lokal eksport/import af JSON

Cloud-modulet (`src/lib/cloud/models.ts`) bruges kun når brugeren aktivt
trykker Gem/Indlæs på `/cloud`.

## 6. Konflikthåndtering

`loadModel` overskriver lokal state — men kun når brugeren har trykket
"Indlæs" og bekræftet i `AlertDialog` på `/cloud`. Der findes **ingen
automatisk merge eller auto-load** ved app-start. Brugeren har tre eksplicitte
veje:

1. **Fortsæt lokalt** — gør ingenting på `/cloud`.
2. **Indlæs cloud** — vælg model + bekræft i dialog.
3. **Gem lokal som ny cloud-model** — `Gem som ny`-knap på `/cloud`.

## 7. Versionering

- `MODEL_VERSION` og `MODEL_RELEASE` skrives med ved hver `saveAsNewModel` /
  `overwriteModel` så vi kan migrere/inspicere senere.
- `importJson` accepterer legacy-data uden `type`-felt på scenarier
  (klassificeres via `classifyLegacyScenario`) og uden `snapshots`-array.
