# Frihedsmodel backlog: motor-horizon-korrekthed plus standard-scenarie-regressionstests

Logget fra review-loopet på feat/public-result-adapter (Codex og @claude), juni 2026.

## Kontekst, hvorfor

Det public-safe adapterlag gjorde det offentlige lag horizon-korrekt output for output og
arbejdede dermed uden om en rod i motoren: deriveKPIs forankrer flere slut-horisont-outputs ved
yAt95, altså alder 95, i stedet for den faktiske sidste projicerede YearRow. For lifeExpectancy
over 95 gav det en stribe modsigelser mellem alder-95 og den rigtige horisont, som vi lappede ved
den offentlige grænse: end-margin-driveren, status' mål-komponent, kapital-ankrene, og et cap på
robusthedsscoren. Adapteren er korrekt for MVP'en, men de rettelser er workarounds, ikke kilde-fix.

## TODO 1: ret alder-95-forankringen i motoren (mål: Fase 7, korrektheds-gaten)

- Få motoren til at regne slut-horisont-størrelser fra den sidste projicerede YearRow, ikke fra
  yAt95. Berørt: end-margin-komponenten i deriveKPIs, som fodrer modelStatus target_missed og
  financialRobustness, plus alt andet der stadig hænger på yAt95.
- Hvorfor det betyder noget: rettet ved kilden bliver motoren selv horizon-korrekt, modsigelserne
  for lifeExpectancy over 95 forsvinder i både det offentlige og det avancerede lag, og vi kan
  forenkle adapterens workarounds, altså end-margin-recompute, status' mål-override og
  robusthedscap'et.
- Scope og risiko: rører motoren og dermed den avancerede app og motorens egne tests. Egen PR, med
  omhu. Verificér den avancerede apps opførsel og tests, ikke kun det offentlige lag.
- Bagefter: gå adapteren igennem og fjern de nu overflødige workarounds, hvor motoren er den eneste
  kilde.

## TODO 2: udvid standard-scenarie-regressionstests, sammen med motor-rettelsen

Adapter-PR'en tilføjede målrettede tests for hvert problem, vi fangede. Når vi rører motoren, så
læg bredere kontroltests på standard- og default-scenarierne, så en fremtidig motor-ændring ikke
lydløst kan regressere dem:

- lifeExpectancy over 95 modsigelserne: status, end-margin-driver, robusthedsscore og kapital-ankre
  skal alle være enige på den rigtige horisonts grundlag, ingen alder-95-uenighed.
- moneyLastsToAge, bottleneck og off_track alle single-sourcet fra det offentlige shortfall-signal,
  YearRow.shortfall, aldrig netWorth under eller lig nul.
- Default-deny på drivers og warnings: allowlistede familier overlever, positiv tilstedeværelse,
  forbudte familier droppes, output-leak-guard.
- Kapital-ankre læser YearRow, aldrig capitalAt65 eller capitalAt95.
- Golden default, high-saver og tight personaer pinnet ende til ende: status, headline-tal, drivers,
  warnings.

Kør dem specifikt mod standard-scenarierne, så de helt almindelige inputs er beskyttet, ikke kun
edge-fixtures.

## Noter

- Indtil motor-rettelsen lander, er det offentlige lag korrekt via adapterens workarounds. Det er
  afgrænset og fint for MVP'en.
- Kalibrerings-valg at tage med robusthedsarbejdet eller resultat-skærmen: et publicly missed plan
  kan i dag læse Middel robusthed, fordi cap-gulvet er 69. Motoren behandler et reelt mål-miss
  hårdere, under eller lig 40. Beslut om det offentlige miss skal cappe til 39, altså Lav, for at
  spejle motoren. Ikke en korrekthed, kun sværhedsgrad.
- Skærm-lags-noterne, off_track plus genrejst slut-margin der viser en beroligende driver,
  polaritet mellem robusthed og antagelsessikkerhed, og ordet antagelsessikkerhed, spores separat
  og foldes ind i resultat-skærm-prompten. De hører ikke til her.
