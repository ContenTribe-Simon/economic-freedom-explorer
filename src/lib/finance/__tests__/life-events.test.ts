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

describe("life events — endAge validation & rendering", () => {
  it("empty endAge means continues to lifeExpectancy", async () => {
    const { isLifeEventValid, formatLifeEventPeriod, effectiveEndAge } = await import("../lifeEvents");
    const ev = makeLifeEvent({ startAge: 50, endAge: undefined, frequency: "monthly", amount: 1000, effectTarget: "privateSpending", effectDirection: "increase" });
    expect(isLifeEventValid(ev)).toBe(true);
    expect(effectiveEndAge(ev, 95)).toBe(95);
    expect(formatLifeEventPeriod(ev)).toBe("fra alder 50 og frem");
    const s = withEvents([ev]);
    const ys = project(s, defaultAssumptions);
    const last = ys[ys.length - 1];
    expect(last.flows.lifeEventEffects?.items.length).toBe(1);
  });

  it("endAge = 0 is treated as empty (no end)", async () => {
    const { isLifeEventValid, effectiveEndAge, formatLifeEventPeriod } = await import("../lifeEvents");
    const ev = makeLifeEvent({ startAge: 50, endAge: 0 as any, frequency: "monthly", amount: 1000, effectTarget: "privateSpending", effectDirection: "increase" });
    expect(ev.endAge).toBeUndefined();
    expect(isLifeEventValid(ev)).toBe(true);
    expect(effectiveEndAge(ev, 95)).toBe(95);
    expect(formatLifeEventPeriod(ev)).toContain("og frem");
  });

  it("endAge < startAge => invalid and zero effect on projection", async () => {
    const { isLifeEventValid, lifeEventValidationError } = await import("../lifeEvents");
    const ev = makeLifeEvent({ startAge: 50, endAge: 23, frequency: "monthly", amount: 9999, effectTarget: "privateSpending", effectDirection: "increase" });
    expect(isLifeEventValid(ev)).toBe(false);
    expect(lifeEventValidationError(ev)).toMatch(/Til alder/);
    const ys = project(withEvents([ev]), defaultAssumptions);
    const yb = project(makeBaseScenario(), defaultAssumptions);
    for (let i = 0; i < ys.length; i++) {
      expect(ys[i].netWorth).toBeCloseTo(yb[i].netWorth, 2);
      expect(ys[i].flows.lifeEventEffects).toBeUndefined();
    }
  });

  it("invalid event triggers sanity error", async () => {
    const { sanityChecks } = await import("../sanity");
    const ev = makeLifeEvent({ name: "Lavere forbrug", startAge: 50, endAge: 23, frequency: "monthly", amount: 1000, effectTarget: "privateSpending", effectDirection: "decrease" });
    const s = withEvents([ev]);
    const ys = project(s, defaultAssumptions);
    const checks = sanityChecks(s, ys);
    const found = checks.find((c) => c.id === `le-end-${ev.id}`);
    expect(found).toBeDefined();
    expect(found?.severity).toBe("error");
    expect(found?.title).toContain("Lavere forbrug");
  });

  it("empty endAge does NOT produce a sanity error", async () => {
    const { sanityChecks } = await import("../sanity");
    const ev = makeLifeEvent({ startAge: 50, endAge: undefined, frequency: "monthly", amount: 1000, effectTarget: "privateSpending", effectDirection: "increase" });
    const s = withEvents([ev]);
    const checks = sanityChecks(s, project(s, defaultAssumptions));
    expect(checks.find((c) => c.id === `le-end-${ev.id}`)).toBeUndefined();
  });

  it("one_time events ignore endAge entirely", async () => {
    const { isLifeEventValid, formatLifeEventPeriod } = await import("../lifeEvents");
    const ev = makeLifeEvent({ startAge: 50, endAge: 10, frequency: "one_time", amount: 100000, effectTarget: "freeCapital", effectDirection: "decrease" });
    expect(isLifeEventValid(ev)).toBe(true);
    expect(formatLifeEventPeriod(ev)).toBe("ved alder 50");
    const ys = project(withEvents([ev]), defaultAssumptions);
    const y50 = ys.find((y) => y.age === 50)!;
    expect(y50.flows.lifeEventEffects?.items.length).toBe(1);
  });

  it("legacy data with endAge=0 normalises to undefined", () => {
    const out = normalizeLegacyLifeEvent({ id: "x", label: "L", type: "expense", startAge: 40, endAge: 0, amount: 1000 });
    expect(out.endAge).toBeUndefined();
  });

  it("export/import preserves empty endAge", async () => {
    const { useFinanceStore } = await import("@/store/financeStore");
    const store = useFinanceStore.getState();
    const sid = store.activeScenarioId;
    const ev = makeLifeEvent({ name: "No end", startAge: 50, endAge: undefined, frequency: "monthly", amount: 1000, effectTarget: "privateSpending", effectDirection: "increase" });
    store.addLifeEvent(sid, ev);
    const json = useFinanceStore.getState().exportJson();
    useFinanceStore.getState().importJson(json);
    const after = useFinanceStore.getState().scenarios.find((s) => s.id === sid)!;
    const found = (after.inputs.lifeEvents ?? []).find((e) => e.id === ev.id);
    expect(found).toBeDefined();
    expect(found?.endAge === undefined || found?.endAge === null || found?.endAge === 0).toBe(true);
  });
});
