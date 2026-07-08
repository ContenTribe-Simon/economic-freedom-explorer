# Frihedsmodel backlog: public-flow polish

Logget 2026-07-05 (punkt 1-3, fra Simons test af det mergede flow). Tre punkter fra manuel
test, bevidst IKKE rettet i feat/advanced-access-and-intro (adgangs- og intro-branchen), så
de ikke drukner i den. Punkt 4-10 er logget 2026-07-06, se sektionen nedenfor.

## 1. Uformateret tal på Simple Inputs (kronefelterne)

`NumField` i `src/pages/public/SimpleInputs.tsx` renderer en native
`<input type="number">`, og dens VÆRDI vises derfor som rå cifre uden dansk
tusindtalsseparator: "100000", ikke "100.000". Rammer alle kronefelter på skærmen
(årlig indkomst, månedligt forbrug, investeringer, månedlig opsparing, pensionssaldo,
mål for mindste formue). En rettelse kræver skift til formateret tekst-input
(`inputMode="numeric"` + parse/format på fokus/blur), da native number-inputs ikke kan
vise separatorer. Slider-labels og alle beregnede tal er allerede korrekt formateret via
`formatKr`/`format`-props.

## 2. Print/PDF-resuméet skal tættere på Resultat-skærmens fulde præsentation

Gem og del-skærmens print-resumé (sektionen `hidden print:block` i
`src/pages/public/GemOgDel.tsx`) viser i dag nøgletalstabel + "Dine tal", men IKKE
horisont-grafen og ikke alle Resultat-skærmens kort (Frihedspunkt, Flaskehals,
robusthed/antagelser, drivers). Ønske: print-udgaven skal ligne Resultat-skærmens fulde
billede, alle kort, inkl. graf (SVG'en printer fint, den skal blot med i print-sektionen
eller gøres print-synlig).

## 3. Deling på tværs af browsere kan ikke testes før live-deploy

Ikke en fejl, ingen handling nu: dele-links (`/resultat?d=...`) er verificeret lokalt og i
e2e, men rigtig kryds-browser/kryds-enheds-test (iOS Safari, Android Chrome, mail-klienters
link-håndtering) kræver en offentligt tilgængelig URL. Tages op, når appen er deployet.

---

Items 4-10 logged 2026-07-06: deferred findings from the multi-agent self-review of PR #30
(`feat/advanced-access-and-intro`). Each was CONFIRMED in review (item 6 marked plausible)
but deliberately deferred as out of that PR's scope. Items are independent; any can be
picked up alone. File/line references are as of the logging date — re-verify before editing.

## 4. Vocabulary guard only matches exact spellings, single case mode

**Fixed 2026-07-08** on `fix/public-vocab-guard-case-and-pairing` (structured per-term
entries with `wholeWord`/`caseSensitive`, country inflections, FIRE, DA/EN pairing;
pinned by `safety-guard.test.ts`). Kept below for the record.

`FORBIDDEN_PUBLIC_TERMS` (`src/lib/finance/public/safety.ts`) is a flat list compiled into
one case-insensitive word-start-prefix regex. Verified gaps:

- Trivially-evasive spellings of the country concept pass: "Lande-analyse",
  "landesammenligning", "landeoversigt", "et lands skat" all return `false` from
  `containsForbiddenTerm`, which is also the RUNTIME leak filter in `drivers.ts:87/91` and
  `warnings.ts:44` — such a string would ship on the public surface.
- The single `i`-flag regex cannot host case-sensitive terms: "FIRE" cannot be listed
  because Danish "fire" (the number four) would match.
- Language siblings are unpaired ad hoc: "koncentration" has no "concentration";
  "country" gained "landeanalyse" only after a leak incident.

**Fix shape:** per-term options (case-sensitive flag, whole-word vs prefix, DA/EN pairing),
e.g. `{term, flags}` entries compiled into two regexes (case-sensitive + insensitive). Then
absorb the door test's FIRE/benchmark bans (item 5) and the country compounds. Update
`docs/public-mvp-spec-and-data-contract-v1.md` §4.4/§4.5 in the same PR (doc and code must
stay in sync per the doc's own note).

## 5. Door-copy test carries its own ban list, diverging from the guard

**Fixed 2026-07-08** on `fix/public-vocab-guard-case-and-pairing` (test-local regexes
deleted; the door test asserts via the real guard only). Kept below for the record.

`src/pages/__tests__/advanced-door-copy.test.ts` bans `/FIRE/` (case-sensitive),
`/benchmark/i` and whole-word `land/lande/landet` via test-local regexes. Those concepts are
NOT in `FORBIDDEN_PUBLIC_TERMS`, so the other public-surface tripwires
(`public-result-v1.test.ts`, `engine-horizon-anchor-v1.test.ts`, resultat copy invariants)
would pass "FIRE" or "benchmark" appearing in Resultat/GemOgDel/adapter copy. A second
canonical ban list is accreting in one test.

**Fix shape:** blocked by item 4 (the guard needs case-sensitivity to host "FIRE"). Once the
guard can express these terms, delete the test-local regexes in favor of the guard scan.

## 6. Start's no-carry-over note has no referent on first visit

`src/pages/public/Start.tsx` renders "Tallene fra beregningen her følger ikke med"
unconditionally under the header. A first-time visitor on /start has entered nothing, so
"beregningen her" refers to a calculation that does not exist yet. (Plausible-severity copy
nit: no computed figure is claimed, so CLAUDE.md §7's mechanical check does not bind, but
the copy voice asks for claims that hold in every reachable state.)

**Fix shape:** Start-specific wording without the referent (e.g. "Den avancerede model har
sine egne tal.") or one referent-free sentence for all screens. Mind the tests pinning the
exact sentence (`advanced-access-reminder.test.tsx`, `resultat-states.test.tsx`).

## 7. Start hand-rolls its header and has already drifted from PublicHeader

`src/pages/public/Start.tsx` duplicates PublicHeader's brand block, corner button and note
(including the identical `"mt-1 text-right text-[12px]"` className). Confirmed drift: commit
`de31818` gave PublicHeader's row `flex-wrap`/`min-w-0` narrow-phone handling; Start's row
is still plain `flex items-center justify-between`. The narrow-phone e2e overflow test only
covers /resultat and /gem-og-del, so Start divergence goes unwatched. (Lower risk than it
sounds — Start has no `action` element, so its row is narrower — but the fork is the cost.)

**Fix shape:** give PublicHeader a `className` prop for Start's `relative z-[2]` +
clamp-padding needs and use it on Start, or extract the shared brand+button+note block.
Extend the narrow-phone e2e loop to /start.

## 8. Door feature titles no longer match anything inside the advanced app

Deliberate consequence of the public-safe renames (2026-07-06): the door promises
"Sammenlign rammevilkår" and "Milepæle for uafhængighed", but inside, the nav says "Lande" /
"FIRE" and the pages are headed "Landeanalyse" / "FIRE-benchmarks" (`AppShell.tsx`,
`Countries.tsx`, `Fire.tsx`). A user who opts in because of a door item cannot find it by
that name inside.

**Fix shape:** align the advanced nav/page labels with the door phrasing, or add the door
phrasing as subtitles on those advanced pages. The door titles themselves must NOT revert
(guarded by `advanced-door-copy.test.ts`).

## 9. E2e reminder check does not pin placement

The corner-button test in `e2e/smoke.spec.ts` asserts
`page.getByTestId("advanced-no-carryover-note")` is visible per screen. Since the note is
unique per screen this also enforces the count (Playwright strict mode), but NOT placement:
if the note moved from the header to a page footer, the e2e stays green. Placement (same
`<header>` as the corner button; by the row CTA on Resultat) is pinned only by the unit
test `advanced-access-reminder.test.tsx`.

**Fix shape:** scope the e2e locator — `page.getByRole("banner").getByTestId(...)` for the
three header screens, a row-scoped locator on /resultat.

## 10. Tests seed the Advanced door with a raw localStorage literal

`advanced-access-reminder.test.tsx` and `resultat-states.test.tsx` call
`localStorage.setItem("frihedsmodel-advanced-door.v1", "open")` although
`src/lib/advancedDoor.ts` exports `openAdvancedDoor()` and privately owns the key and
sentinel value. If the key is ever versioned to `.v2`, those tests seed a stale key and the
"returning user / door already open" scenario passes vacuously.

**Fix shape:** use `openAdvancedDoor()` in jsdom tests (optionally export a reset helper or
the key constant for cleanup). The e2e specs legitimately need the literal inside
`addInitScript`; consider exporting the key constant so they can import it at build time.
