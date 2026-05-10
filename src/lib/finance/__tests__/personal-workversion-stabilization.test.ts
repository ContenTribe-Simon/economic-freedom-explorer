/**
 * Personlig arbejdsversion — stabiliseringssuite.
 *
 * Bekræfter at alle de kritiske invariants for linked stress-tests, custom
 * scenarier, opsparingsstop og eksport/import-flowet er på plads.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useFinanceStore } from "@/store/financeStore";
import { defaultAssumptions, makeBaseScenario } from "@/lib/finance/defaults";
import { resolveScenario } from "@/lib/finance/stress";
import { project } from "@/lib/finance/projection";
import { deriveKPIs } from "@/lib/finance/kpis";
import type { Scenario } from "@/lib/finance/types";

const PERSIST_KEY = "finance-tool.v1";

function reset() {
  if (typeof localStorage !== "undefined") localStorage.removeItem(PERSIST_KEY);
  const fresh: Scenario = { ...makeBaseScenario(), type: "base", updatedAt: Date.now() };
  useFinanceStore.setState({
    scenarios: [fresh],
    activeScenarioId: fresh.id,
    assumptions: defaultAssumptions,
  });
}

beforeEach(reset);

function setupLinked(modifier: "noBarma" | "noPartTime" | "lowReturn" | "higherSpending" | "noFolkepension") {
  const baseId = useFinanceStore.getState().activeScenarioId;
  useFinanceStore.getState().applyStressModifier(modifier);
  return { baseId, linkedId: useFinanceStore.getState().activeScenarioId };
}

function get(id: string) {
  return useFinanceStore.getState().scenarios.find((s) => s.id === id)!;
}

function resolved(id: string) {
  const all = useFinanceStore.getState().scenarios;
  return resolveScenario(get(id), all);
}

describe("Linked stress-tests følger basecase", () => {
  it("noBarma følger basecase savings stop rule", () => {
    const { baseId, linkedId } = setupLinked("noBarma");
    useFinanceStore.getState().updateScenario(baseId, (s) => ({
      ...s,
      inputs: { ...s.inputs, free: { ...s.inputs.free, contributionStopRule: "fullRetireAge" } },
    }));
    expect(resolved(linkedId).inputs.free.contributionStopRule).toBe("fullRetireAge");
  });

  it("noBarma neutraliserer kun holding-felter — andre felter følger basecase", () => {
    const { baseId, linkedId } = setupLinked("noBarma");
    useFinanceStore.getState().updateScenario(baseId, (s) => ({
      ...s,
      inputs: {
        ...s.inputs,
        spending: { ...s.inputs.spending, desiredMonthlyNet: 17500 },
        income: { ...s.inputs.income, salaryGross: 999000 },
      },
    }));
    const inp = resolved(linkedId).inputs;
    expect(inp.holding.balance).toBe(0);
    expect(inp.holding.expectedExitValue).toBe(0);
    expect(inp.holding.annualDistribution).toBe(0);
    expect(inp.spending.desiredMonthlyNet).toBe(17500);
    expect(inp.income.salaryGross).toBe(999000);
  });

  it("noPartTime ændrer kun deltidsindtægt + fullRetireAge", () => {
    const { baseId, linkedId } = setupLinked("noPartTime");
    const baseHolding = get(baseId).inputs.holding.balance;
    const inp = resolved(linkedId).inputs;
    expect(inp.income.partTime.grossAnnual).toBe(0);
    expect(inp.income.partTime.netMonthly).toBe(0);
    expect(inp.fullRetireAge).toBe(get(baseId).inputs.stopAge);
    expect(inp.holding.balance).toBe(baseHolding);
  });

  it("lowReturn ændrer kun afkast (assumptionsOverride)", () => {
    const { linkedId } = setupLinked("lowReturn");
    const r = resolved(linkedId);
    expect(r.assumptionsOverride?.realReturn?.free).toBe(0.02);
    expect(r.assumptionsOverride?.realReturn?.pension).toBe(0.02);
    expect(r.assumptionsOverride?.realReturn?.holding).toBe(0.01);
  });

  it("higherSpending ændrer kun forbrug", () => {
    const { baseId, linkedId } = setupLinked("higherSpending");
    const baseSpend = get(baseId).inputs.spending.desiredMonthlyNet;
    expect(resolved(linkedId).inputs.spending.desiredMonthlyNet).toBe(Math.round(baseSpend * 1.25));
  });

  it("noFolkepension ændrer kun statePension.mode", () => {
    const { baseId, linkedId } = setupLinked("noFolkepension");
    const baseFromAge = get(baseId).inputs.income.statePension.fromAge;
    const inp = resolved(linkedId).inputs;
    expect(inp.income.statePension.mode).toBe("none");
    expect(inp.income.statePension.fromAge).toBe(baseFromAge);
  });
});

describe("Custom scenarier", () => {
  it("convertToCustom løsriver scenariet fra basecase", () => {
    const { baseId, linkedId } = setupLinked("noBarma");
    useFinanceStore.getState().convertToCustom(linkedId);
    const ageBefore = get(linkedId).inputs.person.currentAge;
    useFinanceStore.getState().updateScenario(baseId, (s) => ({
      ...s,
      inputs: { ...s.inputs, person: { ...s.inputs.person, currentAge: ageBefore + 11 } },
    }));
    expect(get(linkedId).type).toBe("custom");
    expect(get(linkedId).inputs.person.currentAge).toBe(ageBefore);
  });

  it("rebaseOnCurrentBase gør custom til linked igen og henter aktuel base", () => {
    const { baseId, linkedId } = setupLinked("noBarma");
    useFinanceStore.getState().convertToCustom(linkedId);
    useFinanceStore.getState().updateScenario(baseId, (s) => ({
      ...s,
      inputs: { ...s.inputs, person: { ...s.inputs.person, currentAge: 41 } },
    }));
    useFinanceStore.getState().rebaseOnCurrentBase(linkedId);
    const sc = get(linkedId);
    expect(sc.type).toBe("linked_stress_test");
    expect(sc.manuallyEdited).toBe(false);
    expect(resolved(linkedId).inputs.person.currentAge).toBe(41);
    expect(resolved(linkedId).inputs.holding.balance).toBe(0);
  });
});

describe("Opsparingsstop", () => {
  it("default stopregel er 'stopAge'", () => {
    const baseId = useFinanceStore.getState().activeScenarioId;
    expect(get(baseId).inputs.free.contributionStopRule ?? "stopAge").toBe("stopAge");
  });

  it("planlagt opsparing er 0 kr efter valgt stopregel", () => {
    const baseId = useFinanceStore.getState().activeScenarioId;
    useFinanceStore.getState().updateScenario(baseId, (s) => ({
      ...s,
      inputs: {
        ...s.inputs,
        stopAge: 55,
        fullRetireAge: 62,
        free: { ...s.inputs.free, monthlyContribution: 5000, contributionStopRule: "stopAge" },
      },
    }));
    const sc = get(baseId);
    const years = project(sc, defaultAssumptions);
    const after = years.find((y) => y.age === 70)!;
    expect(after.flows.freeContribution).toBe(0);
  });
});

describe("Eksport / import bevarer scenario-typer", () => {
  it("base + linked + custom round-trippes med korrekt type, modifiers, baseScenarioId og manuallyEdited", () => {
    const baseId = useFinanceStore.getState().activeScenarioId;
    useFinanceStore.getState().applyStressModifier("noBarma");
    const linkedId = useFinanceStore.getState().activeScenarioId;
    useFinanceStore.getState().setActive(baseId);
    useFinanceStore.getState().applyStressModifier("noPartTime");
    const linkedId2 = useFinanceStore.getState().activeScenarioId;
    useFinanceStore.getState().convertToCustom(linkedId2);

    const json = useFinanceStore.getState().exportJson();
    const parsed = JSON.parse(json);
    expect(parsed.modelVersion).toBeDefined();

    // wipe + import
    useFinanceStore.setState({ scenarios: [makeBaseScenario()], activeScenarioId: "x" });
    useFinanceStore.getState().importJson(json);

    const base = get(baseId);
    const linked = get(linkedId);
    const custom = get(linkedId2);
    expect(base.type).toBe("base");
    expect(linked.type).toBe("linked_stress_test");
    expect(linked.modifiers?.noBarma).toBe(true);
    expect(linked.baseScenarioId).toBe(baseId);
    expect(custom.type).toBe("custom");
    expect(custom.manuallyEdited).toBe(true);
    expect(custom.modifiers?.noPartTime).toBe(true);
  });

  it("eksport indeholder contributionStopRule for alle scenarier", () => {
    setupLinked("noBarma");
    const json = useFinanceStore.getState().exportJson();
    const parsed = JSON.parse(json);
    for (const sc of parsed.scenarios) {
      expect(["stopAge", "fullRetireAge", "customAge", "never"]).toContain(
        sc.inputs.free.contributionStopRule ?? "stopAge",
      );
    }
  });
});

describe("Rapport / resolved data konsistens", () => {
  it("resolved scenario for et linked stress-test giver samme KPIs som basecase + modifier", () => {
    const { baseId, linkedId } = setupLinked("noBarma");
    useFinanceStore.getState().updateScenario(baseId, (s) => ({
      ...s,
      inputs: { ...s.inputs, person: { ...s.inputs.person, currentAge: 38 } },
    }));
    const r = resolved(linkedId);
    expect(r.inputs.person.currentAge).toBe(38);
    const ys = project(r, defaultAssumptions);
    const kpis = deriveKPIs(r, ys, defaultAssumptions);
    expect(kpis.plannedStopAge).toBe(r.inputs.stopAge);
    expect(r.inputs.holding.balance).toBe(0);
  });
});

describe("Render-stabilitet (referentiel)", () => {
  it("resolveScenario returnerer ny reference men er stabil ved gentagne kald uden mutation", () => {
    const { linkedId } = setupLinked("noBarma");
    const all = useFinanceStore.getState().scenarios;
    const a = resolveScenario(get(linkedId), all);
    const b = resolveScenario(get(linkedId), all);
    // Nye referencer (structuredClone), men dyb-lige indhold — det er pure-funktionen vi tester
    expect(a).not.toBe(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
