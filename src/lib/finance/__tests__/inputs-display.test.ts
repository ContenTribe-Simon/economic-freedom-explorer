/**
 * Inputs/Variabler display-data regressionstests
 *
 * Tester at det resolvede scenarie (basecase + modifiers) bruges som
 * visningssandhed for et linket stress-test, så ændringer i basecase
 * automatisk slår igennem på Variabler-siden — ikke kun i beregningen.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useFinanceStore } from "@/store/financeStore";
import { defaultAssumptions, makeBaseScenario } from "@/lib/finance/defaults";
import { resolveScenario } from "@/lib/finance/stress";
import type { Scenario } from "@/lib/finance/types";

const PERSIST_KEY = "finance-tool.v1";

beforeEach(() => {
  if (typeof localStorage !== "undefined") localStorage.removeItem(PERSIST_KEY);
  const fresh: Scenario = { ...makeBaseScenario(), type: "base", updatedAt: Date.now() };
  useFinanceStore.setState({
    scenarios: [fresh],
    activeScenarioId: fresh.id,
    assumptions: defaultAssumptions,
  });
});

function setupLinkedNoBarma() {
  const baseId = useFinanceStore.getState().activeScenarioId;
  useFinanceStore.getState().applyStressModifier("noBarma");
  const linkedId = useFinanceStore.getState().activeScenarioId;
  return { baseId, linkedId };
}

function display(linkedId: string) {
  const all = useFinanceStore.getState().scenarios;
  const linked = all.find((s) => s.id === linkedId)!;
  return resolveScenario(linked, all).inputs;
}

describe("Inputs display-data for linked stress-tests", () => {
  it("currentAge på linked noBarma følger basecase", () => {
    const { baseId, linkedId } = setupLinkedNoBarma();
    useFinanceStore.getState().updateScenario(baseId, (s) => ({
      ...s,
      inputs: { ...s.inputs, person: { ...s.inputs.person, currentAge: 35 } },
    }));
    expect(display(linkedId).person.currentAge).toBe(35);
  });

  it("expectedLifeAge på linked noBarma følger basecase", () => {
    const { baseId, linkedId } = setupLinkedNoBarma();
    useFinanceStore.getState().updateScenario(baseId, (s) => ({
      ...s,
      inputs: { ...s.inputs, person: { ...s.inputs.person, lifeExpectancy: 90 } },
    }));
    expect(display(linkedId).person.lifeExpectancy).toBe(90);
  });

  it("spending på linked noBarma følger basecase", () => {
    const { baseId, linkedId } = setupLinkedNoBarma();
    useFinanceStore.getState().updateScenario(baseId, (s) => ({
      ...s,
      inputs: { ...s.inputs, spending: { ...s.inputs.spending, desiredMonthlyNet: 14000 } },
    }));
    expect(display(linkedId).spending.desiredMonthlyNet).toBe(14000);
  });

  it("noBarma neutraliserer holding-felter uanset basecase", () => {
    const { linkedId } = setupLinkedNoBarma();
    const inp = display(linkedId);
    expect(inp.holding.balance).toBe(0);
    expect(inp.holding.expectedExitValue).toBe(0);
    expect(inp.holding.annualDistribution).toBe(0);
  });

  it("efter convertToCustom følger scenariet ikke længere basecase", () => {
    const { baseId, linkedId } = setupLinkedNoBarma();
    useFinanceStore.getState().convertToCustom(linkedId);
    useFinanceStore.getState().updateScenario(baseId, (s) => ({
      ...s,
      inputs: { ...s.inputs, person: { ...s.inputs.person, currentAge: 40 } },
    }));
    const all = useFinanceStore.getState().scenarios;
    const sc = all.find((s) => s.id === linkedId)!;
    expect(sc.type).toBe("custom");
    expect(sc.inputs.person.currentAge).not.toBe(40);
  });
});
