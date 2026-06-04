# ASK (Aktiesparekonto) — forberedelses-note (ASK v0)

Status: **Ikke implementeret.** Denne note dokumenterer analyse + integrationsdesign,
så ASK senere kan tilføjes uden at ændre eksisterende beregninger.

## 1. Hvor fri kapital lever i dag

| Område | Fil:linje | Hvad sker der |
| --- | --- | --- |
| Init af saldo | `projection.ts:237` | `bal.free = inp.free.balance` |
| Planlagt opsparing | `projection.ts:465–486` | `freeContribution` lægges til `bal.free` |
| Shortfall-udtræk | `projection.ts:46–50` (`withdrawFromBucket("free")`) | Hævning fra `bal.free` er **antaget skattefri** (`gross = net`, `tax = 0`) |
| Vækst | `projection.ts:509–516` | `growth.free = bal.free * a.realReturn.free` — **brutto realafkast, ingen skat trækkes** |
| Buffer (separat) | `projection.ts:240`, `454–460` | Kontant buffer — ingen afkast, kun nødudtræk |
| Nettoformue | `projection.ts:522` | `free + pension + holding + buffer − debt` |
| FIRE | `lib/finance/fire.ts` | Bruger projection-output (`closing.free`) — rører ikke fri-kapital direkte |
| Lande | `lib/finance/country.ts` | Bruger samme projection-output |
| UI | `pages/Dashboard.tsx`, `Projection.tsx`, `Report.tsx`, `Snapshots.tsx`, `Inputs.tsx` | Læser `free`-feltet fra `YearRow.closing` / `flows` |

## 2. Skat på fri kapital i dag

- **Realafkast er brutto.** `defaults.ts:4` sætter `realReturn.free = 0.05`.
  Der trækkes **ingen lagerskat / aktieskat** løbende på `bal.free`.
- **Udtræk fra fri kapital er skattefrit** i modellen (`withdrawFromBucket` `bucket==="free"`
  returnerer `tax: 0`, `gross = net`). Dvs. fri kapital opfører sig som "allerede beskattede midler"
  med fuldt brutto realafkast — en bevidst MVP-forsimpling (se kommentar i `tax.ts:grossFromFreeForNet`).
- **Holding** beskattes ved udlodning (`shareTax`), **pension** ved udbetaling (`pensionPayoutTax`).
  Disse spor er allerede korrekt adskilt fra fri kapital.

Konsekvens: når ASK indføres med lagerbeskatning, skal vi **ikke** ændre den eksisterende
fri-kapital-bucket — ellers risikerer vi dobbeltbeskatning eller stille regression i
robusthed / FIRE-tal for alle gamle scenarier.

## 3. Integrationsdesign for ASK (senere prompt)

Fri kapital opdeles i tre delkonti, men **kun hvis ASK-data er udfyldt**:

```
free (sum)
├── ask           // ny: lagerbeskattet
├── depot         // = eksisterende `free.balance` minus ASK
└── cashBuffer    // uændret (separat felt allerede)
```

Forslag til `FreeBucketInputs`-udvidelse (optional felter — bagudkompatibelt):

```ts
ask?: {
  enabled: boolean;
  currentValue: number;        // primo-saldo
  contributionRoom: number;    // resterende indskudsrum
  annualContributionLimit: number;
  taxRate: number;             // ASK-sats (i dag 17 %)
  autoFillFirst: boolean;      // ny opsparing → ASK først indtil loftet
  // realReturn arves fra assumptions.realReturn.free
}
```

Projection-flow (ikke implementeret endnu):

1. Splittes kun hvis `inp.free.ask?.enabled === true`. Ellers eksisterende sti uændret.
2. Allokering af `freeContribution`: hvis `autoFillFirst` og `contributionRoom > 0`,
   gå til ASK først (op til årets indskudsrum), resten til depot.
3. Vækst: `growthASK = askValue * realReturn.free`. Lagerskat trækkes ultimo:
   `askTax = (closingASK − openingASK) * ask.taxRate` (kun positiv difference).
4. Udtræk-rækkefølge ved shortfall: ASK før depot (mindre fremtidig lagerskat på det udtagne)
   — eller styres via ny preference. **Begge bør være eksplicit konfigurerbart.**
5. `closing.free = closingASK + closingDepot`. Eksisterende `closing.free`-konsumenter
   behøver så ingen ændring.

## 4. Risiko for regression

- **Vækst-stien** (`projection.ts:509–516`): hvis ASK-skat trækkes på hele `bal.free`
  i stedet for kun ASK-andelen → systematisk underestimering for alle eksisterende scenarier.
  → Gate al ASK-logik bag `inp.free.ask?.enabled`.
- **Withdraw-stien** (`withdrawFromBucket "free"`): bevar `tax:0` for det rene depot.
  Hvis vi senere ønsker realisationsskat på depot, **må det være et separat opt-in**.
- **Snapshots / export-import** (`MODEL_VERSION`): tilføj kun valgfrie felter, så gamle
  JSON-filer indlæses uden migrering. Tilføj fallback-default i `defaults.ts` så `ask` er
  `undefined` på alle eksisterende scenarier.
- **FIRE / Country / KPIs**: læser allerede aggregerede `free`-saldi — uberørt så længe
  vi summerer ASK + depot ind i `closing.free` (se §3 punkt 5).

## 5. Tests der beskytter

- `__tests__/finance.test.ts`, `stabilization.test.ts`, `personal-workversion.test.ts`:
  basisprojektion, integrity, eksport/import — låser nuværende adfærd.
- `__tests__/fire.test.ts`, `country.test.ts`, `scenario-types.test.ts`,
  `cloud-persistence.test.ts`: dækker FIRE/Country/scenarier/cloud.
- **Nyt i denne prompt:** `__tests__/ask-regression.test.ts` — låser nettoformue-serien
  for base-scenariet, så ASK-arbejdet kan sammenlignes 1:1 før/efter implementering.

## 6. Acceptkriterier (denne prompt)

- [x] Ingen eksisterende beregninger ændret.
- [x] Gamle modeller uden ASK virker — `ask` er rent optional og defaulter til undefined.
- [x] Klar plan for at undgå dobbeltbeskatning (gate på `ask.enabled`, lagerskat kun på ASK-andel).
- [x] Alle 258 eksisterende tests passerer; ny regressionstest tilføjet.
