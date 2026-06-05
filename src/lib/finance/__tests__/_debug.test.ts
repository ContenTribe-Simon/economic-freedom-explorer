/**
 * tmp debug
 */
import { describe, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "@/lib/finance/defaults";
import { project } from "@/lib/finance/projection";

describe("debug", () => {
  it("logs", () => {
    const s = makeBaseScenario();
    s.inputs.capitalWithdrawal = { strategy: "holdingFirst", plannedWithdrawalPolicy: "fixedAnnual", plannedWithdrawalAmount: 80_000, startAge: 55, startAtStopAge: false };
    console.log("cw set:", JSON.stringify(s.inputs.capitalWithdrawal));
    console.log("stopAge:", s.inputs.stopAge, "currentAge:", s.inputs.person.currentAge);
    const years = project(s, defaultAssumptions);
    const yr = years.find((y) => y.age === 55)!;
    console.log("yr age:", yr.age);
    console.log("holdingPlanned:", yr.flows.holdingPlanned);
    console.log("capitalWithdrawal:", JSON.stringify(yr.flows.capitalWithdrawal));
    console.log("opening holding:", yr.opening.holding, "closing holding:", yr.closing.holding);
  });
});
