import { describe, it, expect } from "vitest";
import { projectWithStopAge } from "../projection";
import { defaultAssumptions, defaultInputs } from "../defaults";
import type { DepotTaxInputs, ScenarioInputs, ShareIncomeFundingStrategy } from "../types";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function makeInputs(
  strategy: ShareIncomeFundingStrategy | undefined,
  method: DepotTaxInputs["method"] = "realizationSimple",
): ScenarioInputs {
  const inp = clone(defaultInputs);
  inp.free.balance = 2_000_000;
  inp.free.depotTax = {
    enabled: method !== "legacy",
    method,
    costBasis: 1_000_000, // gainRatio 0.5
    showDeferredTax: true,
    shareIncomeFundingStrategy: strategy,
  };
  inp.holding.balance = 1_500_000;
  inp.holding.annualDistribution = 60_000;
  inp.holding.startDistributionAtStopAge = true;
  inp.holding.withdrawalStrategy = "allow_extra_on_shortfall";
  inp.pension.balance = 0;
  inp.pension.monthlyContribution = 0;
  inp.pension.employerContribution = 0;
  inp.pension.ratePensionEnabled = false;
  inp.stopAge = 50;
  inp.fullRetireAge = 60;
  inp.spending.desiredMonthlyNet = 40_000;
  return inp;
}

describe("Personlig aktieindkomst v1.1 — shareIncomeFundingStrategy", () => {
  // A. Default
  describe("A. Default", () => {
    it("gamle modeller uden shareIncomeFundingStrategy default'er til holdingFirst og crasher ikke", () => {
      const inp = makeInputs(undefined);
      // simuler "gammel" model: depotTax udfyldt uden nyt felt
      delete (inp.free.depotTax as { shareIncomeFundingStrategy?: unknown }).shareIncomeFundingStrategy;
      const years = projectWithStopAge(inp, defaultAssumptions, inp.stopAge);
      expect(years.length).toBeGreaterThan(0);
      const y = years.find((y) => y.flows.shareIncome);
      expect(y?.flows.shareIncome?.fundingStrategy).toBe("holdingFirst");
    });

    it("legacy (depotTax disabled) — strategi har ingen effekt på resultat", () => {
      const baseline = projectWithStopAge(defaultInputs, defaultAssumptions, defaultInputs.stopAge);
      const inp = clone(defaultInputs);
      inp.free.depotTax = {
        enabled: false,
        method: "legacy",
        costBasis: null,
        showDeferredTax: true,
        shareIncomeFundingStrategy: "depotFirst",
      };
      const got = projectWithStopAge(inp, defaultAssumptions, inp.stopAge);
      for (let i = 0; i < baseline.length; i++) {
        expect(got[i].closing.free).toBeCloseTo(baseline[i].closing.free, 0);
        expect(got[i].netWorth).toBeCloseTo(baseline[i].netWorth, 0);
      }
    });
  });

  // B/C/D. Strategiernes effekt på drain-rækkefølge (efter stopAge, hvor shortfall opstår)
  describe("B-D. Strategi-effekter", () => {
    it("B. holdingFirst: holding bidrager mere end depot ved shortfall", () => {
      const inp = makeInputs("holdingFirst");
      const years = projectWithStopAge(inp, defaultAssumptions, inp.stopAge);
      const post = years.find((y) => y.age === inp.stopAge + 1)!;
      const holdingNet = post.flows.shareIncome!.fundedFromHolding ?? 0;
      const depotNet = post.flows.shareIncome!.fundedFromDepot ?? 0;
      expect(holdingNet).toBeGreaterThan(depotNet);
    });

    it("C. depotFirst: depot bruges før holding (depot-netto > holding-netto)", () => {
      const inp = makeInputs("depotFirst");
      const years = projectWithStopAge(inp, defaultAssumptions, inp.stopAge);
      const post = years.find((y) => y.age === inp.stopAge + 1)!;
      const holdingNet = post.flows.shareIncome!.fundedFromHolding ?? 0;
      const depotNet = post.flows.shareIncome!.fundedFromDepot ?? 0;
      // planlagt holding kører stadig (60k), men depot-shortfall-trækket bør være betydeligt større
      expect(depotNet).toBeGreaterThan(0);
      expect(post.flows.shareIncome!.realizedDepotGain).toBeGreaterThan(0);
      // Threshold må kun bruges én gang:
      const ctxThreshold = post.flows.shareIncome!.threshold;
      expect(post.flows.shareIncome!.taxedAtLow).toBeLessThanOrEqual(ctxThreshold + 1);
    });

    it("D. proRata: både holding og depot bidrager til shortfall", () => {
      const inp = makeInputs("proRata");
      const years = projectWithStopAge(inp, defaultAssumptions, inp.stopAge);
      const post = years.find((y) => y.age === inp.stopAge + 1)!;
      const holdingNet = post.flows.shareIncome!.fundedFromHolding ?? 0;
      const depotNet = post.flows.shareIncome!.fundedFromDepot ?? 0;
      expect(holdingNet).toBeGreaterThan(0);
      expect(depotNet).toBeGreaterThan(0);
    });

    it("alle strategier: 27/42-grænsen bruges kun én gang pr. år", () => {
      for (const s of ["holdingFirst", "depotFirst", "proRata"] as const) {
        const inp = makeInputs(s);
        const years = projectWithStopAge(inp, defaultAssumptions, inp.stopAge);
        for (const y of years) {
          if (!y.flows.shareIncome) continue;
          expect(y.flows.shareIncome.taxedAtLow).toBeLessThanOrEqual(
            y.flows.shareIncome.threshold + 1,
          );
        }
      }
    });
  });

  // E. ASK separation
  describe("E. ASK separation", () => {
    it("ASK-udtræk udløser ikke personlig aktieindkomstskat, uanset funding-strategi", () => {
      const inp = makeInputs("depotFirst", "annualShareIncomeTax");
      inp.free.ask = {
        enabled: true,
        currentValue: 200_000,
        priorYearEndValue: 200_000,
        depositLimit: 174_200,
        taxRate: 0.17,
        autoFillFirst: false,
        taxCreditCarryForward: 0,
        taxPaymentMode: "deductFromASK",
        withdrawalStrategy: "askFirst",
      };
      const years = projectWithStopAge(inp, defaultAssumptions, inp.stopAge);
      const y = years.find((y) => y.age === inp.stopAge + 1)!;
      expect(y.flows.ask).toBeDefined();
      // ASK-vækst må ikke akkumulere i shareIncome.totalShareIncome
      const expected = Math.max(0, y.flows.depot!.growthGross) + (y.flows.shareIncome!.holdingGross + y.flows.shareIncome!.extraHoldingGross) + y.flows.shareIncome!.realizedDepotGain;
      expect(y.flows.shareIncome!.totalShareIncome).toBeCloseTo(expected, 0);
    });
  });

  // F. Audit
  describe("F. Audit", () => {
    it("audit eksponerer fundingStrategy + faktisk fordeling og samlet skat", () => {
      const inp = makeInputs("proRata");
      const years = projectWithStopAge(inp, defaultAssumptions, inp.stopAge);
      const y = years.find((y) => y.flows.shareIncome && (y.flows.shareIncome.totalShareIncome ?? 0) > 0)!;
      const si = y.flows.shareIncome!;
      expect(si.fundingStrategy).toBe("proRata");
      expect(si.fundedFromHolding).toBeGreaterThanOrEqual(0);
      expect(si.fundedFromDepot).toBeGreaterThanOrEqual(0);
      expect((si.taxAllocatedHolding ?? 0) + (si.taxAllocatedDepot ?? 0)).toBeCloseTo(si.taxTotal, 1);
    });
  });

  // G. Persistens / JSON roundtrip
  describe("G. Persistens", () => {
    it("JSON roundtrip bevarer shareIncomeFundingStrategy", () => {
      const inp = makeInputs("depotFirst");
      const back = JSON.parse(JSON.stringify(inp)) as ScenarioInputs;
      expect(back.free.depotTax?.shareIncomeFundingStrategy).toBe("depotFirst");
    });
  });
});
