/**
 * The public vocabulary guard itself (backlog items 4+5, logged 2026-07-06): the flat
 * case-insensitive prefix list let evasive spellings of banned concepts through, could not
 * host case-sensitive terms ("FIRE" vs Danish "fire" = four), and left DA/EN siblings
 * unpaired. These tests pin the guard's matching semantics directly — the string lists
 * here are deliberately literal so a term dropped from the guard fails loudly.
 */
import { describe, expect, it } from "vitest";
import { containsForbiddenTerm } from "../safety";

describe("country concept: evasive spellings are caught (backlog item 4)", () => {
  it.each([
    "Lande-analyse",
    "landesammenligning",
    "landeoversigt",
    "et lands skat",
  ])("the four confirmed-evasive spellings return true: %s", (s) => {
    expect(containsForbiddenTerm(s)).toBe(true);
  });

  it.each([
    "sammenlign land for land",
    "i andre lande",
    "landet med lavest skat",
    "landets skatteregler",
    "hvor langt pengene rækker i landene",
    "landenes leveomkostninger",
    "flytte til udlandet",
    "udlandsophold",
  ])("the full whole-word land-inflection family and udland are caught: %s", (s) => {
    expect(containsForbiddenTerm(s)).toBe(true);
  });

  it.each([
    "så du lander direkte derinde næste gang", // 'lander' (to arrive) — the known safe word
    "en blid landing",
  ])("ordinary Danish that merely STARTS like 'lande' stays legal: %s", (s) => {
    expect(containsForbiddenTerm(s)).toBe(false);
  });
});

describe("case-sensitive terms: FIRE vs Danish 'fire' (backlog item 4)", () => {
  it.each(["FIRE", "FIRE-benchmarks", "din FIRE-plan"])("all-caps FIRE is banned: %s", (s) => {
    expect(containsForbiddenTerm(s)).toBe(true);
  });

  it.each([
    "om fire år",
    "fire ud af fem",
    "Fire år senere holder planen stadig", // sentence-case number four
  ])("Danish 'fire' (the number) stays legal: %s", (s) => {
    expect(containsForbiddenTerm(s)).toBe(false);
  });
});

describe("benchmark jargon (absorbed from the door test's second ban list, item 5)", () => {
  it.each(["benchmark", "benchmarks", "FIRE-benchmarks", "benchmarking"])(
    "banned incl. inflections: %s",
    (s) => {
      expect(containsForbiddenTerm(s)).toBe(true);
    },
  );
});

describe("DA/EN sibling pairing (backlog item 4)", () => {
  it.each([
    "concentration", // pairs koncentration
    "part-time", // pairs deltid
    "parttime",
    "state pension", // pairs folkepension
    "family fund", // pairs familiefond
    "annuity", // pairs livrente/ratepension
    "annuities",
  ])("English sibling is banned: %s", (s) => {
    expect(containsForbiddenTerm(s)).toBe(true);
  });
});

describe("pre-existing behavior is preserved", () => {
  it.each(["holding", "holdingselskab", "Landeanalyse", "landeanalysen", "depotskat", "deltid", "country analysis"])(
    "previously banned terms still trip: %s",
    (s) => {
      expect(containsForbiddenTerm(s)).toBe(true);
    },
  );

  it.each([
    "En forenklet beregning ud fra dine egne tal og antagelser.",
    "Formue når du stopper",
    "pengene rækker hele vejen til 90",
  ])("core public copy stays legal: %s", (s) => {
    expect(containsForbiddenTerm(s)).toBe(false);
  });
});
