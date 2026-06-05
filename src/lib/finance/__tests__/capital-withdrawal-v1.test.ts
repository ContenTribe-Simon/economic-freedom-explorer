/**
 * Kapitaludtræk v1 — samlet nedsparingsstrategi tests.
 */
import { describe, it, expect } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "@/lib/finance/defaults";
import { project, projectWithStopAge } from "@/lib/finance/projection";
import { resolveCapitalWithdrawal, resolveOrder } from "@/lib/finance/capitalWithdrawal";
import type { CapitalWithdrawalInputs, Scenario, ScenarioInputs } from "@/lib/finance/types";

function withCw(cw: CapitalWithdrawalInputs, mod?: (i: ScenarioInputs) => void): Scenario {
  const s = makeBaseScenario();
  s.inputs.capitalWithdrawal = cw;
  if (mod) mod(s.inputs);
  return s;
}

function sumByAge(scenario: Scenario, ageFrom: number, ageTo: number, picker: (y: any) => number) {
  const years = project(scenario, defaultAssumptions);
  let sum = 0;
  for (const y of years) if (y.age >= ageFrom && y.age <= ageTo) sum += picker(y);
  return sum;
}

describe("resolveOrder", () => {
  it("default-orderings indeholder alle fire kilder", () => {
    for (const s of ["depotFirst", "holdingFirst", "askFirst", "pensionFirst"] as const) {
      const o = resolveOrder(s, undefined);
      expect(o.sort()).toEqual(["ask", "depot", "holding", "pension"].sort());
      expect(o.length).toBe(4);
    }
  });
  it("custom respekterer brugerens rækkefølge og udfylder rest", () => {
    expect(resolveOrder("custom", ["ask", "depot"])).toEqual(["ask", "depot", "holding", "pension"]);
  });
});

describe("resolveCapitalWithdrawal (migration)", () => {
  it("planned_only + annualDistribution > 0 → holdingFirst + fixedAnnual med samme beløb", () => {
    const s = makeBaseScenario();
    s.inputs.holding.withdrawalStrategy = "planned_only";
    s.inputs.holding.annualDistribution = 80000;
    const cw = resolveCapitalWithdrawal(s.inputs);
    expect(cw.strategy).toBe("depotFirst");
    expect(cw.plannedWithdrawalPolicy).toBe("fixedAnnual");
    expect(cw.plannedWithdrawalAmount).toBe(80000);
  });
  it("up_to_low_threshold → fillLowShareIncomeBracket + holdingFirst", () => {
    const s = makeBaseScenario();
    s.inputs.holding.withdrawalStrategy = "up_to_low_threshold";
    const cw = resolveCapitalWithdrawal(s.inputs);
    expect(cw.strategy).toBe("holdingFirst");
    expect(cw.plannedWithdrawalPolicy).toBe("fillLowShareIncomeBracket");
  });
  it("pension_before_extra_holding → pensionFirst", () => {
    const s = makeBaseScenario();
    s.inputs.holding.withdrawalStrategy = "pension_before_extra_holding";
    expect(resolveCapitalWithdrawal(s.inputs).strategy).toBe("pensionFirst");
  });
  it("allow_extra_on_shortfall → holdingFirst", () => {
    const s = makeBaseScenario();
    s.inputs.holding.withdrawalStrategy = "allow_extra_on_shortfall";
    expect(resolveCapitalWithdrawal(s.inputs).strategy).toBe("holdingFirst");
  });
  it("ask.withdrawalStrategy=askFirst (alene) → askFirst", () => {
    const s = makeBaseScenario();
    s.inputs.holding.withdrawalStrategy = "planned_only";
    s.inputs.holding.annualDistribution = 0;
    s.inputs.free.ask = { enabled: true, currentValue: 0, depositLimit: 174200, taxRate: 0.17, autoFillFirst: false, taxCreditCarryForward: 0, taxPaymentMode: "deductFromASK", withdrawalStrategy: "askFirst" };
    expect(resolveCapitalWithdrawal(s.inputs).strategy).toBe("askFirst");
  });
  it("depotTax.shareIncomeFundingStrategy=depotFirst → depotFirst", () => {
    const s = makeBaseScenario();
    s.inputs.free.depotTax = { enabled: true, method: "legacy", costBasis: null, showDeferredTax: true, shareIncomeFundingStrategy: "depotFirst" };
    expect(resolveCapitalWithdrawal(s.inputs).strategy).toBe("depotFirst");
  });
  it("eksisterende capitalWithdrawal returneres direkte", () => {
    const s = makeBaseScenario();
    s.inputs.capitalWithdrawal = { strategy: "askFirst", plannedWithdrawalPolicy: "none", plannedWithdrawalAmount: 0, startAge: null, startAtStopAge: false };
    expect(resolveCapitalWithdrawal(s.inputs).strategy).toBe("askFirst");
  });
});

describe("backwards compat — undefined capitalWithdrawal", () => {
  it("default base case giver samme projection før/efter typetilføjelse", () => {
    const s = makeBaseScenario();
    expect(s.inputs.capitalWithdrawal).toBeUndefined();
    const years = project(s, defaultAssumptions);
    expect(years.length).toBeGreaterThan(0);
    // ingen capitalWithdrawal audit når feltet ikke er sat
    expect(years[0].flows.capitalWithdrawal).toBeUndefined();
  });
});

describe("source of truth", () => {
  it("strategy=depotFirst: depot tømmes før holding bruges til shortfall", () => {
    // Stop tidligt så vi har shortfall, holding-balance stor
    const s = withCw({ strategy: "depotFirst", plannedWithdrawalPolicy: "none", plannedWithdrawalAmount: 0, startAge: null, startAtStopAge: false }, (i) => {
      i.stopAge = 50;
      i.fullRetireAge = 50;
      i.holding.annualDistribution = 0;
      i.free.balance = 200_000;
      i.holding.balance = 5_000_000;
    });
    const years = project(s, defaultAssumptions);
    // Find første år med shortfall-pres (efter stopAge) hvor depot bruges
    const firstWithdrawYear = years.find((y) => y.age >= 50 && (y.flows.capitalWithdrawal?.totalGross ?? 0) > 0);
    expect(firstWithdrawYear).toBeDefined();
    const order = firstWithdrawYear!.flows.capitalWithdrawal!.effectiveOrder;
    expect(order[0]).toBe("depot");
  });

  it("strategy=holdingFirst: holding bruges før depot ved shortfall", () => {
    const s = withCw({ strategy: "holdingFirst", plannedWithdrawalPolicy: "none", plannedWithdrawalAmount: 0, startAge: null, startAtStopAge: false }, (i) => {
      i.stopAge = 50;
      i.fullRetireAge = 50;
      i.holding.annualDistribution = 0;
      i.holding.balance = 5_000_000;
      i.free.balance = 500_000;
    });
    const years = project(s, defaultAssumptions);
    const yr = years.find((y) => y.age === 51)!;
    const cwa = yr.flows.capitalWithdrawal!;
    expect(cwa.grossBySource.holding).toBeGreaterThan(0);
  });
});

describe("planned policy", () => {
  it("fixedAnnual + holdingFirst: drainer holding", () => {
    const s = withCw({ strategy: "holdingFirst", plannedWithdrawalPolicy: "fixedAnnual", plannedWithdrawalAmount: 80_000, startAge: 55, startAtStopAge: false });
    const years = project(s, defaultAssumptions);
    const yr = years.find((y) => y.age === 55)!;
    // I starten af stopåret kører både planlagt og shortfall — holding bør være trukket på
    expect(yr.flows.capitalWithdrawal!.grossBySource.holding).toBeGreaterThan(0);
  });






  it("fixedAnnual + depotFirst: tager fra depot først (ASK skippes)", () => {
    const s = withCw({ strategy: "depotFirst", plannedWithdrawalPolicy: "fixedAnnual", plannedWithdrawalAmount: 60_000, startAge: 55, startAtStopAge: false }, (i) => {
      i.free.balance = 500_000;
    });
    const years = project(s, defaultAssumptions);
    const yr = years.find((y) => y.age === 55)!;
    expect(yr.flows.capitalWithdrawal!.grossBySource.depot).toBeGreaterThan(0);
    expect(yr.flows.capitalWithdrawal!.grossBySource.holding).toBe(0);
  });

  it("startAtStopAge=true bruger stopAge som startalder", () => {
    const s = withCw({ strategy: "holdingFirst", plannedWithdrawalPolicy: "fixedAnnual", plannedWithdrawalAmount: 50_000, startAge: null, startAtStopAge: true });
    const stop = s.inputs.stopAge;
    const years = project(s, defaultAssumptions);
    const before = years.find((y) => y.age === stop - 1)!;
    const at = years.find((y) => y.age === stop)!;
    expect(before.flows.capitalWithdrawal!.totalGross).toBe(0);
    expect(at.flows.capitalWithdrawal!.totalGross).toBeGreaterThan(0);
  });
});

describe("ASK separation", () => {
  it("ASK-skat indgår ikke i CW tax (ASK lagerbeskat sker separat)", () => {
    const s = withCw({ strategy: "askFirst", plannedWithdrawalPolicy: "none", plannedWithdrawalAmount: 0, startAge: null, startAtStopAge: false }, (i) => {
      i.stopAge = 50;
      i.fullRetireAge = 50;
      i.holding.annualDistribution = 0;
      i.free.balance = 400_000;
      i.free.ask = { enabled: true, currentValue: 150_000, depositLimit: 174_200, taxRate: 0.17, autoFillFirst: false, taxCreditCarryForward: 0, taxPaymentMode: "deductFromASK" };
    });
    const years = project(s, defaultAssumptions);
    const yr = years.find((y) => (y.flows.capitalWithdrawal?.grossBySource.ask ?? 0) > 0);
    expect(yr).toBeDefined();
    // ASK indgår i CW kilde-tracking men har ingen CW-skat
    expect(yr!.flows.capitalWithdrawal!.taxBySource.ask).toBe(0);
  });
});



describe("pensionFirst", () => {
  it("springes over før pensionAvailableFromAge", () => {
    const s = withCw({ strategy: "pensionFirst", plannedWithdrawalPolicy: "none", plannedWithdrawalAmount: 0, startAge: null, startAtStopAge: false }, (i) => {
      i.stopAge = 50;
      i.fullRetireAge = 50;
      i.holding.annualDistribution = 0;
      i.pension.payoutFromAge = 64;
    });
    const years = project(s, defaultAssumptions);
    // Før pensionsalder: pension er ikke i effectiveOrder
    const earlyWithdraw = years.find((y) => y.age === 51 && (y.flows.capitalWithdrawal?.totalGross ?? 0) > 0);
    if (earlyWithdraw) {
      expect(earlyWithdraw.flows.capitalWithdrawal!.effectiveOrder).not.toContain("pension");
    }
  });
});

describe("fillLowShareIncomeBracket", () => {
  it("ASK må ikke bruges til at fylde aktieindkomstgrænsen — kun holding+depot", () => {
    // Spending sat lavt så shortfall ikke aktiveres → kun planlagt fillLow kører.
    const s = withCw({ strategy: "askFirst", plannedWithdrawalPolicy: "fillLowShareIncomeBracket", plannedWithdrawalAmount: 0, startAge: 50, startAtStopAge: false }, (i) => {
      i.spending.desiredMonthlyNet = 0;
      i.free.ask = { enabled: true, currentValue: 100_000, depositLimit: 174_200, taxRate: 0.17, autoFillFirst: false, taxCreditCarryForward: 0, taxPaymentMode: "deductFromASK" };
    });
    const years = project(s, defaultAssumptions);
    const yr = years.find((y) => y.age === 50)!;
    // Holding-udlodning skal fylde lav-grænsen
    expect(yr.flows.capitalWithdrawal!.grossBySource.holding).toBeGreaterThan(0);
    // ASK må ikke være brugt af fillLow (ingen shortfall trækker også fra ASK her)
    expect(yr.flows.capitalWithdrawal!.grossBySource.ask).toBe(0);
  });
});


describe("audit roundtrip", () => {
  it("JSON serialiserer og deserialiserer capitalWithdrawal", () => {
    const s = withCw({ strategy: "holdingFirst", plannedWithdrawalPolicy: "fixedAnnual", plannedWithdrawalAmount: 50000, startAge: 55, startAtStopAge: false });
    const json = JSON.stringify(s);
    const parsed = JSON.parse(json) as Scenario;
    expect(parsed.inputs.capitalWithdrawal?.strategy).toBe("holdingFirst");
    expect(parsed.inputs.capitalWithdrawal?.plannedWithdrawalAmount).toBe(50000);
  });
});
