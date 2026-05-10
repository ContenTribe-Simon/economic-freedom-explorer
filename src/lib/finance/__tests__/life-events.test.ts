import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import { computeLifeEventEffects, makeLifeEvent, normalizeLegacyLifeEvent } from "../lifeEvents";
import { LifeEvent } from "../types";

function withEvents(events: LifeEvent[]) {
  const s = makeBaseScenario();
  s.inputs.lifeEvents = events;
  return s;
}

describe("life events — baseline preservation", () => {
  it("no events produces identical projection as before", () => {
    const a = makeBaseScenario();
    const b = makeBaseScenario();
    b.inputs.lifeEvents = [];
    const ya = project(a, defaultAssumptions);
    const yb = project(b, defaultAssumptions);
    for (let i = 0; i < ya.length; i++) {
      expect(yb[i].netWorth).toBeCloseTo(ya[i].netWorth, 2);
      expect(yb[i].flows.spending).toBeCloseTo(ya[i].flows.spending, 2);
    }
  });

  it("disabled event has no effect", () => {
    const a = makeBaseScenario();
    const b = withEvents([makeLifeEvent({ enabled: false, frequency: "monthly", amount: 10000, effectTarget: "privateSpending", effectDirection: "increase", startAge: 41 })]);
    const ya = project(a, defaultAssumptions);
    const yb = project(b, defaultAssumptions);
    for (let i = 0; i < ya.length; i++) {
      expect(yb[i].netWorth).toBeCloseTo(ya[i].netWorth, 2);
    }
  });
});

describe("life events — recurring effects", () => {
  it("recurring spending increase raises spending in active years only", () => {
    const start = 45, end = 50;
    const s = withEvents([makeLifeEvent({ frequency: "monthly", amount: 5000, effectTarget: "privateSpending", effectDirection: "increase", startAge: start, endAge: end })]);
    const base = makeBaseScenario();
    const ys = project(s, defaultAssumptions);
    const yb = project(base, defaultAssumptions);
    for (const y of ys) {
      const baseYear = yb.find((x) => x.age === y.age)!;
      if (y.age >= start && y.age <= end) {
        expect(y.flows.spending - baseYear.flows.spending).toBeCloseTo(60_000, 0);
      } else {
        expect(y.flows.spending).toBeCloseTo(baseYear.flows.spending, 0);
      }
    }
  });

  it("recurring income increase raises totalIncomeNet in active years", () => {
    const s = withEvents([makeLifeEvent({ frequency: "annual", amount: 50_000, effectTarget: "privateIncome", effectDirection: "increase", startAge: 50, endAge: 55 })]);
    const ys = project(s, defaultAssumptions);
    const baseYs = project(makeBaseScenario(), defaultAssumptions);
    for (const y of ys) {
      const b = baseYs.find((x) => x.age === y.age)!;
      const expected = y.age >= 50 && y.age <= 55 ? 50_000 : 0;
      expect(y.totalIncomeNet - b.totalIncomeNet).toBeCloseTo(expected, 0);
    }
  });

  it("spending decrease reduces spending in active years", () => {
    const s = withEvents([makeLifeEvent({ frequency: "monthly", amount: 5000, effectTarget: "privateSpending", effectDirection: "decrease", startAge: 50 })]);
    const ys = project(s, defaultAssumptions);
    const base = project(makeBaseScenario(), defaultAssumptions);
    const y50 = ys.find((y) => y.age === 50)!;
    const b50 = base.find((y) => y.age === 50)!;
    expect(y50.flows.spending).toBeCloseTo(b50.flows.spending - 60_000, 0);
  });
});

describe("life events — one-time effects", () => {
  it("one-time free capital decrease only affects startAge", () => {
    const s = withEvents([makeLifeEvent({ frequency: "one_time", amount: 100_000, effectTarget: "freeCapital", effectDirection: "decrease", startAge: 45 })]);
    const ys = project(s, defaultAssumptions);
    const base = project(makeBaseScenario(), defaultAssumptions);
    const y44 = ys.find((y) => y.age === 44)!;
    const b44 = base.find((y) => y.age === 44)!;
    expect(y44.netWorth).toBeCloseTo(b44.netWorth, 0);
    const y45 = ys.find((y) => y.age === 45)!;
    const b45 = base.find((y) => y.age === 45)!;
    expect(y45.netWorth).toBeLessThan(b45.netWorth);
  });

  it("one-time free capital increase boosts net worth from startAge onward", () => {
    const s = withEvents([makeLifeEvent({ frequency: "one_time", amount: 200_000, effectTarget: "freeCapital", effectDirection: "increase", startAge: 50 })]);
    const ys = project(s, defaultAssumptions);
    const base = project(makeBaseScenario(), defaultAssumptions);
    const y50 = ys.find((y) => y.age === 50)!;
    const b50 = base.find((y) => y.age === 50)!;
    expect(y50.netWorth).toBeGreaterThan(b50.netWorth);
  });

  it("growthRate scales recurring amount over time", () => {
    const ev = makeLifeEvent({ frequency: "annual", amount: 10_000, growthRate: 0.05, startAge: 41, effectTarget: "privateIncome", effectDirection: "increase" });
    const eff41 = computeLifeEventEffects([ev], 41, 95)!;
    const eff46 = computeLifeEventEffects([ev], 46, 95)!;
    expect(eff41.incomeDelta).toBeCloseTo(10_000, 0);
    expect(eff46.incomeDelta).toBeCloseTo(10_000 * Math.pow(1.05, 5), 0);
  });
});

describe("life events — audit/flows", () => {
  it("active events appear in YearRow.flows.lifeEventEffects.items", () => {
    const s = withEvents([makeLifeEvent({ frequency: "monthly", amount: 1000, effectTarget: "privateSpending", effectDirection: "increase", startAge: 50, endAge: 51 })]);
    const ys = project(s, defaultAssumptions);
    const y50 = ys.find((y) => y.age === 50)!;
    const y49 = ys.find((y) => y.age === 49)!;
    expect(y50.flows.lifeEventEffects?.items.length).toBe(1);
    expect(y49.flows.lifeEventEffects).toBeUndefined();
  });
});

describe("life events — legacy normalization", () => {
  it("normalizes old shape to disabled new shape", () => {
    const legacy = { id: "old1", label: "Boligkøb", type: "expense", startAge: 45, amount: 200_000, affectsCashflow: true };
    const out = normalizeLegacyLifeEvent(legacy);
    expect(out.enabled).toBe(false);
    expect(out.name).toBe("Boligkøb");
    expect(out.effectTarget).toBe("privateSpending");
  });

  it("passes through new shape unchanged", () => {
    const ev = makeLifeEvent({ name: "x", category: "custom" });
    const out = normalizeLegacyLifeEvent(ev);
    expect(out.id).toBe(ev.id);
  });
});

describe("life events — JSON export/import roundtrip", () => {
  it("preserves lifeEvents through exportJson/importJson", async () => {
    const { useFinanceStore } = await import("@/store/financeStore");
    const store = useFinanceStore.getState();
    const sid = store.activeScenarioId;
    const ev = makeLifeEvent({ name: "Test event", frequency: "monthly", amount: 1234, startAge: 50, effectTarget: "privateSpending", effectDirection: "increase" });
    store.addLifeEvent(sid, ev);
    const json = useFinanceStore.getState().exportJson();
    useFinanceStore.getState().importJson(json);
    const after = useFinanceStore.getState().scenarios.find((s) => s.id === sid)!;
    const found = (after.inputs.lifeEvents ?? []).find((e) => e.id === ev.id);
    expect(found).toBeDefined();
    expect(found?.amount).toBe(1234);
  });
});
