/**
 * The Advanced door page is shown BEFORE opt-in and is reachable from every public screen —
 * its copy is effectively public-path copy (CLAUDE.md §3 rule 7: no advanced/DK-personal
 * concepts named). The copy lives in advancedDoorCopy.ts precisely so this test can scan it
 * with the same default-deny vocabulary guard the adapters use (Codex: "deltid" and
 * "et andet land" slipped in via the feature list).
 */
import { describe, expect, it } from "vitest";
import { containsForbiddenTerm } from "@/lib/finance/public";
import { DOOR_FEATURES, DOOR_LEAD, DOOR_REMEMBER_NOTE } from "@/pages/advancedDoorCopy";

const ALL_STRINGS: string[] = [DOOR_LEAD, DOOR_REMEMBER_NOTE, ...DOOR_FEATURES.flatMap(([t, b]) => [t, b])];

describe("Advanced door copy is public-safe", () => {
  it("no string trips the public vocabulary guard (containsForbiddenTerm)", () => {
    for (const s of ALL_STRINGS) {
      expect(containsForbiddenTerm(s), `forbidden term in: ${s}`).toBe(false);
    }
  });

  it("REGRESSION: the two Codex terms are gone and stay gone", () => {
    const joined = ALL_STRINGS.join(" | ");
    expect(joined).not.toMatch(/deltid/i);
    expect(joined).not.toMatch(/andet land/i);
    expect(joined).not.toMatch(/boede i/i);
  });

  it("REGRESSION (Codex round 2): forbidden concepts do not appear as TITLES either", () => {
    // Round 1 reworded the bodies but left "Landeanalyse" (literally "country analysis",
    // the exact concept CLAUDE.md §3 rule 7 names) standing as a heading. Titles are the
    // most visible strings on the door, so they get the same bans as the bodies.
    const joined = ALL_STRINGS.join(" | ");
    expect(joined).not.toMatch(/landeanalyse/i);
    expect(joined).not.toMatch(/\bland(e|et)?\b/i);
    // The FIRE acronym (English, community jargon) stays out of public copy. Case-sensitive
    // on purpose: Danish "fire" (the number four) is fine.
    expect(joined).not.toMatch(/FIRE/);
    expect(joined).not.toMatch(/benchmark/i);
  });

  it("the vocabulary guard itself catches 'Landeanalyse', so it cannot silently return here", () => {
    // The first test scans this file with containsForbiddenTerm, but that only has teeth if
    // the guard actually knows the term ("Landeanalyse" passed it in round 1).
    expect(containsForbiddenTerm("Landeanalyse")).toBe(true);
    expect(containsForbiddenTerm("landeanalysen viser")).toBe(true);
  });

  it("copy rules: no em dashes, no 'ca.' hedging", () => {
    for (const s of ALL_STRINGS) {
      expect(s).not.toContain("—");
      expect(s).not.toMatch(/\bca\.\s/i);
    }
  });
});
