# Frihedsmodel backlog: public-flow polish (fra Simons test af det mergede flow)

Logget 2026-07-05. Tre punkter fra manuel test, bevidst IKKE rettet i
feat/advanced-access-and-intro (adgangs- og intro-branchen), så de ikke drukner i den.

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
