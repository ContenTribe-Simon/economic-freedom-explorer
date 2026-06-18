import { describe, it, expect } from "vitest";
import type { KPIs, ScoreFactor, YearRow } from "../../types";
import type { SimplePublicInputs } from "../../simpleInputs";
import { DEFAULT_SIMPLE_INPUTS } from "../../simpleInputs";
import {
  computePublicResult,
  buildPublicResult,
  toPublicStatus,
  adaptRobustnessDrivers,
  netWorthAtAge,
  capitalAtPlannedStopAge,
  moneyLastsToAge,
  netWorthSeries,
  firstShortfall,
  containsForbiddenTerm,
  type PublicResult,
} from "../index";

// ---------------------------------------------------------------------------
// Fixtures & helpers
// ---------------------------------------------------------------------------

const HIGH_SAVER: SimplePublicInputs = {
  currentAge: 35,
  lifeExpectancy: 90,
  annualIncome: 650_000,
  monthlySpending: 18_000,
  currentInvestments: 600_000,
  monthlySavings: 15_000,
  pensionBalance: 500_000,
  pensionAccessAge: 67,
  expectedRealReturn: 0.04,
  desiredStopAge: 55,
};

/** Minimal YearRow — only the fields the public layer reads (age, netWorth, shortfall, shortfallAmount). */
function y(age: number, netWorth: number, shortfall = false, shortfallAmount = 0): YearRow {
  return { age, netWorth, shortfall, shortfallAmount } as unknown as YearRow;
}

/** Build a range of YearRows from `from`..`to` with a constant or per-age net worth. */
function years(from: number, to: number, nw: (age: number) => number): YearRow[] {
  const rows: YearRow[] = [];
  for (let age = from; age <= to; age++) rows.push(y(age, nw(age)));
  return rows;
}

/** Full KPIs with safe zero defaults; override only what a test cares about. */
function makeKpis(over: Partial<KPIs> = {}): KPIs {
  return {
    plannedStopAge: 60,
    earliestSustainableStopAge: null,
    capitalAtStopAge: 0,
    capitalAt65: 0,
    capitalAt95: 0,
    firstShortfallAge: null,
    monthlyGapAfterStop: 0,
    financialRobustness: 0,
    assumptionRisk: 0,
    robustnessScore: 0,
    minNetWorthAtEnd: 0,
    endShortfallVsTarget: 0,
    assumptionConfidence: 0,
    unfinancedHoldingDebt: 0,
    unfinancedHoldingYears: 0,
    firstFinancingIssueAge: null,
    firstFinancingIssueKind: null,
    firstFinancingIssueAmount: 0,
    modelStatus: "valid",
    modelStatusReason: "",
    robustnessBreakdown: [],
    robustnessSummary: "",
    confidenceBreakdown: [],
    confidenceSummary: "",
    ...over,
  };
}

const BASE_INPUTS: SimplePublicInputs = { ...DEFAULT_SIMPLE_INPUTS };

/** Every user-facing string in a PublicResult (for leak guards). */
function publicStrings(r: PublicResult): string[] {
  return [r.status.label, r.status.reason, ...r.drivers.map((d) => d.text)];
}

// ---------------------------------------------------------------------------
// 1. Golden scenarios — all three verdicts
// ---------------------------------------------------------------------------

describe("status mapping (engine verdict → public status, no new thresholds)", () => {
  it("valid → on_track / På sporet / sage", () => {
    const s = toPublicStatus(makeKpis({ modelStatus: "valid" }), { firstShortfallAge: null, hasFiTarget: false });
    expect(s.kind).toBe("on_track");
    expect(s.label).toBe("På sporet");
    expect(s.colorToken).toBe("sage");
  });

  it("target_missed → tight / Stramt / dawn", () => {
    const s = toPublicStatus(makeKpis({ modelStatus: "target_missed" }), { firstShortfallAge: null, hasFiTarget: true });
    expect(s.kind).toBe("tight");
    expect(s.label).toBe("Stramt");
    expect(s.colorToken).toBe("dawn");
  });

  it("invalid → off_track / Ikke på sporet / clay", () => {
    const s = toPublicStatus(makeKpis({ modelStatus: "invalid" }), { firstShortfallAge: 86, hasFiTarget: false });
    expect(s.kind).toBe("off_track");
    expect(s.label).toBe("Ikke på sporet");
    expect(s.colorToken).toBe("clay");
  });
});

describe("golden engine scenarios", () => {
  it("ikke på sporet — default persona is off_track with a real bottleneck", () => {
    const r = computePublicResult(DEFAULT_SIMPLE_INPUTS);
    expect(r.status.kind).toBe("off_track");
    expect(r.status.label).toBe("Ikke på sporet");
    expect(r.status.colorToken).toBe("clay");
    expect(r.earliestSustainableStopAge).toBe(62);
    // capital at the user's planned stop age (60) — the YearRow value, ~4.24M (not capitalAt65/95).
    expect(r.capitalAtStopAge).toBeGreaterThan(4_000_000);
    expect(r.capitalAtStopAge).toBeLessThan(4_500_000);
    expect(r.bottleneck.kind).toBe("shortfall");
    if (r.bottleneck.kind === "shortfall") {
      expect(r.bottleneck.firstShortfallAge).toBe(86);
      expect(r.bottleneck.monthlyGap).toBeCloseTo(18_255, -2); // ~18.3k/md, the first-shortfall gap
    }
    expect(r.moneyLastsToAge).toBe(86);
    // horizon chart spans exactly [currentAge, lifeExpectancy]
    expect(r.netWorthByAge[0].age).toBe(35);
    expect(r.netWorthByAge[r.netWorthByAge.length - 1].age).toBe(90);
    expect(r.netWorthByAge).toHaveLength(56);
  });

  it("på sporet — high-saver persona is on_track with no bottleneck", () => {
    const r = computePublicResult(HIGH_SAVER);
    expect(r.status.kind).toBe("on_track");
    expect(r.status.label).toBe("På sporet");
    expect(r.status.colorToken).toBe("sage");
    expect(r.earliestSustainableStopAge).toBe(48);
    expect(r.bottleneck.kind).toBe("none");
    expect(r.moneyLastsToAge).toBe(90); // money lasts to the horizon end
    expect(r.capitalAtStopAge).toBeGreaterThan(7_500_000);
  });

  it("stramt — valid plan that misses a high FI target is tight", () => {
    const r = computePublicResult({ ...HIGH_SAVER, fiTargetMinNetWorth: 50_000_000 });
    expect(r.status.kind).toBe("tight");
    expect(r.status.label).toBe("Stramt");
    expect(r.status.colorToken).toBe("dawn");
  });
});

// ---------------------------------------------------------------------------
// 2. Horizon-boundary edge cases
// ---------------------------------------------------------------------------

describe("horizon-boundary edge cases", () => {
  it("no age-65 row: anchors read the YearRow, not a fixed age", () => {
    const ys = years(70, 90, (a) => 1_000_000 - (a - 70) * 10_000); // 70..90, no age 65
    expect(netWorthAtAge(ys, 65)).toBeNull();
    // planned stop age 72 → reads the age-72 row
    expect(capitalAtPlannedStopAge(ys, 72, 70, 90)).toBe(netWorthAtAge(ys, 72));
    // planned stop age below the start clamps to the first row (age 70)
    expect(capitalAtPlannedStopAge(ys, 60, 70, 90)).toBe(netWorthAtAge(ys, 70));
  });

  it("lifeExpectancy below 65: works without any age-65/95 reference", () => {
    const ys = years(40, 60, () => 500_000);
    expect(netWorthAtAge(ys, 65)).toBeNull();
    expect(moneyLastsToAge(ys, 60)).toBe(60); // never depletes → end of horizon
    expect(capitalAtPlannedStopAge(ys, 55, 40, 60)).toBe(500_000);
  });

  it("lifeExpectancy above 95: end of horizon is the LAST YearRow (110), not age 95", () => {
    const ys = years(35, 110, (a) => 100_000 + a); // strictly increasing, never depletes
    const series = netWorthSeries(ys);
    expect(series[series.length - 1].age).toBe(110);
    expect(moneyLastsToAge(ys, 110)).toBe(110); // not 95
    // the age-95 row exists but must not be the end-of-horizon value
    expect(netWorthAtAge(ys, 95)).not.toBe(series[series.length - 1].netWorth);
  });

  it("money never runs out → moneyLastsToAge is the horizon end", () => {
    const ys = years(35, 90, () => 250_000);
    expect(moneyLastsToAge(ys, 90)).toBe(90);
  });

  it("money runs short early → moneyLastsToAge is the first <= 0 age", () => {
    const ys = years(35, 90, (a) => (a < 50 ? 200_000 : 0)); // hits 0 at age 50
    expect(moneyLastsToAge(ys, 90)).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// 3. Leak guards
// ---------------------------------------------------------------------------

describe("leak guards", () => {
  const LEAK_PATTERNS = [
    /holding/i,
    /\bask\b/i,
    /aktiesparekonto/i,
    /depot/i,
    /folkepension/i,
    /ratepension/i,
    /livrente/i,
    /deltid/i,
    /\bcountry/i,
    /barma/i,
  ];

  function assertNoLeak(strings: string[]) {
    for (const s of strings) {
      expect(containsForbiddenTerm(s), `forbidden term in "${s}"`).toBe(false);
      for (const p of LEAK_PATTERNS) expect(p.test(s), `${p} matched "${s}"`).toBe(false);
    }
  }

  it("no advanced/DK concept appears in any public string (default persona)", () => {
    assertNoLeak(publicStrings(computePublicResult(DEFAULT_SIMPLE_INPUTS)));
  });

  it("no advanced/DK concept appears in any public string (high-saver persona)", () => {
    assertNoLeak(publicStrings(computePublicResult(HIGH_SAVER)));
  });

  it("the holding-dependency (and buffer) robustness factors are filtered out", () => {
    const breakdown: ScoreFactor[] = [
      { label: "Lav afhængighed af holding", detail: "Holding udgør 0 % af slutaktiverne", impact: "neutral", magnitude: "low" },
      { label: "Lav kontant buffer", detail: "0,0 måneders forbrug", impact: "negative", magnitude: "low" },
      { label: "Ingen cashflow-shortfall", detail: "", impact: "positive", magnitude: "high" },
    ];
    const drivers = adaptRobustnessDrivers(breakdown, { hasFiTarget: false });
    // only the cashflow-coverage factor survives
    expect(drivers).toEqual([{ direction: "helps", text: "Dit forbrug er dækket hele perioden." }]);
    for (const d of drivers) {
      expect(/holding/i.test(d.text)).toBe(false);
      expect(/buffer/i.test(d.text)).toBe(false);
    }
  });

  it("capitalAt95 / capitalAt65 are NEVER used as anchors (end-of-horizon comes from the last YearRow)", () => {
    const ys = [y(35, 200_000), y(36, 210_000), y(37, 111_111)]; // last row = end of horizon
    const inputs: SimplePublicInputs = { ...BASE_INPUTS, currentAge: 35, lifeExpectancy: 37, desiredStopAge: 36 };
    const kpis = makeKpis({ capitalAt65: 888_888, capitalAt95: 999_999, modelStatus: "valid" });
    const r = buildPublicResult(inputs, ys, kpis);

    const endPoint = r.netWorthByAge[r.netWorthByAge.length - 1];
    expect(endPoint.age).toBe(37);
    expect(endPoint.netWorth).toBe(111_111); // from the last YearRow, not capitalAt95
    expect(r.moneyLastsToAge).toBe(37);
    // capitalAtStopAge reads the YearRow at the stop age (36), not the fixed-age KPIs
    expect(r.capitalAtStopAge).toBe(210_000);
    const allNumbers = [r.capitalAtStopAge, endPoint.netWorth, r.moneyLastsToAge];
    expect(allNumbers).not.toContain(999_999);
    expect(allNumbers).not.toContain(888_888);
  });

  it("the bottleneck uses the FIRST-shortfall gap, not the average monthlyGapAfterStop", () => {
    const ys = [y(60, 500_000), y(61, 300_000), y(62, 0, true, 24_000), y(63, 0, true, 30_000)];
    const inputs: SimplePublicInputs = { ...BASE_INPUTS, currentAge: 60, lifeExpectancy: 63, desiredStopAge: 60 };
    // average gap (a smaller, different number) is set to a sentinel that must NOT be used
    const kpis = makeKpis({ modelStatus: "invalid", monthlyGapAfterStop: 777, firstShortfallAge: 62 });
    const r = buildPublicResult(inputs, ys, kpis);

    expect(r.bottleneck.kind).toBe("shortfall");
    if (r.bottleneck.kind === "shortfall") {
      expect(r.bottleneck.firstShortfallAge).toBe(62); // first shortfall row
      expect(r.bottleneck.monthlyGap).toBe(2_000); // 24_000 / 12 — that year's gap
      expect(r.bottleneck.monthlyGap).not.toBe(777); // never the after-stop average
    }
    // sanity: the helper picks the first shortfall row
    expect(firstShortfall(ys)?.age).toBe(62);
  });
});
