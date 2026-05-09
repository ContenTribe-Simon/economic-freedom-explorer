/**
 * Scenarie-type regressionstests
 *
 * Tester at:
 *  - linked stress-tests beregnes dynamisk fra aktuel basecase + modifiers
 *  - manuel ændring eskalerer linked → custom (manuallyEdited)
 *  - rebaseOnCurrentBase genskaber linked og fjerner manuelle ændringer
 *  - eksport/import bevarer type, baseScenarioId, modifiers, manuallyEdited
 *  - migration klassificerer legacy-scenarier korrekt (rent linket vs custom)
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useFinanceStore } from "@/store/financeStore";
import { defaultAssumptions, makeBaseScenario } from "@/lib/finance/defaults";
import { resolveScenario, classifyLegacyScenario, STRESS_TESTS } from "@/lib/finance/stress";
import { project } from "@/lib/finance/projection";
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

describe("linked stress-tests følger aktuel basecase", () => {
  it("'uden Barma': ændring i basecase forbrug slår igennem på linked scenarie", () => {
    const baseId = useFinanceStore.getState().activeScenarioId;
    useFinanceStore.getState().applyStressModifier("noBarma");
    const linkedId = useFinanceStore.getState().activeScenarioId;
    expect(linkedId).not.toBe(baseId);

    const linked = useFinanceStore.getState().scenarios.find((s) => s.id === linkedId)!;
    expect(linked.type).toBe("linked_stress_test");
    expect(linked.baseScenarioId).toBe(baseId);

    // Ændr basecase forbrug fra default 35000 til 15000
    useFinanceStore.getState().updateScenario(baseId, (s) => ({
      ...s,
      inputs: { ...s.inputs, spending: { ...s.inputs.spending, desiredMonthlyNet: 15000 } },
    }));

    const all = useFinanceStore.getState().scenarios;
    const linkedAfter = all.find((s) => s.id === linkedId)!;
    const resolved = resolveScenario(linkedAfter, all);

    expect(resolved.inputs.spending.desiredMonthlyNet).toBe(15000); // følger ny basecase
    expect(resolved.inputs.holding.balance).toBe(0); // modifier stadig anvendt
    expect(resolved.inputs.holding.expectedExitValue).toBe(0);
  });

  it("'uden deltid': ændring i basecase løn slår igennem på linked scenarie", () => {
    const baseId = useFinanceStore.getState().activeScenarioId;
    useFinanceStore.getState().applyStressModifier("noPartTime");
    const linkedId = useFinanceStore.getState().activeScenarioId;

    useFinanceStore.getState().updateScenario(baseId, (s) => ({
      ...s,
      inputs: { ...s.inputs, income: { ...s.inputs.income, salaryGross: 1_200_000 } },
    }));

    const all = useFinanceStore.getState().scenarios;
    const resolved = resolveScenario(all.find((s) => s.id === linkedId)!, all);
    expect(resolved.inputs.income.salaryGross).toBe(1_200_000); // følger basecase
    expect(resolved.inputs.income.partTime.grossAnnual).toBe(0); // modifier
    expect(resolved.inputs.income.partTime.netMonthly).toBe(0);
  });
});

describe("eskalering linked → custom", () => {
  it("convertToCustom låser scenariet og afkobler det fra basecase", () => {
    const baseId = useFinanceStore.getState().activeScenarioId;
    useFinanceStore.getState().applyStressModifier("noBarma");
    const linkedId = useFinanceStore.getState().activeScenarioId;

    useFinanceStore.getState().convertToCustom(linkedId);
    const after = useFinanceStore.getState().scenarios.find((s) => s.id === linkedId)!;
    expect(after.type).toBe("custom");
    expect(after.manuallyEdited).toBe(true);
    expect(after.inputs.holding.balance).toBe(0); // materialiseret

    // Senere basecase-ændring må IKKE påvirke det custom scenarie
    useFinanceStore.getState().updateScenario(baseId, (s) => ({
      ...s,
      inputs: { ...s.inputs, spending: { ...s.inputs.spending, desiredMonthlyNet: 9999 } },
    }));
    const all = useFinanceStore.getState().scenarios;
    const customAfter = all.find((s) => s.id === linkedId)!;
    const resolved = resolveScenario(customAfter, all);
    expect(resolved.inputs.spending.desiredMonthlyNet).not.toBe(9999);
  });

  it("updateScenario på linked → eskalerer automatisk til custom + manuallyEdited", () => {
    useFinanceStore.getState().applyStressModifier("noBarma");
    const linkedId = useFinanceStore.getState().activeScenarioId;
    expect(useFinanceStore.getState().scenarios.find((s) => s.id === linkedId)!.type).toBe("linked_stress_test");

    useFinanceStore.getState().updateScenario(linkedId, (s) => ({
      ...s,
      inputs: { ...s.inputs, spending: { ...s.inputs.spending, desiredMonthlyNet: 1234 } },
    }));

    const after = useFinanceStore.getState().scenarios.find((s) => s.id === linkedId)!;
    expect(after.type).toBe("custom");
    expect(after.manuallyEdited).toBe(true);
    expect(after.inputs.spending.desiredMonthlyNet).toBe(1234);
  });
});

describe("rebaseOnCurrentBase", () => {
  it("rebaserer custom (med modifiers) tilbage til linked stress-test", () => {
    const baseId = useFinanceStore.getState().activeScenarioId;
    useFinanceStore.getState().applyStressModifier("noBarma");
    const linkedId = useFinanceStore.getState().activeScenarioId;
    useFinanceStore.getState().convertToCustom(linkedId);
    // Manuel ændring af forbrug
    useFinanceStore.getState().updateScenario(linkedId, (s) => ({
      ...s,
      inputs: { ...s.inputs, spending: { ...s.inputs.spending, desiredMonthlyNet: 9999 } },
    }));

    // Skift basecase forbrug
    useFinanceStore.getState().updateScenario(baseId, (s) => ({
      ...s,
      inputs: { ...s.inputs, spending: { ...s.inputs.spending, desiredMonthlyNet: 12000 } },
    }));

    useFinanceStore.getState().rebaseOnCurrentBase(linkedId);
    const after = useFinanceStore.getState().scenarios.find((s) => s.id === linkedId)!;
    expect(after.type).toBe("linked_stress_test");
    expect(after.manuallyEdited).toBe(false);
    expect(after.inputs.spending.desiredMonthlyNet).toBe(12000); // genskabt fra ny basecase
    expect(after.inputs.holding.balance).toBe(0); // modifier reapplied
  });
});

describe("eksport / import bevarer scenarie-type", () => {
  it("type, baseScenarioId, modifiers, manuallyEdited overlever round-trip", () => {
    useFinanceStore.getState().applyStressModifier("noBarma");
    const linkedId = useFinanceStore.getState().activeScenarioId;
    useFinanceStore.getState().convertToCustom(linkedId);
    useFinanceStore.getState().applyStressModifier("noPartTime"); // (på custom) — skaber endnu et linked på custom
    const json = useFinanceStore.getState().exportJson();

    // Reset state og re-importér
    const fresh: Scenario = { ...makeBaseScenario(), type: "base", updatedAt: Date.now() };
    useFinanceStore.setState({ scenarios: [fresh], activeScenarioId: fresh.id });
    useFinanceStore.getState().importJson(json);

    const customAfter = useFinanceStore.getState().scenarios.find((s) => s.id === linkedId)!;
    expect(customAfter.type).toBe("custom");
    expect(customAfter.manuallyEdited).toBe(true);
    expect(customAfter.modifiers?.noBarma).toBe(true);
  });
});

describe("classifyLegacyScenario", () => {
  it("scenarie uden modifiers klassificeres som 'base'", () => {
    const base = makeBaseScenario();
    expect(classifyLegacyScenario(base, undefined).type).toBe("base");
  });

  it("scenarie hvor inputs matcher base + modifier klassificeres som linked", () => {
    const base = makeBaseScenario();
    const linked = structuredClone(base);
    linked.id = "linked";
    linked.baseScenarioId = base.id;
    linked.modifiers = { noBarma: true };
    STRESS_TESTS.find((t) => t.key === "noBarma")!.apply(linked);

    const cls = classifyLegacyScenario(linked, base);
    expect(cls.type).toBe("linked_stress_test");
    expect(cls.manuallyEdited).toBe(false);
  });

  it("scenarie med modifiers + ekstra ændringer klassificeres som custom + manuallyEdited", () => {
    const base = makeBaseScenario();
    const dirty = structuredClone(base);
    dirty.id = "dirty";
    dirty.baseScenarioId = base.id;
    dirty.modifiers = { noBarma: true };
    STRESS_TESTS.find((t) => t.key === "noBarma")!.apply(dirty);
    // ekstra ændring uden for modifier-whitelist
    dirty.inputs.spending.desiredMonthlyNet = 99999;

    const cls = classifyLegacyScenario(dirty, base);
    expect(cls.type).toBe("custom");
    expect(cls.manuallyEdited).toBe(true);
  });
});

describe("beregningsmotor uændret", () => {
  it("project() giver samme resultat for resolved linked og legacy materialiseret scenarie", () => {
    const baseId = useFinanceStore.getState().activeScenarioId;
    useFinanceStore.getState().applyStressModifier("noBarma");
    const linkedId = useFinanceStore.getState().activeScenarioId;
    const all = useFinanceStore.getState().scenarios;
    const linked = all.find((s) => s.id === linkedId)!;
    const resolved = resolveScenario(linked, all);

    const baseScenario = all.find((s) => s.id === baseId)!;
    const materialized = structuredClone(baseScenario);
    materialized.id = "tmp";
    STRESS_TESTS.find((t) => t.key === "noBarma")!.apply(materialized);

    const a = project(resolved, defaultAssumptions);
    const b = project(materialized, defaultAssumptions);
    expect(a.length).toBe(b.length);
    expect(a[0].netWorth).toBeCloseTo(b[0].netWorth, 2);
    expect(a[a.length - 1].netWorth).toBeCloseTo(b[b.length - 1].netWorth, 2);
  });
});
