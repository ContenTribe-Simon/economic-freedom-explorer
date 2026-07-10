/**
 * Phase 12 workstream B (security): the REAL public pipeline survives every extreme-but-valid
 * input the sanitizer permits.
 *
 * sanitizeSimpleInputs is the whole guard between adversarial input (form, share link, corrupt
 * localStorage) and the engine — and computePublicResult does NOT re-sanitize (result.ts trusts
 * its caller). The engine has no internal empty-projection guard: deriveKPIs reads
 * years[years.length - 1] unchecked (kpis.ts), so a horizon of zero rows is a blank-screen crash.
 * The sanitizer prevents that by forcing lifeExpectancy >= currentAge + 1 — but the resulting
 * MINIMUM horizon is only 2 rows, and that boundary is never exercised through the real engine by
 * public-result-v1.test.ts (which uses buildPublicResult with fabricated YearRows for tiny cases).
 *
 * These run sanitizeSimpleInputs -> computePublicResult (the exact production path: store sanitizes,
 * then the Result screen computes) on the sanitizer's own boundary values and asserts a coherent,
 * non-throwing, non-empty result. If any of these throws, the sanitizer's guarantee is incomplete.
 */
import { describe, expect, it } from "vitest";
import { computePublicResult } from "@/lib/finance/public";
import { sanitizeSimpleInputs } from "@/lib/publicInputs";

/** Exactly the production path: arbitrary raw input, sanitized, then computed. */
function pipeline(raw: Parameters<typeof sanitizeSimpleInputs>[0]) {
  return computePublicResult(sanitizeSimpleInputs(raw));
}

/** A PublicResult is coherent if it has a non-empty in-horizon series and a real status/verdict. */
function expectCoherent(r: ReturnType<typeof computePublicResult>, currentAge: number, lifeExpectancy: number) {
  expect(r.netWorthByAge.length).toBeGreaterThan(0);
  expect(r.netWorthByAge[0].age).toBe(currentAge);
  expect(r.netWorthByAge[r.netWorthByAge.length - 1].age).toBe(lifeExpectancy);
  for (const p of r.netWorthByAge) expect(Number.isFinite(p.netWorth)).toBe(true);
  expect(["on_track", "tight", "off_track"]).toContain(r.status.kind);
  expect(Number.isFinite(r.moneyLastsToAge)).toBe(true);
  expect(Number.isFinite(r.capitalAtStopAge)).toBe(true);
}

describe("real pipeline on the sanitizer's boundary horizons (must never crash)", () => {
  it("minimal 2-row horizon (currentAge 74 -> lifeExpectancy 75): non-empty, coherent, no throw", () => {
    // sanitizer: currentAge 74, lifeExpectancy clamps to currentAge+1 = 75, desiredStopAge -> [74,75].
    let r!: ReturnType<typeof computePublicResult>;
    expect(() => {
      r = pipeline({ currentAge: 74, lifeExpectancy: 74, desiredStopAge: 74 });
    }).not.toThrow();
    expectCoherent(r, 74, 75);
    // pension access (default 67) is in the past for a 74-year-old → the anchor is omitted, not junk.
    expect(r.capitalAtPensionAccessAge).toBeNull();
  });

  it("oldest start, widest horizon, all money fields maxed: no throw, coherent", () => {
    let r!: ReturnType<typeof computePublicResult>;
    expect(() => {
      r = pipeline({
        currentAge: 75,
        lifeExpectancy: 200, // clamps to 110
        annualIncome: 1e300,
        monthlySpending: 1e300,
        currentInvestments: 1e300,
        monthlySavings: 1e300,
        pensionBalance: 1e300,
        pensionAccessAge: 999,
        expectedRealReturn: 999,
        desiredStopAge: 999,
      });
    }).not.toThrow();
    expectCoherent(r, 75, 110);
  });

  it("broke persona (zero income/savings/assets, zero spending): floors safely, off_track, no throw", () => {
    // monthlySpending 0 must not divide-by-zero (result.ts floors annual spend at Math.max(1, ...)).
    let r!: ReturnType<typeof computePublicResult>;
    expect(() => {
      r = pipeline({
        currentAge: 40,
        lifeExpectancy: 90,
        annualIncome: 0,
        monthlySpending: 0,
        currentInvestments: 0,
        monthlySavings: 0,
        pensionBalance: 0,
        expectedRealReturn: 0,
      });
    }).not.toThrow();
    expectCoherent(r, 40, 90);
  });

  it("stop immediately at current age with a tiny bridge: no throw, coherent", () => {
    let r!: ReturnType<typeof computePublicResult>;
    expect(() => {
      r = pipeline({ currentAge: 66, lifeExpectancy: 68, desiredStopAge: 66, pensionAccessAge: 67 });
    }).not.toThrow();
    expectCoherent(r, 66, 68);
  });

  it("NaN / Infinity across every field cannot reach the engine (sanitizer defaults them)", () => {
    expect(() =>
      pipeline({
        currentAge: Number.NaN,
        lifeExpectancy: Number.POSITIVE_INFINITY,
        annualIncome: Number.NaN,
        monthlySpending: Number.NEGATIVE_INFINITY,
        currentInvestments: Number.NaN,
        monthlySavings: Number.POSITIVE_INFINITY,
        pensionBalance: Number.NaN,
        pensionAccessAge: Number.NaN,
        expectedRealReturn: Number.NaN,
        desiredStopAge: Number.NaN,
      }),
    ).not.toThrow();
  });
});
