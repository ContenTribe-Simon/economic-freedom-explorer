# Frihedsmodel — redesign-brief (parkeret til efter MVP)

Formålet med dette dokument er at fange aftenens visuelle udforskning, mens den er frisk, så
den dedikerede redesign-runde efter MVP starter varmt og ikke koldt. MVP'en shippes på den
nuværende baseline. Dette er, hvad vi lærte, og hvad vi vil prøve, når vi vender tilbage.

## Status

Den nuværende offentlige baseline er Spectral som display, Public Sans som brødtekst,
fjord-paletten, og horisont- og solopgangs-signaturen. Den er ren og konsistent, men føles
"smuk men generisk", lidt sjæleforladt. Beslutning: ship MVP på den, lav et dedikeret visuelt
redesign senere.

## Diagnose, hvorfor det føles AI-default

- Spiller sikkert hele vejen rundt, intet forpligtet synspunkt.
- Serif-overskrift plus ren sans er efterhånden sin egen default.
- Solopgang og horisont er optimisme-klicheen.
- Lyst, jævnt, friktionsløst, ingen tekstur, symmetriske kort.

Sjæl kommer af et par forpligtede, ejede valg, ikke af mere ro eller polish.

## Udforskede retninger (mockups: edge A, B, C i outputs)

- A, tal som begivenhed: dybt fjord-farvefelt som hero plus et kæmpe frihedsalder-tal. Rytme
  mellem mørkt og lyst, så svaret føles som et øjeblik.
- B, terræn og tekstur: svage højdekurver som et kort over dit livs terræn, organisk blækstrøg
  på horisonten, papirkorn. Sjæl via et ejet motiv og en håndlavet kvalitet.
- C, kombineret plus parallax plus punchier type: A's tal-øjeblik plus B's terræn, lagdelt
  parallax (markør-lysfelt, scroll-lag på terræn, ambient drift), Clash Display og Satoshi.

## Font-kandidater med mere gas

- Fontshare, masser af energi, men tjek self-host og licens: Clash Display, Satoshi,
  General Sans.
- OFL og Fontsource-rene, produktionssikre at self-hoste: Bricolage Grotesque (ekspressiv),
  Archivo Expanded (bred og tung, god til det store tal), Space Grotesk (teknisk).

Begrænsning: produktionen self-hoster af hensyn til GDPR og offline. Foretræk OFL og Fontsource,
medmindre vi bevidst vælger at self-hoste en Fontshare-font.

## Hvad vi beholder

- Fjord-paletten, dawn-accenten og statusfarverne (sage, dawn, clay) virker. Behold dem som base.
- Horisontlinjen som data-signatur, men gør den mere ejet og mindre generisk solopgang.
- Den rolige, ærlige copy-stemme og svar-først-strukturen. Sjælen skal komme fra formen, ikke
  fra at bryde svar-først-klarheden eller copy-reglerne.

## Hvad vi kan skubbe på

- Ét forpligtet greb til svar-øjeblikket (farvefelt plus hero-tal).
- Et ejet motiv eller en tekstur (terræn og højdekurver, eller organisk blækstrøg) plus en
  smule korn.
- Punchier display-type.
- En smule tør dansk varme i copy-sømmene (tomme tilstande, indlæsning, start forfra).
- Redaktionel asymmetri i stedet for centrerede, symmetriske kort.
- Eventuelt diskret parallax eller ambient bevægelse, altid reduced-motion-sikkert.

Vælg ét til to at forpligte dig på. Lad være med at drysse alle på.

## Begrænsninger og guardrails for redesignet

- Bliv i lystilstand, nordisk dagslys, roligt men med kant.
- Behold WCAG AA, tastatur og understøttelse af reduceret bevægelse.
- Behold de public-safe regler og copy-stemmen: ingen avanceret eller DK-lækage, ingen
  tankestreger, faktiske tal plus den ene globale fraskrivelse.
- Self-hostede fonte, OFL foretrukket.

## Åbne spørgsmål

- Hvilken retning, A, B, C eller en blanding?
- Endeligt valg af display-type, og self-host-vej hvis Fontshare.
- Hvor langt parallax og bevægelse skal skubbes.

## Ny linje: avanceret app, data-visualisering og præsentation (post-MVP)

Tilføjet juli 2026, adskilt fra brand-udforskningen ovenfor. Simon har bygget den avancerede
app's funktionalitet langt foran dens UX, så data præsenteres i dag uoptimalt, tungt at
aflæse grafer, tabeller og opsætning der ikke gør tallene appetitlige. Det er ikke et
spørgsmål om brand-følelse (det er "gas"-udforskningen ovenfor), det er et spørgsmål om at
gøre den avancerede apps eksisterende information letforståelig og indbydende at se på.

Kandidat-scope, når vi når dertil, skal skæres skarpere til den tid:
- Gennemgang af de tunge visningssider: Dashboard, År-for-år, Scenarier, Lande, Rapport.
- Bedre datavisualisering af projektionerne (i dag den rige stablede Fri/Buffer/Pension/
  Holding-graf, "Kapitaludvikling"), tabelvisninger, sammenligninger mellem scenarier.
- Skal bruge og bygge videre på det designsystem, der allerede er lagt ned i fundament-PR'en
  (paletten, fontene, tokens), ikke opfinde et nyt.
- Kan trække på erfaringerne fra det offentlige lags horisont-chart og KPI-kort som forlæg
  for klarhed, men den avancerede bruger skal stadig kunne se den fulde detalje.

Placering i roadmappen: efter MVP'en er landet, altså efter Fase 12's pre-launch-gate, som en
selvstændig designfase for den avancerede app. Ikke at forveksle med Fase 9 (skjule avanceret
kompleksitet bag en dør), som er ren routing, ingen visuel ombygning. De to kan i praksis køre
tæt på hinanden i tid, men er separate opgaver med separat scope.
