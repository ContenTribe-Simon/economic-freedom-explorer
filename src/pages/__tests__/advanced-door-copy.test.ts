/**
 * The Advanced door page is shown BEFORE opt-in and is reachable from every public screen —
 * its copy is effectively public-path copy (CLAUDE.md §3 rule 7: no advanced/DK-personal
 * concepts named). The copy lives in advancedDoorCopy.ts precisely so this test can scan it
 * with the same default-deny vocabulary guard the adapters use (Codex: "deltid" and
 * "et andet land" slipped in via the feature list; round 2: "Landeanalyse" stood as a title).
 *
 * There is deliberately NO test-local ban list here (backlog item 5): every vocabulary
 * concept lives in FORBIDDEN_PUBLIC_TERMS (safety.ts), and this file only (a) scans the door
 * strings with the real guard and (b) pins that the guard actually knows the concepts that
 * leaked in past review rounds — semantics themselves are covered by safety-guard.test.ts.
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

  it("REGRESSION: the guard OWNS every concept that leaked in past review rounds", () => {
    // Each of these shipped (or nearly shipped) in door copy once. The scan above only has
    // teeth if the guard knows them — one canonical list, no test-local regexes.
    const pastLeaks = [
      "deltid", // round 1, feature body
      "et andet land", // round 1, feature body
      "Landeanalyse", // round 2, feature TITLE
      "landeanalysen viser",
      "FIRE-benchmarks", // round 2, feature TITLE (case-sensitive FIRE + benchmark)
    ];
    for (const s of pastLeaks) {
      expect(containsForbiddenTerm(s), `guard must catch: ${s}`).toBe(true);
    }
  });

  it("door-specific NARRATIVE phrasing stays out (not vocabulary, so not in the guard)", () => {
    // "boede i …" was the round-1 country-narrative framing ("lived in another country").
    // It is a phrase pattern, not a concept term, so it is pinned here rather than in
    // FORBIDDEN_PUBLIC_TERMS — a "boede i" guard entry would ban ordinary biography copy
    // anywhere on the public surface for no vocabulary reason.
    expect(ALL_STRINGS.join(" | ")).not.toMatch(/boede i/i);
  });

  it("ordinary Danish 'lander' does NOT trip the guard (land family is whole-word only)", () => {
    // Pins the rule the guard's comment states: the land family is listed as whole-word
    // inflections precisely because a "land"/"lande" PREFIX would match "lander" (to
    // arrive). DOOR_REMEMBER_NOTE uses exactly this word.
    expect(containsForbiddenTerm("så du lander direkte derinde næste gang")).toBe(false);
    expect(containsForbiddenTerm(DOOR_REMEMBER_NOTE)).toBe(false);
  });

  it("copy rules: no em dashes, no 'ca.' hedging", () => {
    for (const s of ALL_STRINGS) {
      expect(s).not.toContain("—");
      expect(s).not.toMatch(/\bca\.\s/i);
    }
  });
});
