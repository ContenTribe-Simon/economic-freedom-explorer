import { test } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";

test("dbg2", () => {
  const s = makeBaseScenario();
  s.inputs.capitalWithdrawal = { strategy: "depotFirst", plannedWithdrawalPolicy: "fixedAnnual", plannedWithdrawalAmount: 60000, startAge: 55, startAtStopAge: false } as any;
  s.inputs.free.balance = 500_000;
  const ys = project(s, defaultAssumptions);
  for (const y of ys.slice(0, 20)) {
    console.log(`age=${y.age} cf=${Math.round(y.flows.cashflowBridge?.cashflowBeforeSavings ?? 0)} free=${Math.round(y.closing.free)} cw.depot=${Math.round(y.flows.capitalWithdrawal?.grossBySource.depot ?? 0)} cw.hold=${Math.round(y.flows.capitalWithdrawal?.grossBySource.holding ?? 0)}`);
  }
});
