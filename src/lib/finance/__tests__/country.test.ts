import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import {
  computeCountryFireResults,
  DEFAULT_COUNTRY_PROFILES,
  makeBlankCountryProfile,
  normalizeCountryProfile,
  type CountryProfile,
} from "../country";
import { buildSnapshot } from "../snapshots";

function baseScenario() {
  const s = makeBaseScenario();
  return s;
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

  it("empty country list yields empty results, projection unchanged", () => {
    const s = baseScenario();
    const ys = project(s, defaultAssumptions);
    const r = computeCountryFireResults(s, ys, defaultAssumptions, []);
    expect(r).toEqual([]);
    const ys2 = project(s, defaultAssumptions);
    expect(JSON.stringify(ys2)).toBe(JSON.stringify(ys));
  });

  it("disabled countries are ignored", () => {
    const s = baseScenario();
    const ys = project(s, defaultAssumptions);
    const profiles = DEFAULT_COUNTRY_PROFILES.map((p) => ({ ...p, enabled: false }));
    const r = computeCountryFireResults(s, ys, defaultAssumptions, profiles);
    expect(r).toEqual([]);
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
    visaUncertainty: "low",
    taxUncertainty: "low",
    healthcareUncertainty: "low",
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
    const expected = (20000 * 12 + 12000 + 8000) * 1.10;
    expect(std.totalAnnualNeed).toBeCloseTo(expected, 4);
  });

  it("gap = max(0, need - expectedCapital)", () => {
    const s = baseScenario();
    const ys = project(s, defaultAssumptions);
    const r = computeCountryFireResults(s, ys, defaultAssumptions, [profile]);
    for (const row of r) {
      const expected = Math.max(0, row.selectedCapitalNeed - row.expectedCapitalAtReferenceAge);
      expect(row.gap).toBeCloseTo(expected, 6);
    }
  });
});

describe("Country FIRE — achievedAge", () => {
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

  it("expensive country with low capital is not achieved", () => {
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
    const std = r.find((x) => x.lifestyle === "standard")!;
    expect(std.achievedAge).toBeNull();
    expect(std.status).toBe("not_achieved");
  });
});

describe("Country FIRE — sustainable monthly net", () => {
  it("scales linearly with capital × rate", () => {
    const s = makeBaseScenario();
    s.inputs.free.balance = 10_000_000;
    s.inputs.holding.balance = 0;
    s.inputs.holding.expectedExitValue = 0;
    const ys = project(s, defaultAssumptions);
    const p: CountryProfile = {
      ...makeBlankCountryProfile("S"),
      monthlyCostStandard: 20000,
      annualHealthcareCost: 0,
      annualTravelHomeCost: 0,
      annualAdminCost: 0,
      effectiveTaxOrFrictionPct: 0,
      currencyRiskBufferPct: 0,
      generalSafetyBufferPct: 0,
    };
    const r = computeCountryFireResults(s, ys, defaultAssumptions, [p], { withdrawalRate: 0.04 });
    const std = r.find((x) => x.lifestyle === "standard")!;
    // Uden friktion/extras: sustainable = capital * 0.04 / 12
    const expected = (std.expectedCapitalAtReferenceAge * 0.04) / 12;
    expect(std.sustainableMonthlyNetAtReferenceAge).toBeCloseTo(expected, 4);
  });
});

describe("Country FIRE — uncertainty does not affect projection", () => {
  it("changing uncertainty fields does not change projection or capital math", () => {
    const s = baseScenario();
    const ys = project(s, defaultAssumptions);
    const p1: CountryProfile = {
      ...makeBlankCountryProfile("U"),
      monthlyCostStandard: 20000,
      visaUncertainty: "low",
      taxUncertainty: "low",
      healthcareUncertainty: "low",
    };
    const p2: CountryProfile = { ...p1, visaUncertainty: "high", taxUncertainty: "high", healthcareUncertainty: "high" };
    const r1 = computeCountryFireResults(s, ys, defaultAssumptions, [p1]);
    const r2 = computeCountryFireResults(s, ys, defaultAssumptions, [p2]);
    const std1 = r1.find((x) => x.lifestyle === "standard")!;
    const std2 = r2.find((x) => x.lifestyle === "standard")!;
    expect(std1.totalAnnualNeed).toBe(std2.totalAnnualNeed);
    expect(std1.selectedCapitalNeed).toBe(std2.selectedCapitalNeed);
    expect(std1.expectedCapitalAtReferenceAge).toBe(std2.expectedCapitalAtReferenceAge);
    expect(std1.uncertaintyScore).toBeLessThan(std2.uncertaintyScore);
  });
});

describe("Country profiles — persistence helpers", () => {
  it("normalizeCountryProfile fills missing fields", () => {
    const out = normalizeCountryProfile({ name: "X" });
    expect(out.name).toBe("X");
    expect(out.enabled).toBe(true);
    expect(out.monthlyCostStandard).toBeGreaterThanOrEqual(0);
  });

  it("snapshots freeze countryProfiles", () => {
    const s = makeBaseScenario();
    const profiles = DEFAULT_COUNTRY_PROFILES.slice(0, 2);
    const snap = buildSnapshot(s, [s], defaultAssumptions, { countryProfiles: profiles });
    expect(snap.countryProfiles).toBeDefined();
    expect(snap.countryProfiles!.length).toBe(2);
    // mutating original does not affect snapshot
    profiles[0].name = "MUTATED";
    expect(snap.countryProfiles![0].name).not.toBe("MUTATED");
  });

  it("snapshot can be re-analysed using its frozen profiles", () => {
    const s = makeBaseScenario();
    const snap = buildSnapshot(s, [s], defaultAssumptions, { countryProfiles: DEFAULT_COUNTRY_PROFILES });
    const fakeScenario = {
      id: snap.scenarioId,
      name: snap.scenarioName,
      createdAt: snap.createdAt,
      inputs: snap.resolvedInputs,
    } as Parameters<typeof computeCountryFireResults>[0];
    const r = computeCountryFireResults(fakeScenario, snap.years, snap.assumptions, snap.countryProfiles!);
    expect(r.length).toBeGreaterThan(0);
  });
});

describe("Country profiles — JSON export/import roundtrip via store", () => {
  it("exportJson includes countryProfiles and importJson restores them", async () => {
    const { useFinanceStore } = await import("@/store/financeStore");
    const store = useFinanceStore.getState();
    store.resetCountryProfilesToDefaults();
    const beforeIds = useFinanceStore.getState().countryProfiles.map((c) => c.id).sort();
    const json = store.exportJson();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed.countryProfiles)).toBe(true);
    expect(parsed.countryProfiles.length).toBeGreaterThan(0);

    // Mutate then re-import
    store.removeCountryProfile(beforeIds[0]);
    expect(useFinanceStore.getState().countryProfiles.length).toBeLessThan(beforeIds.length);
    store.importJson(json);
    const afterIds = useFinanceStore.getState().countryProfiles.map((c) => c.id).sort();
    expect(afterIds).toEqual(beforeIds);
  });
});
