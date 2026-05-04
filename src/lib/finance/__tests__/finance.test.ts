import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import { deriveKPIs } from "../kpis";
import { laborTax, shareTax, pensionPayoutTax } from "../tax";

describe("tax", () => {
  it("labor tax non-negative", () => {
    const r = laborTax(750000, defaultAssumptions.tax);
    expect(r.tax).toBeGreaterThan(0);
    expect(r.net).toBeLessThan(750000);
    expect(r.net + r.tax).toBeCloseTo(750000, 0);
  });
  it("share tax thresholds", () => {
    const a = defaultAssumptions.tax;
    const low = shareTax(a.shareThreshold, a);
    expect(low.tax).toBeCloseTo(a.shareThreshold * a.shareLowRate);
    const high = shareTax(a.shareThreshold * 2, a);
    expect(high.tax).toBeGreaterThan(low.tax);
  });
  it("pension payout flat", () => {
    const r = pensionPayoutTax(100000, defaultAssumptions.tax);
    expect(r.tax).toBeCloseTo(40000);
  });
});

describe("projection", () => {
  it("produces a row per year", () => {
    const s = makeBaseScenario();
    const years = project(s, defaultAssumptions);
    expect(years.length).toBe(s.inputs.person.lifeExpectancy - s.inputs.person.currentAge + 1);
  });
  it("net worth finite and KPIs derive", () => {
    const s = makeBaseScenario();
    const years = project(s, defaultAssumptions);
    const k = deriveKPIs(s, years);
    expect(Number.isFinite(k.capitalAt95)).toBe(true);
    expect(k.robustnessScore).toBeGreaterThanOrEqual(0);
    expect(k.robustnessScore).toBeLessThanOrEqual(100);
  });
});
