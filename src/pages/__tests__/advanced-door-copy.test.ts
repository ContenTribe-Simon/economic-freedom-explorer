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

  it("copy rules: no em dashes, no 'ca.' hedging", () => {
    for (const s of ALL_STRINGS) {
      expect(s).not.toContain("—");
      expect(s).not.toMatch(/\bca\.\s/i);
    }
  });
});
