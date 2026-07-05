/**
 * Engine end-horizon anchoring (backlog TODO 1 + TODO 2).
 *
 * The engine previously anchored end-horizon figures at `find(age === 95) ?? last` — an INTERIOR
 * point whenever lifeExpectancy > 95 — so the end margin, the target check (modelStatus
 * target_missed), the holding share and capitalAt95 could all contradict the real end of the
 * projection. This suite pins the source fix (everything reads the LAST projected YearRow) and
 * the broader standard-scenario guarantees the backlog asks for, so a future engine change
 * cannot silently regress them.
 */
import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import { deriveKPIs } from "../kpis";
import { computePublicResult, containsForbiddenTerm, DEFAULT_SIMPLE_INPUTS, type SimplePublicInputs } from "../public";
import { toAssumptions, toScenario } from "../simpleInputs";
import { sanitizeSimpleInputs } from "@/lib/publicInputs";

function run(patch: (s: ReturnType<typeof makeBaseScenario>) => void) {
  const s = makeBaseScenario();
  patch(s);
  const years = project(s, defaultAssumptions);
  return { s, years, kpis: deriveKPIs(s, years, defaultAssumptions) };
}

function pub(raw: Record<string, unknown>) {
  return computePublicResult(sanitizeSimpleInputs(raw as Partial<Record<keyof SimplePublicInputs, unknown>>));
}

describe("end-horizon figures anchor the LAST projected YearRow (never a fixed age 95)", () => {
  it("capitalAt95 equals the last YearRow's net worth for horizons on both sides of 95", () => {
    for (const le of [90, 95, 100, 105]) {
      const { years, kpis } = run((s) => {
        s.inputs.person.lifeExpectancy = le;
      });
      const last = years[years.length - 1];
      expect(last.age).toBe(le);
      expect(kpis.capitalAt95).toBe(last.netWorth);
    }
  });

  it("REGRESSION (the lifeExpectancy>95 contradiction): a target met at the TRUE end age is no longer reported missed", () => {
    // Pre-fix: net worth at the interior age 95 (~72.2M) sat below the 80M target while the true
    // end age 105 held ~111.8M above it — modelStatus target_missed, robustness 40, a critical
    // "Minimumsmål ikke opfyldt – mangler 7.847.465 kr" factor. Post-fix the plan is simply valid.
    const { years, kpis } = run((s) => {
      s.inputs.person.lifeExpectancy = 105;
      s.inputs.spending.desiredMonthlyNet = 15_000;
      s.inputs.target.minNetWorthAtEnd = 80_000_000;
    });
    expect(kpis.firstShortfallAge).toBeNull(); // nothing masks the target check
    expect(kpis.modelStatus).toBe("valid");
    expect(kpis.endShortfallVsTarget).toBe(0);
    expect(kpis.financialRobustness).toBe(87);
    expect(kpis.capitalAt95).toBe(years[years.length - 1].netWorth);
    expect(kpis.robustnessBreakdown.some((f) => f.label.startsWith("Minimumsmål ikke opfyldt"))).toBe(false);
  });

  it("a target genuinely missed at the true end age stays missed, measured and worded at that age", () => {
    const { years, kpis } = run((s) => {
      s.inputs.person.lifeExpectancy = 105;
      s.inputs.spending.desiredMonthlyNet = 15_000;
      s.inputs.target.minNetWorthAtEnd = 200_000_000;
    });
    const endNw = years[years.length - 1].netWorth;
    expect(kpis.modelStatus).toBe("target_missed");
    expect(kpis.endShortfallVsTarget).toBe(200_000_000 - endNw);
    const missFactor = kpis.robustnessBreakdown.find((f) => f.label.startsWith("Minimumsmål ikke opfyldt"));
    expect(missFactor).toBeDefined();
    // The wording follows the actual end age — never a hardcoded "alder 95".
    expect(missFactor!.detail).toContain("ved alder 105");
    expect(missFactor!.detail).not.toContain("alder 95");
  });

  it("GOLDEN: lifeExpectancy <= 95 personas are unchanged by the anchor fix (exact pre-fix values)", () => {
    // These three personas were byte-identical before and after the fix (the old fallback
    // already returned the last row for horizons at or below 95). Pinned exactly so the
    // "fallback was already correct" property cannot silently drift.
    const dflt = run(() => {});
    expect(dflt.kpis.modelStatus).toBe("invalid");
    expect(dflt.kpis.firstShortfallAge).toBe(51);
    expect(dflt.kpis.financialRobustness).toBe(5);
    expect(dflt.kpis.capitalAt95).toBeCloseTo(27316689.722634297, 6);

    const le90 = run((s) => {
      s.inputs.person.lifeExpectancy = 90;
      s.inputs.target.minNetWorthAtEnd = 2_000_000;
    });
    expect(le90.kpis.modelStatus).toBe("invalid");
    expect(le90.kpis.capitalAt95).toBeCloseTo(22470135.039291788, 6);
    expect(le90.kpis.endShortfallVsTarget).toBe(0);

    const le95 = run((s) => {
      s.inputs.target.minNetWorthAtEnd = 2_000_000;
    });
    expect(le95.kpis.capitalAt95).toBeCloseTo(27316689.722634297, 6);
    expect(le95.kpis.endShortfallVsTarget).toBe(0);
  });
});

describe("public layer agreement on the true horizon (lifeExpectancy > 95)", () => {
  const LE100_GOAL: Record<string, unknown> = {
    ...DEFAULT_SIMPLE_INPUTS,
    lifeExpectancy: 100,
    monthlySavings: 8_000,
    desiredStopAge: 65,
    fiTargetMinNetWorth: 2_000_000,
  };

  it("status, capital anchors, money-lasts and robustness tell ONE story at the real end age", () => {
    const r = pub(LE100_GOAL);
    expect(r.lifeExpectancy).toBe(100);
    expect(r.status.kind).toBe("on_track");
    // Capital anchors read the YearRow series itself — end anchor IS the last point.
    const last = r.netWorthByAge[r.netWorthByAge.length - 1];
    expect(last.age).toBe(100);
    expect(r.capitalAtEndOfHorizon).toBe(last.netWorth);
    // No shortfall -> the money lasts exactly to the true horizon, not to 95.
    expect(r.bottleneck.kind).toBe("none");
    expect(r.moneyLastsToAge).toBe(100);
    // The engine's robustness now measures the margin at the true end (this value DROPPED from
    // 69 pre-fix: the old interior-95 anchor over-read a plan that draws down after stop).
    expect(r.robustness.score).toBe(68);
  });
});

describe("single-sourcing from YearRow.shortfall (never netWorth <= 0)", () => {
  it("a shortfall with LOCKED pension wealth still flags off_track while net worth stays positive", () => {
    // Free capital runs dry long before the pension unlocks at 80: the plan has a real funding
    // shortfall while total net worth (including the locked pension) stays far above zero. If
    // any consumer derived "money lasts" from netWorth <= 0 instead of YearRow.shortfall, this
    // persona would wrongly read as holding to the end.
    const r = pub({
      ...DEFAULT_SIMPLE_INPUTS,
      desiredStopAge: 60,
      monthlySavings: 2_000,
      currentInvestments: 500_000,
      pensionBalance: 5_000_000,
      pensionAccessAge: 80,
    });
    expect(r.status.kind).toBe("off_track");
    if (r.bottleneck.kind !== "shortfall") throw new Error("fixture must produce a shortfall");
    expect(r.bottleneck.firstShortfallAge).toBeLessThan(80);
    // Adapter semantic: "pengene rækker til" names the first shortfall age itself.
    expect(r.moneyLastsToAge).toBe(r.bottleneck.firstShortfallAge);
    // Net worth at the shortfall age is still strongly positive (the pension is locked, not gone).
    const atShortfall = r.netWorthByAge.find((p) => p.age === (r.bottleneck as { firstShortfallAge: number }).firstShortfallAge);
    expect(atShortfall).toBeDefined();
    expect(atShortfall!.netWorth).toBeGreaterThan(1_000_000);
  });
});

describe("default-deny on public drivers and warnings (standard personas)", () => {
  const PERSONAS: Record<string, Record<string, unknown>> = {
    standard: { ...DEFAULT_SIMPLE_INPUTS },
    highSaver: { ...DEFAULT_SIMPLE_INPUTS, desiredStopAge: 65, monthlySavings: 12_000 },
    tight: { ...DEFAULT_SIMPLE_INPUTS, desiredStopAge: 65, monthlySavings: 12_000, fiTargetMinNetWorth: 50_000_000 },
  };

  it("allowlisted families survive (positive presence) and no output leaks forbidden terms", () => {
    for (const [name, raw] of Object.entries(PERSONAS)) {
      const r = pub(raw);
      expect(r.drivers.length, `${name}: drivers present`).toBeGreaterThan(0);
      for (const d of r.drivers) {
        expect(["helps", "hurts"]).toContain(d.direction);
        expect(containsForbiddenTerm(d.text), `${name} driver leaks: ${d.text}`).toBe(false);
      }
      for (const w of r.warnings) {
        expect(containsForbiddenTerm(w.text), `${name} warning leaks: ${w.text}`).toBe(false);
      }
      expect(containsForbiddenTerm(r.status.reason), `${name} status reason leaks`).toBe(false);
    }
  });
});

describe("adapter workarounds now provably AGREE with the horizon-correct engine", () => {
  // The adapter's own horizon-correct reads (end-of-horizon capital from the last YearRow, the
  // shared end-margin verdict feeding status) were introduced as workarounds while the engine
  // anchored at the interior age 95. Post-fix they are the same computation as the engine's —
  // these tests prove the agreement on both sides of 95, so the adapter pieces are kept as the
  // public boundary's DEFINITION, no longer as divergent patches.
  const CASES: Record<string, Record<string, unknown>> = {
    le90_goal: { ...DEFAULT_SIMPLE_INPUTS, lifeExpectancy: 90, desiredStopAge: 65, fiTargetMinNetWorth: 2_000_000 },
    le100_goal_met: { ...DEFAULT_SIMPLE_INPUTS, lifeExpectancy: 100, monthlySavings: 8_000, desiredStopAge: 65, fiTargetMinNetWorth: 2_000_000 },
    le100_goal_missed: { ...DEFAULT_SIMPLE_INPUTS, lifeExpectancy: 100, monthlySavings: 8_000, desiredStopAge: 65, fiTargetMinNetWorth: 50_000_000 },
    le105_goal_met: { ...DEFAULT_SIMPLE_INPUTS, lifeExpectancy: 105, monthlySavings: 8_000, desiredStopAge: 65, fiTargetMinNetWorth: 1_000_000 },
  };

  function both(raw: Record<string, unknown>) {
    const inputs = sanitizeSimpleInputs(raw as Partial<Record<keyof SimplePublicInputs, unknown>>);
    const r = computePublicResult(inputs);
    const scenario = toScenario(inputs);
    const assumptions = toAssumptions(inputs);
    const years = project(scenario, assumptions);
    const kpis = deriveKPIs(scenario, years, assumptions);
    return { r, kpis };
  }

  it("public capitalAtEndOfHorizon equals the engine's end-capital KPI for every horizon", () => {
    for (const [name, raw] of Object.entries(CASES)) {
      const { r, kpis } = both(raw);
      expect(r.capitalAtEndOfHorizon, name).toBe(kpis.capitalAt95);
    }
  });

  it("public target verdict (tight vs on_track) matches engine modelStatus target_missed", () => {
    for (const [name, raw] of Object.entries(CASES)) {
      const { r, kpis } = both(raw);
      if (r.bottleneck.kind !== "none") continue; // shortfall dominates both layers identically
      expect(r.status.kind === "tight", `${name}: tight <=> target_missed`).toBe(kpis.modelStatus === "target_missed");
    }
  });
});

describe("GOLDEN personas end-to-end (input -> full public output)", () => {
  it("standard (default persona): off_track with the exact headline figures", () => {
    const r = pub({ ...DEFAULT_SIMPLE_INPUTS });
    expect(r.status.kind).toBe("off_track");
    expect(r.earliestSustainableStopAge).toBe(62);
    expect(r.moneyLastsToAge).toBe(86);
    expect(Math.round(r.capitalAtStopAge)).toBe(4239821);
    expect(Math.round(r.capitalAtEndOfHorizon)).toBe(0);
    expect(r.robustness.score).toBe(25);
    expect(r.robustness.label).toBe("Lav robusthed");
    expect(r.drivers).toHaveLength(2);
    expect(r.warnings).toHaveLength(1);
  });

  it("high saver: on_track with the exact headline figures", () => {
    const r = pub({ ...DEFAULT_SIMPLE_INPUTS, desiredStopAge: 65, monthlySavings: 12_000 });
    expect(r.status.kind).toBe("on_track");
    expect(r.earliestSustainableStopAge).toBe(62);
    expect(r.moneyLastsToAge).toBe(90);
    // Same stop capital as the default-savings persona: the savings lever saturates above the
    // available cashflow (a known, separately-flagged model behavior — pinned so a change to it
    // is loud, not silent).
    expect(Math.round(r.capitalAtStopAge)).toBe(5616057);
    expect(r.robustness.score).toBe(90);
  });

  it("tight (goal missed, plan holds): the exact tight story", () => {
    const r = pub({ ...DEFAULT_SIMPLE_INPUTS, desiredStopAge: 65, monthlySavings: 12_000, fiTargetMinNetWorth: 50_000_000 });
    expect(r.status.kind).toBe("tight");
    expect(r.earliestSustainableStopAge).toBeNull();
    expect(r.moneyLastsToAge).toBe(90);
    expect(r.robustness.score).toBe(30);
    expect(r.robustness.label).toBe("Lav robusthed");
    expect(r.bottleneck.kind).toBe("none");
  });
});
