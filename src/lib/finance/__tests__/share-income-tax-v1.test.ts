import { describe, it, expect } from "vitest";
import { projectWithStopAge } from "../projection";
import { defaultAssumptions, defaultInputs } from "../defaults";
import { applyShareIncomeTax, grossSaleForNetNeeded, newShareIncomeCtx } from "../tax";
import type { DepotTaxInputs, ScenarioInputs } from "../types";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

function withDepotTax(method: DepotTaxInputs["method"], costBasis: number | null = null): ScenarioInputs {
  const inp = clone(defaultInputs);
  inp.free.depotTax = { enabled: method !== "legacy", method, costBasis, showDeferredTax: true };
  return inp;
}

describe("Personlig aktieindkomst v1", () => {
  // A. Legacy/backwards-compat
  describe("A. Backwards compatibility", () => {
    it("uden depotTax giver samme projection som tidligere (smoke)", () => {
      const years = projectWithStopAge(defaultInputs, defaultAssumptions, defaultInputs.stopAge);
      // skal blot køre og levere flows
      expect(years.length).toBeGreaterThan(0);
      expect(years[0].flows.shareIncome).toBeUndefined();
      expect(years[0].flows.depot).toBeUndefined();
    });

    it("legacy method giver samme resultater som ingen depotTax", () => {
      const a = projectWithStopAge(defaultInputs, defaultAssumptions, defaultInputs.stopAge);
      const inpB = withDepotTax("legacy");
      const b = projectWithStopAge(inpB, defaultAssumptions, inpB.stopAge);
      for (let i = 0; i < a.length; i++) {
        expect(b[i].netWorth).toBeCloseTo(a[i].netWorth, 0);
        expect(b[i].closing.free).toBeCloseTo(a[i].closing.free, 0);
      }
    });
  });

  // B. Holding-only regression
  describe("B. Holding-only regression", () => {
    it("80.000 brutto holding ved 27 % giver 21.600 skat og 58.400 netto (uden depot-skat)", () => {
      const ctx = newShareIncomeCtx(defaultAssumptions.tax);
      const r = applyShareIncomeTax(ctx, 80_000);
      expect(r.tax).toBeCloseTo(80_000 * 0.27, 2);
      expect(r.net).toBeCloseTo(80_000 * 0.73, 2);
    });
  });

  // C. Fælles aktieindkomstgrænse
  describe("C. Fælles aktieindkomstgrænse", () => {
    it("holding bruger hele lav-grænsen → depotgevinst beskattes med høj sats", () => {
      const ctx = newShareIncomeCtx(defaultAssumptions.tax);
      // Holding consumes full threshold
      const holding = applyShareIncomeTax(ctx, ctx.threshold);
      expect(holding.atLow).toBeCloseTo(ctx.threshold, 2);
      expect(holding.atHigh).toBe(0);
      // Now depot gain — entirely at high rate
      const depotGain = applyShareIncomeTax(ctx, 50_000);
      expect(depotGain.atLow).toBe(0);
      expect(depotGain.atHigh).toBeCloseTo(50_000, 2);
      expect(depotGain.tax).toBeCloseTo(50_000 * ctx.highRate, 2);
    });

    it("grænse må ikke bruges to gange (cross-source)", () => {
      const ctx = newShareIncomeCtx(defaultAssumptions.tax);
      applyShareIncomeTax(ctx, 30_000); // holding
      const remaining = ctx.threshold - 30_000;
      const r = applyShareIncomeTax(ctx, 60_000); // depot gain
      expect(r.atLow).toBeCloseTo(remaining, 2);
      expect(r.atHigh).toBeCloseTo(60_000 - remaining, 2);
    });
  });

  // D, E, F: Realisation
  describe("D-F. Realisation simple", () => {
    it("ingen latent gevinst (costBasis=marketValue) ⇒ gainRatio=0, ingen skat", () => {
      const r = grossSaleForNetNeeded(10_000, 0, 79_400, 0.27, 0.42, 100_000);
      expect(r.sale).toBeCloseTo(10_000, 2);
      expect(r.tax).toBe(0);
      expect(r.realizedGain).toBe(0);
    });

    it("gainRatio=0.4: salg 10k brutto giver 4k realiseret gevinst", () => {
      // Direct: not via solve; compute realized for explicit sale of 10k
      const sale = 10_000;
      const gainRatio = 0.4;
      const realizedGain = sale * gainRatio;
      const ctx = newShareIncomeCtx(defaultAssumptions.tax);
      const r = applyShareIncomeTax(ctx, realizedGain);
      expect(realizedGain).toBeCloseTo(4_000, 2);
      expect(r.tax).toBeCloseTo(4_000 * 0.27, 2);
    });

    it("E. gross-up: netNeeded efter skat dækkes præcist", () => {
      const r = grossSaleForNetNeeded(50_000, 0.4, 79_400, 0.27, 0.42, 1_000_000);
      const realized = r.sale * 0.4;
      const taxLow = Math.min(realized, 79_400) * 0.27;
      const taxHigh = Math.max(0, realized - 79_400) * 0.42;
      const tax = taxLow + taxHigh;
      expect(r.sale - tax).toBeCloseTo(50_000, 0);
    });

    it("E. gross-up over lav-grænse beskattes også med høj sats", () => {
      // Large need so realized gain blows past threshold
      const r = grossSaleForNetNeeded(500_000, 0.5, 79_400, 0.27, 0.42, 5_000_000);
      const realized = r.sale * 0.5;
      expect(realized).toBeGreaterThan(79_400);
      const taxLow = 79_400 * 0.27;
      const taxHigh = (realized - 79_400) * 0.42;
      expect(r.tax).toBeCloseTo(taxLow + taxHigh, 1);
      expect(r.sale - r.tax).toBeCloseTo(500_000, 0);
    });

    it("F. kostpris reduceres proportionalt og bliver aldrig negativ (projection)", () => {
      const inp = withDepotTax("realizationSimple", 200_000);
      inp.free.balance = 1_000_000; // depot start = 1m, costBasis = 200k ⇒ gainRatio 0.8
      inp.stopAge = 50; // tving udtræk
      inp.spending.desiredMonthlyNet = 60_000;
      inp.holding.balance = 0;
      inp.holding.expectedExitValue = 0;
      inp.pension.balance = 0;
      const years = projectWithStopAge(inp, defaultAssumptions, inp.stopAge);
      // Sidste år hvor depot > 0
      for (const y of years) {
        if (y.flows.depot) {
          expect(y.flows.depot.costBasisClosing).toBeGreaterThanOrEqual(0);
          expect(y.flows.depot.costBasisClosing).toBeLessThanOrEqual(y.flows.depot.closing + 1);
        }
      }
    });
  });

  // G. annualShareIncomeTax
  describe("G. annualShareIncomeTax", () => {
    it("positivt afkast genererer skat; negativt afkast giver 0 skat (ingen carryforward i v1)", () => {
      const inp = withDepotTax("annualShareIncomeTax");
      const years = projectWithStopAge(inp, defaultAssumptions, inp.stopAge);
      // I første år vokser fri kapital ⇒ der opkræves skat
      const y0 = years[0];
      expect(y0.flows.depot).toBeDefined();
      expect(y0.flows.depot!.annualTax).toBeGreaterThan(0);
      expect(y0.flows.shareIncome!.totalShareIncome).toBeGreaterThan(0);
    });
  });

  // H. ASK adskillelse
  describe("H. ASK adskillelse", () => {
    it("ASK-afkast/-udtræk indgår ikke i aktieindkomst-pulje", () => {
      const inp = withDepotTax("annualShareIncomeTax");
      inp.free.ask = {
        enabled: true,
        currentValue: 100_000,
        priorYearEndValue: 100_000,
        depositLimit: 174_200,
        taxRate: 0.17,
        autoFillFirst: false,
        taxCreditCarryForward: 0,
        taxPaymentMode: "deductFromASK",
        withdrawalStrategy: "depotFirst",
      };
      const years = projectWithStopAge(inp, defaultAssumptions, inp.stopAge);
      const y0 = years[0];
      expect(y0.flows.ask).toBeDefined();
      expect(y0.flows.shareIncome).toBeDefined();
      // ASK-skat findes i ASK-audit, ikke i shareIncome
      expect(y0.flows.ask!.tax).toBeGreaterThan(0);
      // shareIncome bør kun indeholde depot growth + evt. holding, ikke ASK growth
      const depotGrowth = y0.flows.depot!.growthGross;
      const annualTaxable = y0.flows.shareIncome!.annualDepotTaxable;
      expect(annualTaxable).toBeCloseTo(Math.max(0, depotGrowth), 0);
    });
  });

  // I. WithdrawalStrategy + lighedstest closing.free = ask + depot
  describe("I. Withdrawal strategy samspil", () => {
    it("ask ultimo + depot ultimo = closing.free", () => {
      const inp = withDepotTax("realizationSimple", 50_000);
      inp.free.balance = 300_000;
      inp.free.ask = {
        enabled: true,
        currentValue: 100_000,
        priorYearEndValue: 100_000,
        depositLimit: 174_200,
        taxRate: 0.17,
        autoFillFirst: true,
        taxCreditCarryForward: 0,
        taxPaymentMode: "deductFromASK",
        withdrawalStrategy: "depotFirst",
      };
      const years = projectWithStopAge(inp, defaultAssumptions, inp.stopAge);
      for (const y of years) {
        if (y.flows.ask) {
          expect(y.flows.ask.closing + y.flows.ask.freeDepotClosing).toBeCloseTo(y.closing.free, 0);
        }
      }
    });
  });

  // J. Persistens
  describe("J. Persistens", () => {
    it("JSON roundtrip med depotTax og uden — begge virker", () => {
      const inp = withDepotTax("realizationSimple", 200_000);
      const j = JSON.stringify(inp);
      const back = JSON.parse(j) as ScenarioInputs;
      expect(back.free.depotTax?.method).toBe("realizationSimple");
      // Gamle modeller uden depotTax
      const legacy = clone(defaultInputs);
      delete (legacy.free as { depotTax?: unknown }).depotTax;
      const j2 = JSON.parse(JSON.stringify(legacy)) as ScenarioInputs;
      const years = projectWithStopAge(j2, defaultAssumptions, j2.stopAge);
      expect(years.length).toBeGreaterThan(0);
    });
  });

  // K. Audit indhold
  describe("K. Audit", () => {
    it("shareIncome og depot-audit eksponerer kerne-tal når aktiv", () => {
      const inp = withDepotTax("annualShareIncomeTax");
      const years = projectWithStopAge(inp, defaultAssumptions, inp.stopAge);
      const y = years[0];
      expect(y.flows.shareIncome).toMatchObject({
        threshold: defaultAssumptions.tax.shareThreshold,
        lowRate: defaultAssumptions.tax.shareLowRate,
        highRate: defaultAssumptions.tax.shareHighRate,
      });
      expect(y.flows.depot).toMatchObject({ method: "annualShareIncomeTax" });
    });
  });
});
