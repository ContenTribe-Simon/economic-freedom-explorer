/**
 * The Advanced door page's copy, extracted so tests can scan it with the public vocabulary
 * guard (`containsForbiddenTerm`): the door is shown BEFORE opt-in and is reachable from
 * every public screen, so its wording is effectively public-path copy and must respect
 * CLAUDE.md §3 rule 7 (no advanced/DK-personal concepts named). That applies to the TITLES
 * as much as the bodies (Codex round 2: "Landeanalyse" is literally "country analysis"), so
 * items describe what the person can do in plain Danish, never the advanced app's internal
 * page names — the country page and FIRE benchmarks are introduced as "Sammenlign
 * rammevilkår" and "Milepæle for uafhængighed" without naming the concepts themselves.
 */
export const DOOR_LEAD =
  "Samme beregningsmodel som den enkle udgave, men med alle detaljer og indstillinger, og med egne tal: den starter ikke med tallene fra den enkle beregning. Den er bygget til dyb gennemgang, ikke til et hurtigt overblik.";

export const DOOR_FEATURES: ReadonlyArray<readonly [title: string, body: string]> = [
  ["Scenarier og stress-tests", "Sammenlign flere planer side om side, og se hvad der sker, hvis afkastet skuffer, eller forbruget stiger."],
  ["Livsfaser", "Læg større hændelser ind år for år, for eksempel huskøb, ændret indkomst eller arv."],
  ["Milepæle for uafhængighed", "Mål din plan mod kendte niveauer for, hvor stor formuen skal være i forhold til dit forbrug."],
  ["Snapshots", "Frys en beregning som dokumentation, og sammenlign den med senere versioner."],
  ["Sammenlign rammevilkår", "Se hvordan forskellige rammevilkår, for eksempel skat og leveomkostninger, ændrer hvor langt pengene rækker."],
  ["År-for-år-tabeller og rapport", "Alle tal bag kurverne, år for år, og en samlet rapport klar til print."],
] as const;

export const DOOR_REMEMBER_NOTE = "Dit valg huskes på denne enhed, så du lander direkte derinde næste gang.";
