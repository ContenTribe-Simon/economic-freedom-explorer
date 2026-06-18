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
  toRobustnessScore,
  toAssumptionConfidenceScore,
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

/**
 * Minimal YearRow — only the fields the public layer reads (age, netWorth, shortfall,
 * shortfallAmount, monthlyGap). `monthlyGap` defaults to the engine invariant shortfallAmount / 12
 * (projection.ts: `monthlyGap: stillShort / 12`); pass it explicitly to exercise field-read.
 */
function y(
  age: number,
  netWorth: number,
  shortfall = false,
  shortfallAmount = 0,
  monthlyGap = shortfallAmount / 12,
): YearRow {
  return { age, netWorth, shortfall, shortfallAmount, monthlyGap } as unknown as YearRow;
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
  return [
    r.status.label,
    r.status.reason,
    r.robustness.label,
    r.assumptionConfidence.label,
    ...r.drivers.map((d) => d.text),
  ];
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
    expect(moneyLastsToAge(ys, firstShortfall(ys))).toBe(60); // never falls short → end of horizon
    expect(capitalAtPlannedStopAge(ys, 55, 40, 60)).toBe(500_000);
  });

  it("lifeExpectancy above 95: end of horizon is the LAST YearRow (110), not age 95", () => {
    const ys = years(35, 110, (a) => 100_000 + a); // strictly increasing, never falls short
    const series = netWorthSeries(ys);
    expect(series[series.length - 1].age).toBe(110);
    expect(moneyLastsToAge(ys, firstShortfall(ys))).toBe(110); // not 95
    // the age-95 row exists but must not be the end-of-horizon value
    expect(netWorthAtAge(ys, 95)).not.toBe(series[series.length - 1].netWorth);
  });
});

// ---------------------------------------------------------------------------
// 2b. moneyLastsToAge uses the engine shortfall signal (not netWorth <= 0)
// ---------------------------------------------------------------------------

describe("moneyLastsToAge uses the engine shortfall signal", () => {
  it("bridge: a shortfall year while net worth is still positive (pension locked) is flagged", () => {
    const ys = [
      y(50, 800_000),
      y(51, 500_000),
      y(52, 200_000),
      y(53, 150_000, true, 60_000), // shortfall === true, netWorth still > 0
      y(54, 120_000, true, 60_000),
    ];
    expect(ys[3].netWorth).toBeGreaterThan(0); // net worth has NOT reached <= 0
    // netWorth <= 0 would never trigger here; the shortfall signal must.
    expect(moneyLastsToAge(ys, firstShortfall(ys))).toBe(53);
  });

  it("no shortfall but low/negative net worth: that year is NOT flagged as depletion", () => {
    const ys = [y(35, 100_000), y(36, 0), y(37, -50_000)]; // netWorth <= 0, but shortfall === false
    expect(moneyLastsToAge(ys, firstShortfall(ys))).toBe(37); // lasts to end of horizon
    expect(moneyLastsToAge(ys, firstShortfall(ys))).not.toBe(36);
  });

  it("runs short early: first shortfall age is returned", () => {
    const ys = years(35, 90, () => 500_000);
    ys.forEach((r) => {
      if (r.age >= 70) (r as { shortfall: boolean }).shortfall = true;
    });
    expect(moneyLastsToAge(ys, firstShortfall(ys))).toBe(70);
  });

  it("no shortfall → moneyLastsToAge is the horizon end", () => {
    const ys = years(35, 90, () => 250_000);
    expect(moneyLastsToAge(ys, firstShortfall(ys))).toBe(90);
  });

  it("invariant: off_track → moneyLastsToAge === bottleneck age; on_track → === lifeExpectancy", () => {
    const off = computePublicResult(DEFAULT_SIMPLE_INPUTS);
    expect(off.status.kind).toBe("off_track");
    expect(off.bottleneck.kind).toBe("shortfall");
    if (off.bottleneck.kind === "shortfall") {
      expect(off.moneyLastsToAge).toBe(off.bottleneck.firstShortfallAge);
    }

    const on = computePublicResult(HIGH_SAVER);
    expect(on.status.kind).toBe("on_track");
    expect(on.bottleneck.kind).toBe("none");
    expect(on.moneyLastsToAge).toBe(on.lifeExpectancy);
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

  it("the holding-dependency and cash-buffer robustness factors are filtered out", () => {
    const breakdown: ScoreFactor[] = [
      { label: "Lav afhængighed af holding", detail: "Holding udgør 0 % af slutaktiverne", impact: "neutral", magnitude: "low" },
      { label: "Lav kontant buffer", detail: "0,0 måneders forbrug", impact: "negative", magnitude: "low" },
      { label: "Ingen cashflow-shortfall", detail: "", impact: "positive", magnitude: "high" },
    ];
    const drivers = adaptRobustnessDrivers(breakdown, {
      hasFiTarget: false,
      endOfHorizonNetWorth: 5_000_000,
      fiTargetMinNetWorth: 0,
      annualSpending: 240_000,
    });
    // the cashflow-coverage driver survives; holding + buffer are dropped and never named
    expect(drivers).toContainEqual({ direction: "helps", text: "Dit forbrug er dækket hele perioden." });
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

  it("the bottleneck reads the FIRST-shortfall row's monthlyGap, not the average and not a re-derived shortfallAmount/12", () => {
    // monthlyGap on the shortfall rows is set explicitly, and deliberately != shortfallAmount/12,
    // to prove the bottleneck reads the engine's YearRow.monthlyGap field rather than re-dividing.
    const ys = [
      y(60, 500_000),
      y(61, 300_000),
      y(62, 0, true, /* shortfallAmount */ 99_999, /* monthlyGap */ 2_000),
      y(63, 0, true, 120_000, 2_500),
    ];
    const inputs: SimplePublicInputs = { ...BASE_INPUTS, currentAge: 60, lifeExpectancy: 63, desiredStopAge: 60 };
    // average gap (a smaller, different number) is set to a sentinel that must NOT be used
    const kpis = makeKpis({ modelStatus: "invalid", monthlyGapAfterStop: 777, firstShortfallAge: 62 });
    const r = buildPublicResult(inputs, ys, kpis);

    expect(r.bottleneck.kind).toBe("shortfall");
    if (r.bottleneck.kind === "shortfall") {
      expect(r.bottleneck.firstShortfallAge).toBe(62); // first shortfall row
      expect(r.bottleneck.monthlyGap).toBe(2_000); // reads YearRow.monthlyGap (not 99_999 / 12)
      expect(r.bottleneck.monthlyGap).not.toBe(99_999 / 12); // not a re-derived shortfallAmount / 12
      expect(r.bottleneck.monthlyGap).not.toBe(777); // never the after-stop average
    }
    // sanity: the helper picks the first shortfall row
    expect(firstShortfall(ys)?.age).toBe(62);
  });
});

// ---------------------------------------------------------------------------
// 4. Positive driver presence
//    The drivers adapter is default-deny and matches Danish substrings of ScoreFactor.label.
//    The leak tests only assert forbidden factors are ABSENT, so a reword of a label in kpis.ts
//    would make an expected driver silently disappear with no failure. These positive tests run
//    the REAL engine and assert the expected public drivers ARE present.
// ---------------------------------------------------------------------------

describe("positive driver presence (real engine — catches silent disappearance on kpis.ts label rewords)", () => {
  it("on-track plan surfaces the cashflow-coverage and end-of-horizon-margin families (positive)", () => {
    const drivers = computePublicResult(HIGH_SAVER).drivers;
    expect(drivers).toEqual(
      expect.arrayContaining([
        { direction: "helps", text: "Dit forbrug er dækket hele perioden." }, // cashflow coverage
        { direction: "helps", text: "Du har god margin ved planperiodens slutning." }, // end-of-horizon margin
      ]),
    );
  });

  it("off-track plan surfaces the cashflow-coverage family (negative)", () => {
    const drivers = computePublicResult(DEFAULT_SIMPLE_INPUTS).drivers;
    expect(drivers).toEqual(
      expect.arrayContaining([
        { direction: "hurts", text: "Pengene slipper op ved alder 86." }, // cashflow coverage (negative)
      ]),
    );
  });
});

// ---------------------------------------------------------------------------
// 5. End-of-horizon margin driver must not be eaten by a "buffer" in its detail (Codex P2.1)
// ---------------------------------------------------------------------------

describe("end-of-horizon-margin driver (recomputed from the last YearRow, never age 95)", () => {
  it("is recomputed from ctx, so the engine factor's 'buffer' detail is never read; cash-buffer + holding still filtered", () => {
    const breakdown: ScoreFactor[] = [
      // engine's age-95 end-margin factor — IGNORED by the adapter (its detail mentions "buffer").
      {
        label: "Lav margin til minimumsmål",
        detail: "Slutformue er kun 48 % over minimumsmålet (mål: 5× årsforbrug i buffer).",
        impact: "negative",
        magnitude: "medium",
      },
      // Genuine cash-buffer factor — dropped by its own family, not by the word "buffer".
      { label: "Lav kontant buffer", detail: "Buffer svarer til ca. 0,0 måneders forbrug.", impact: "negative", magnitude: "medium" },
      { label: "Lav afhængighed af holding", detail: "Holding udgør 0 % af slutaktiverne.", impact: "neutral", magnitude: "low" },
    ];
    // ctx: end value 13.5M just over a 13M goal → a thin margin, recomputed from the last row.
    const drivers = adaptRobustnessDrivers(breakdown, {
      hasFiTarget: true,
      endOfHorizonNetWorth: 13_500_000,
      fiTargetMinNetWorth: 13_000_000,
      annualSpending: 216_000,
    });
    expect(drivers).toContainEqual({ direction: "hurts", text: "Der er kun lille margin til dit mål ved planperiodens slutning." });
    expect(drivers.some((d) => /buffer/i.test(d.text))).toBe(false);
    expect(drivers.some((d) => /holding/i.test(d.text))).toBe(false);
    expect(drivers).toHaveLength(1); // only the recomputed end-margin driver
  });

  it("real engine (lifeExpectancy <= 95): a valid plan with a low end-of-horizon margin surfaces the thin-margin driver", () => {
    // target just under the plan's end net worth → valid (on track) but a low margin.
    const r = computePublicResult({ ...HIGH_SAVER, fiTargetMinNetWorth: 13_000_000 });
    expect(r.status.kind).toBe("on_track");
    const texts = r.drivers.map((d) => d.text);
    expect(texts).toContain("Der er kun lille margin til dit mål ved planperiodens slutning.");
    for (const d of r.drivers) {
      expect(/buffer/i.test(d.text)).toBe(false);
      expect(/holding/i.test(d.text)).toBe(false);
    }
  });

  it("lifeExpectancy > 95: end-margin reflects the LAST YearRow (age 110), not the comfortable age-95 value", () => {
    // Comfortable at age 95 (12M, well above the 5M goal), but the real end (age 110) is below it.
    const ys: YearRow[] = [];
    for (let a = 35; a <= 110; a++) {
      const nw = a <= 95 ? 12_000_000 : 12_000_000 - (a - 95) * 750_000; // declines after 95 → ~750k at 110
      ys.push(y(a, nw)); // no shortfall anywhere
    }
    const inputs: SimplePublicInputs = {
      ...BASE_INPUTS,
      currentAge: 35,
      lifeExpectancy: 110,
      desiredStopAge: 60,
      monthlySpending: 20_000,
      fiTargetMinNetWorth: 5_000_000,
    };
    // The engine would push a "comfortable" end-margin factor from the age-95 value — the adapter
    // must NOT trust it; it recomputes from the last YearRow.
    const kpis = makeKpis({
      modelStatus: "valid",
      robustnessBreakdown: [
        { label: "Ingen cashflow-shortfall", detail: "", impact: "positive", magnitude: "high" },
        { label: "Komfortabel slutmargin", detail: "Slutformue er 6.5× over 5-års forbrugsmargin.", impact: "positive", magnitude: "medium" },
      ],
    });
    const r = buildPublicResult(inputs, ys, kpis);
    const texts = r.drivers.map((d) => d.text);
    // must NOT claim good end-of-plan margin (that would be the forbidden fixed-age-95 anchor)
    expect(texts).not.toContain("Du har god margin ved planperiodens slutning.");
    // reflects the real end (age 110, below the goal)
    expect(texts).toContain("Du når ikke dit mål ved planperiodens slutning.");
  });
});

// ---------------------------------------------------------------------------
// 6. Robustness score & assumption confidence scalars (Codex P2.2 — contract §4.2)
// ---------------------------------------------------------------------------

describe("robustness & assumption-confidence scalars", () => {
  it("score banding: clamps to [0,100], rounds, and labels by band", () => {
    expect(toRobustnessScore(25)).toEqual({ score: 25, label: "Lav robusthed" });
    expect(toRobustnessScore(55)).toEqual({ score: 55, label: "Middel robusthed" });
    expect(toRobustnessScore(90)).toEqual({ score: 90, label: "Høj robusthed" });
    // boundaries
    expect(toRobustnessScore(40).label).toBe("Middel robusthed");
    expect(toRobustnessScore(70).label).toBe("Høj robusthed");
    expect(toAssumptionConfidenceScore(75)).toEqual({ score: 75, label: "Rimelig antagelsessikkerhed" });
    expect(toAssumptionConfidenceScore(30).label).toBe("Lav antagelsessikkerhed");
    expect(toAssumptionConfidenceScore(80).label).toBe("Høj antagelsessikkerhed");
    // clamping / non-finite
    expect(toRobustnessScore(-10).score).toBe(0);
    expect(toRobustnessScore(150).score).toBe(100);
    expect(toRobustnessScore(63.6).score).toBe(64);
    expect(toAssumptionConfidenceScore(Number.NaN).score).toBe(0);
  });

  it("PublicResult exposes both scalars with sane bounds and matching Danish bands", () => {
    for (const inp of [DEFAULT_SIMPLE_INPUTS, HIGH_SAVER]) {
      const r = computePublicResult(inp);
      for (const s of [r.robustness, r.assumptionConfidence]) {
        expect(Number.isInteger(s.score)).toBe(true);
        expect(s.score).toBeGreaterThanOrEqual(0);
        expect(s.score).toBeLessThanOrEqual(100);
        expect(s.label.length).toBeGreaterThan(0);
      }
      // label is always consistent with the score band (pure-function parity)
      expect(r.robustness).toEqual(toRobustnessScore(r.robustness.score));
      expect(r.assumptionConfidence).toEqual(toAssumptionConfidenceScore(r.assumptionConfidence.score));
    }
  });

  it("golden bands: off-track persona is low robustness, high-saver is high robustness", () => {
    const off = computePublicResult(DEFAULT_SIMPLE_INPUTS);
    expect(off.robustness.score).toBeLessThan(40);
    expect(off.robustness.label).toBe("Lav robusthed");

    const on = computePublicResult(HIGH_SAVER);
    expect(on.robustness.score).toBeGreaterThanOrEqual(70);
    expect(on.robustness.label).toBe("Høj robusthed");
  });

  it("the scalar labels carry no advanced/DK term", () => {
    for (const inp of [DEFAULT_SIMPLE_INPUTS, HIGH_SAVER]) {
      const r = computePublicResult(inp);
      expect(containsForbiddenTerm(r.robustness.label)).toBe(false);
      expect(containsForbiddenTerm(r.assumptionConfidence.label)).toBe(false);
    }
  });
});
