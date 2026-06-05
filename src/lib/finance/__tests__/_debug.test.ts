import { describe, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "@/lib/finance/defaults";
import { project } from "@/lib/finance/projection";

describe("debug ask", () => {
  it("logs ask scenario", () => {
    const s = makeBaseScenario();
    s.inputs.capitalWithdrawal = { strategy: "askFirst", plannedWithdrawalPolicy: "none", plannedWithdrawalAmount: 0, startAge: null, startAtStopAge: false };
    s.inputs.stopAge = 50;
    s.inputs.fullRetireAge = 50;
    s.inputs.holding.annualDistribution = 0;
    s.inputs.free.balance = 400_000;
    s.inputs.free.ask = { enabled: true, currentValue: 150_000, depositLimit: 174_200, taxRate: 0.17, autoFillFirst: false, taxCreditCarryForward: 0, taxPaymentMode: "deductFromASK" };
    s.inputs.free.depotTax = { enabled: true, method: "realizationSimple", costBasis: 100_000, showDeferredTax: true };
    const years = project(s, defaultAssumptions);
    for (let age = 50; age <= 55; age++) {
      const y = years.find((y) => y.age === age);
      if (y) console.log(`age=${age} cw=`, JSON.stringify(y.flows.capitalWithdrawal?.grossBySource), "shortfall:", y.shortfallAmount.toFixed(0), "balAsk:", y.flows.ask?.closing?.toFixed(0));
    }
  });
});

