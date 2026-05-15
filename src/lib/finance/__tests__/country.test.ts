import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import {
  computeCountryFireResults,
  DEFAULT_COUNTRY_PROFILES,
  DEFAULT_COUNTRY_ANALYSIS_SETTINGS,
  formatWithdrawalRatePct,
  makeBlankCountryProfile,
  normalizeCountryAnalysisSettings,
  normalizeCountryProfile,
  resolveAnalysisAge,
  summarizeCountryStatus,
  type CountryProfile,
} from "../country";
import { buildSnapshot } from "../snapshots";

function baseScenario() {
  return makeBaseScenario();
}

describe("Country FIRE — does not change projection", () => {
  it("computeCountryFireResults is non-mutating", () => {
    const s = baseScenario();
    const ys1 = project(s, defaultAssumptions);
    const before = JSON.stringify(ys1.map((y) => y.netWorth));
    computeCountryFireResults(s, ys1, defaultAssumptions, DEFAULT_COUNTRY_PROFILES);
    const ys2 = project(s, defaultAssumptions);
    const after = JSON.stringify(ys2.map((y) => y.netWorth));
    expect(after).toBe(before);
  });

  it("empty country list yields empty results", () => {
    const s = baseScenario();
    const ys = project(s, defaultAssumptions);
    expect(computeCountryFireResults(s, ys, defaultAssumptions, [])).toEqual([]);
  });

  it("disabled countries are ignored", () => {
    const s = baseScenario();
    const ys = project(s, defaultAssumptions);
    const profiles = DEFAULT_COUNTRY_PROFILES.map((p) => ({ ...p, enabled: false }));
    expect(computeCountryFireResults(s, ys, defaultAssumptions, profiles)).toEqual([]);
  });

  it("currency label does not affect computation", () => {
    const s = baseScenario();
    const ys = project(s, defaultAssumptions);
    const a: CountryProfile = { ...makeBlankCountryProfile("A"), currency: "DKK", monthlyCostStandard: 20000 };
    const b: CountryProfile = { ...a, currency: "VND" };
    const ra = computeCountryFireResults(s, ys, defaultAssumptions, [a]);
    const rb = computeCountryFireResults(s, ys, defaultAssumptions, [b]);
    expect(ra[1].totalAnnualNeed).toBe(rb[1].totalAnnualNeed);
    expect(ra[1].selectedCapitalNeed).toBe(rb[1].selectedCapitalNeed);
  });
});

describe("Country FIRE — capital need math", () => {
  const profile: CountryProfile = {
    id: "x",
    name: "Test",
    enabled: true,
    monthlyCostLean: 10000,
    monthlyCostStandard: 20000,
    monthlyCostComfortable: 30000,
    annualHealthcareCost: 0,
    annualTravelHomeCost: 0,
    annualAdminCost: 0,
    effectiveTaxOrFrictionPct: 0,
    currencyRiskBufferPct: 0,
    generalSafetyBufferPct: 0,
  };

  it("capitalNeed35 = annual / 0.035 and capitalNeed40 = annual / 0.04", () => {
    const s = baseScenario();
    const ys = project(s, defaultAssumptions);
    const r = computeCountryFireResults(s, ys, defaultAssumptions, [profile]);
    const std = r.find((x) => x.lifestyle === "standard")!;
    expect(std.totalAnnualNeed).toBeCloseTo(20000 * 12, 6);
    expect(std.capitalNeed35).toBeCloseTo(std.totalAnnualNeed / 0.035, 4);
    expect(std.capitalNeed40).toBeCloseTo(std.totalAnnualNeed / 0.04, 4);
  });

  it("extras and friction are added on top of base spend", () => {
    const p: CountryProfile = {
      ...profile,
      annualHealthcareCost: 12000,
      annualTravelHomeCost: 8000,
      effectiveTaxOrFrictionPct: 0.10,
    };
    const s = baseScenario();
    const ys = project(s, defaultAssumptions);
    const r = computeCountryFireResults(s, ys, defaultAssumptions, [p]);
    const std = r.find((x) => x.lifestyle === "standard")!;
    expect(std.totalAnnualNeed).toBeCloseTo((20000 * 12 + 12000 + 8000) * 1.10, 4);
  });

  it("gap = max(0, need - expectedCapital)", () => {
    const s = baseScenario();
    const ys = project(s, defaultAssumptions);
    const r = computeCountryFireResults(s, ys, defaultAssumptions, [profile]);
    for (const row of r) {
      expect(row.gap).toBeCloseTo(Math.max(0, row.selectedCapitalNeed - row.expectedCapitalAtReferenceAge), 6);
    }
  });
});

describe("Country FIRE — achievedAge & card status", () => {
  it("low-need country with high capital is achieved", () => {
    const s = makeBaseScenario();
    s.inputs.free.balance = 30_000_000;
    s.inputs.holding.balance = 0;
    s.inputs.holding.expectedExitValue = 0;
    const ys = project(s, defaultAssumptions);
    const cheap: CountryProfile = {
      ...makeBlankCountryProfile("Cheap"),
      monthlyCostLean: 5000,
      monthlyCostStandard: 8000,
      monthlyCostComfortable: 12000,
    };
    const r = computeCountryFireResults(s, ys, defaultAssumptions, [cheap]);
    const std = r.find((x) => x.lifestyle === "standard")!;
    expect(std.achievedAge).not.toBeNull();
    expect(std.status).toBe("achieved");
  });

  it("card does not say 'Ingen niveauer opnået' if Lean is achieved but Standard is not", () => {
    const s = makeBaseScenario();
    s.inputs.free.balance = 30_000_000;
    s.inputs.holding.balance = 0;
    s.inputs.holding.expectedExitValue = 0;
    const ys = project(s, defaultAssumptions);
    const mixed: CountryProfile = {
      ...makeBlankCountryProfile("Mixed"),
      monthlyCostLean: 5000,
      monthlyCostStandard: 2_000_000,
      monthlyCostComfortable: 5_000_000,
    };
    const r = computeCountryFireResults(s, ys, defaultAssumptions, [mixed]);
    const summary = summarizeCountryStatus(r, mixed.id);
    expect(summary.tone).toBe("near");
    expect(summary.label).toContain("Lean");
    expect(summary.label).toContain("Standard ikke opnået");
    expect(summary.standardAchieved).toBe(false);
    expect(summary.achievedLifestyle).toBe("lean");
  });

  it("card says 'Ingen niveauer opnået' when all levels miss", () => {
    const s = makeBaseScenario();
    s.inputs.free.balance = 100_000;
    s.inputs.holding.balance = 0;
    s.inputs.holding.expectedExitValue = 0;
    s.inputs.pension.balance = 0;
    const ys = project(s, defaultAssumptions);
    const expensive: CountryProfile = {
      ...makeBlankCountryProfile("Expensive"),
      monthlyCostLean: 60000,
      monthlyCostStandard: 100000,
      monthlyCostComfortable: 150000,
    };
    const r = computeCountryFireResults(s, ys, defaultAssumptions, [expensive]);
    const summary = summarizeCountryStatus(r, expensive.id);
    expect(summary.tone).toBe("not_achieved");
    expect(summary.label).toBe("Ingen niveauer opnået");
  });
});

describe("Country FIRE — sustainable monthly net", () => {
  it("scales with capital × rate", () => {
    const s = makeBaseScenario();
    s.inputs.free.balance = 10_000_000;
    s.inputs.holding.balance = 0;
    s.inputs.holding.expectedExitValue = 0;
    const ys = project(s, defaultAssumptions);
    const p: CountryProfile = { ...makeBlankCountryProfile("S"), monthlyCostStandard: 20000 };
    const r = computeCountryFireResults(s, ys, defaultAssumptions, [p], { withdrawalRate: 0.04 });
    const std = r.find((x) => x.lifestyle === "standard")!;
    expect(std.sustainableMonthlyNetAtReferenceAge).toBeCloseTo(
      (std.expectedCapitalAtReferenceAge * 0.04) / 12,
      4,
    );
  });
});

describe("Country FIRE — gross vs country-specific sustainable", () => {
  it("gross sustainable = capital × rate / 12", () => {
    const s = makeBaseScenario();
    s.inputs.free.balance = 10_000_000;
    const ys = project(s, defaultAssumptions);
    const p: CountryProfile = {
      ...makeBlankCountryProfile("X"),
      monthlyCostStandard: 20000,
      annualHealthcareCost: 30000,
      effectiveTaxOrFrictionPct: 0.10,
      generalSafetyBufferPct: 0.05,
    };
    const r = computeCountryFireResults(s, ys, defaultAssumptions, [p], { withdrawalRate: 0.035 });
    const std = r.find((x) => x.lifestyle === "standard")!;
    expect(std.grossSustainableMonthlyAtReferenceAge).toBeCloseTo(
      (std.expectedCapitalAtReferenceAge * 0.035) / 12,
      4,
    );
  });

  it("gross sustainable is identical across countries with same capital base", () => {
    const s = makeBaseScenario();
    const ys = project(s, defaultAssumptions);
    const a: CountryProfile = {
      ...makeBlankCountryProfile("A"),
      monthlyCostStandard: 10000,
      annualHealthcareCost: 0,
      effectiveTaxOrFrictionPct: 0,
      currencyRiskBufferPct: 0,
      generalSafetyBufferPct: 0,
    };
    const b: CountryProfile = {
      ...makeBlankCountryProfile("B"),
      monthlyCostStandard: 50000,
      annualHealthcareCost: 80000,
      effectiveTaxOrFrictionPct: 0.20,
      currencyRiskBufferPct: 0.05,
      generalSafetyBufferPct: 0.05,
    };
    const r = computeCountryFireResults(s, ys, defaultAssumptions, [a, b], { withdrawalRate: 0.035 });
    const ra = r.find((x) => x.countryId === a.id && x.lifestyle === "standard")!;
    const rb = r.find((x) => x.countryId === b.id && x.lifestyle === "standard")!;
    expect(ra.grossSustainableMonthlyAtReferenceAge).toBeCloseTo(
      rb.grossSustainableMonthlyAtReferenceAge,
      6,
    );
  });

  it("country-specific sustainable falls when annual extras rise", () => {
    const s = makeBaseScenario();
    s.inputs.free.balance = 10_000_000;
    const ys = project(s, defaultAssumptions);
    const lo: CountryProfile = { ...makeBlankCountryProfile("Lo"), monthlyCostStandard: 10000, annualHealthcareCost: 0 };
    const hi: CountryProfile = { ...makeBlankCountryProfile("Hi"), monthlyCostStandard: 10000, annualHealthcareCost: 100000 };
    const r = computeCountryFireResults(s, ys, defaultAssumptions, [lo, hi]);
    const sLo = r.find((x) => x.countryId === lo.id && x.lifestyle === "standard")!;
    const sHi = r.find((x) => x.countryId === hi.id && x.lifestyle === "standard")!;
    expect(sHi.sustainableMonthlyNetAtReferenceAge).toBeLessThan(sLo.sustainableMonthlyNetAtReferenceAge);
  });

  it("country-specific sustainable falls when friction/buffers rise", () => {
    const s = makeBaseScenario();
    s.inputs.free.balance = 10_000_000;
    const ys = project(s, defaultAssumptions);
    const lo: CountryProfile = { ...makeBlankCountryProfile("Lo"), monthlyCostStandard: 10000 };
    const hi: CountryProfile = {
      ...makeBlankCountryProfile("Hi"),
      monthlyCostStandard: 10000,
      effectiveTaxOrFrictionPct: 0.20,
      generalSafetyBufferPct: 0.10,
    };
    const r = computeCountryFireResults(s, ys, defaultAssumptions, [lo, hi]);
    const sLo = r.find((x) => x.countryId === lo.id && x.lifestyle === "standard")!;
    const sHi = r.find((x) => x.countryId === hi.id && x.lifestyle === "standard")!;
    expect(sHi.sustainableMonthlyNetAtReferenceAge).toBeLessThan(sLo.sustainableMonthlyNetAtReferenceAge);
  });

  it("monthlyShortfall when sustainable < desired, else 0; surplus mirror", () => {
    const s = makeBaseScenario();
    s.inputs.free.balance = 100_000;
    const ys = project(s, defaultAssumptions);
    const p: CountryProfile = { ...makeBlankCountryProfile("Tight"), monthlyCostStandard: 50000 };
    const r = computeCountryFireResults(s, ys, defaultAssumptions, [p]);
    const std = r.find((x) => x.lifestyle === "standard")!;
    expect(std.monthlyShortfall).toBeGreaterThan(0);
    expect(std.monthlySurplus).toBe(0);
    const diff = std.sustainableMonthlyNetAtReferenceAge - std.monthlyNetCost;
    expect(std.monthlyShortfall).toBeCloseTo(-diff, 4);
  });

  it("monthlySurplus when sustainable > desired", () => {
    const s = makeBaseScenario();
    s.inputs.free.balance = 30_000_000;
    s.inputs.holding.balance = 0;
    s.inputs.holding.expectedExitValue = 0;
    const ys = project(s, defaultAssumptions);
    const p: CountryProfile = { ...makeBlankCountryProfile("Cheap"), monthlyCostStandard: 5000 };
    const r = computeCountryFireResults(s, ys, defaultAssumptions, [p]);
    const std = r.find((x) => x.lifestyle === "standard")!;
    expect(std.monthlySurplus).toBeGreaterThan(0);
    expect(std.monthlyShortfall).toBe(0);
  });
});

describe("Country FIRE — only economic drivers", () => {
  it("no result field references uncertainty/visa/healthcare/personalFit", () => {
    const s = baseScenario();
    const ys = project(s, defaultAssumptions);
    const r = computeCountryFireResults(s, ys, defaultAssumptions, DEFAULT_COUNTRY_PROFILES);
    for (const row of r) {
      expect(row).not.toHaveProperty("uncertaintyScore");
      for (const d of row.keyDrivers) {
        expect(d.toLowerCase()).not.toMatch(/visum|visa|sundhed|fit|usikkerhed/);
      }
    }
  });
});

describe("Country profiles — normalisering & legacy migration", () => {
  it("normalizeCountryProfile fills missing fields", () => {
    const out = normalizeCountryProfile({ name: "X" });
    expect(out.name).toBe("X");
    expect(out.enabled).toBe(true);
    expect(out.monthlyCostStandard).toBeGreaterThanOrEqual(0);
  });

  it("strips legacy uncertainty/personalFit fields without crashing", () => {
    const legacy: any = {
      id: "legacy-1",
      name: "Legacy",
      enabled: true,
      currency: "EUR",
      monthlyCostLean: 1000,
      monthlyCostStandard: 2000,
      monthlyCostComfortable: 3000,
      effectiveTaxOrFrictionPct: 0.05,
      visaUncertainty: "high",
      taxUncertainty: "high",
      healthcareUncertainty: "high",
      personalFit: "low",
      uncertaintyScore: 99,
    };
    const out: any = normalizeCountryProfile(legacy);
    expect(out.id).toBe("legacy-1");
    expect(out.monthlyCostStandard).toBe(2000);
    expect(out.effectiveTaxOrFrictionPct).toBeCloseTo(0.05);
    expect(out.visaUncertainty).toBeUndefined();
    expect(out.taxUncertainty).toBeUndefined();
    expect(out.healthcareUncertainty).toBeUndefined();
    expect(out.personalFit).toBeUndefined();
    expect(out.uncertaintyScore).toBeUndefined();
  });

  it("snapshots freeze countryProfiles", () => {
    const s = makeBaseScenario();
    const profiles = DEFAULT_COUNTRY_PROFILES.slice(0, 2);
    const snap = buildSnapshot(s, [s], defaultAssumptions, { countryProfiles: profiles });
    expect(snap.countryProfiles).toBeDefined();
    expect(snap.countryProfiles!.length).toBe(2);
    profiles[0].name = "MUTATED";
    expect(snap.countryProfiles![0].name).not.toBe("MUTATED");
  });
});

describe("Country profiles — JSON export/import roundtrip via store", () => {
  it("exportJson includes economic fields and importJson restores them", async () => {
    const { useFinanceStore } = await import("@/store/financeStore");
    const store = useFinanceStore.getState();
    store.resetCountryProfilesToDefaults();
    const beforeIds = useFinanceStore.getState().countryProfiles.map((c) => c.id).sort();
    const json = store.exportJson();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed.countryProfiles)).toBe(true);
    expect(parsed.countryProfiles.length).toBeGreaterThan(0);
    expect(parsed.countryProfiles[0].monthlyCostStandard).toBeGreaterThanOrEqual(0);

    store.removeCountryProfile(beforeIds[0]);
    store.importJson(json);
    const afterIds = useFinanceStore.getState().countryProfiles.map((c) => c.id).sort();
    expect(afterIds).toEqual(beforeIds);
  });

  it("legacy JSON with old uncertainty fields imports without crashing", async () => {
    const { useFinanceStore } = await import("@/store/financeStore");
    const store = useFinanceStore.getState();
    const json = store.exportJson();
    const parsed = JSON.parse(json);
    parsed.countryProfiles = [
      {
        id: "old-1",
        name: "Old",
        enabled: true,
        monthlyCostLean: 1000,
        monthlyCostStandard: 2000,
        monthlyCostComfortable: 3000,
        visaUncertainty: "high",
        taxUncertainty: "medium",
        healthcareUncertainty: "low",
        personalFit: "low",
      },
    ];
    expect(() => store.importJson(JSON.stringify(parsed))).not.toThrow();
    const profs: any[] = useFinanceStore.getState().countryProfiles;
    expect(profs[0].id).toBe("old-1");
    expect(profs[0].visaUncertainty).toBeUndefined();
  });
});

describe("Withdrawal rate formatting", () => {
  it("formats 0.035 as '3,5' (not 3.50000000)", () => {
    expect(formatWithdrawalRatePct(0.035)).toBe("3,5");
  });
  it("formats 0.04 as '4'", () => {
    expect(formatWithdrawalRatePct(0.04)).toBe("4");
  });
  it("formats with at most one decimal (no noisy zeros)", () => {
    expect(formatWithdrawalRatePct(0.0325)).toBe("3,3");
  });
});
