import { test } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";

test("dbg", () => {
  const s = makeBaseScenario();
  s.inputs.capitalWithdrawal = { strategy: "holdingFirst", plannedWithdrawalPolicy: "fixedAnnual", plannedWithdrawalAmount: 50000, startAge: null, startAtStopAge: true } as any;
  const ys = project(s, defaultAssumptions);
  const stop = s.inputs.stopAge;
  const before = ys.find(y => y.age === stop - 1)!;
  console.log("stopAge:", stop, "age:", before.age);
  console.log("totalIncomeNet:", before.totalIncomeNet, "spending:", before.flows.spending);
  console.log("bridge:", before.flows.cashflowBridge);
  console.log("cw:", before.flows.capitalWithdrawal);
  console.log("planned:", before.flows.plannedFreeContribution, "invested:", before.flows.investedAmount);
  console.log("withdrawals:", before.flows.withdrawals);
});
