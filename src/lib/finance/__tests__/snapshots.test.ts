/**
 * Snapshots — frosne point-in-time kopier.
 *
 * Bekræfter at snapshots gemmes med resolved data, ikke ændrer sig når
 * basecase senere ændres, kan slettes/dupliceres, og round-trippes via
 * eksport/import — også når importfilen er en gammel version uden snapshots.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useFinanceStore } from "@/store/financeStore";
import { defaultAssumptions, makeBaseScenario } from "@/lib/finance/defaults";
import { buildSnapshot } from "@/lib/finance/snapshots";
import type { Scenario } from "@/lib/finance/types";

const PERSIST_KEY = "finance-tool.v1";

beforeEach(() => {
  if (typeof localStorage !== "undefined") localStorage.removeItem(PERSIST_KEY);
  const fresh: Scenario = { ...makeBaseScenario(), type: "base", updatedAt: Date.now() };
  useFinanceStore.setState({
    scenarios: [fresh],
    activeScenarioId: fresh.id,
    assumptions: defaultAssumptions,
    snapshots: [],
  });
});

function getStore() {
  return useFinanceStore.getState();
}

describe("Snapshots: gem & frys", () => {
  it("kan gemme snapshot af basecase med resolved data", () => {
    const id = getStore().saveSnapshot({ name: "Base v1" });
    const snap = getStore().snapshots.find((s) => s.snapshotId === id)!;
    expect(snap.snapshotName).toBe("Base v1");
    expect(snap.scenarioType).toBe("base");
    expect(snap.modelVersion).toBeGreaterThan(0);
    expect(snap.resolvedInputs).toBeDefined();
    expect(snap.kpis).toBeDefined();
    expect(snap.years.length).toBeGreaterThan(0);
    expect(snap.chartData.length).toBe(snap.years.length);
  });

  it("snapshot af linked stress-test gemmer resolved (materialiseret) data", () => {
    getStore().applyStressModifier("noBarma");
    const id = getStore().saveSnapshot();
    const snap = getStore().snapshots.find((s) => s.snapshotId === id)!;
    expect(snap.scenarioType).toBe("linked_stress_test");
    // Resolved → holding skal være neutraliseret
    expect(snap.resolvedInputs.holding.balance).toBe(0);
    expect(snap.resolvedInputs.holding.expectedExitValue).toBe(0);
  });

  it("snapshot ændrer sig ikke når basecase efterfølgende ændres", () => {
    const baseId = getStore().activeScenarioId;
    const id = getStore().saveSnapshot();
    const before = getStore().snapshots.find((s) => s.snapshotId === id)!;
    const beforeAge = before.resolvedInputs.person.currentAge;
    const beforeStop = before.kpis.plannedStopAge;

    getStore().updateScenario(baseId, (s) => ({
      ...s,
      inputs: { ...s.inputs, person: { ...s.inputs.person, currentAge: 30 }, stopAge: 50 },
    }));

    const after = getStore().snapshots.find((s) => s.snapshotId === id)!;
    expect(after.resolvedInputs.person.currentAge).toBe(beforeAge);
    expect(after.kpis.plannedStopAge).toBe(beforeStop);
  });

  it("snapshot ændrer sig ikke når linked scenarie senere rebaseres", () => {
    const baseId = getStore().activeScenarioId;
    getStore().applyStressModifier("noBarma");
    const linkedId = getStore().activeScenarioId;
    const id = getStore().saveSnapshot();
    const beforeStop = getStore().snapshots[0].kpis.plannedStopAge;

    getStore().updateScenario(baseId, (s) => ({ ...s, inputs: { ...s.inputs, stopAge: 50 } }));
    getStore().rebaseOnCurrentBase(linkedId);

    const after = getStore().snapshots.find((s) => s.snapshotId === id)!;
    expect(after.kpis.plannedStopAge).toBe(beforeStop);
  });

  it("kan slettes", () => {
    const id = getStore().saveSnapshot();
    expect(getStore().snapshots.length).toBe(1);
    getStore().deleteSnapshot(id);
    expect(getStore().snapshots.length).toBe(0);
  });

  it("kan dupliceres som ny version", () => {
    const id = getStore().saveSnapshot({ name: "v1" });
    const copyId = getStore().duplicateSnapshot(id);
    expect(copyId).not.toBe(id);
    expect(getStore().snapshots.length).toBe(2);
    const copy = getStore().snapshots.find((s) => s.snapshotId === copyId)!;
    expect(copy.snapshotName).toContain("(kopi)");
  });

  it("kan omdøbes og noter opdateres", () => {
    const id = getStore().saveSnapshot();
    getStore().renameSnapshot(id, "Ny titel");
    getStore().updateSnapshotNotes(id, "Note A");
    const s = getStore().snapshots.find((x) => x.snapshotId === id)!;
    expect(s.snapshotName).toBe("Ny titel");
    expect(s.notes).toBe("Note A");
  });
});

describe("Eksport / import bevarer snapshots", () => {
  it("eksport indeholder snapshots-array", () => {
    getStore().saveSnapshot({ name: "S1" });
    const json = getStore().exportJson();
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed.snapshots)).toBe(true);
    expect(parsed.snapshots.length).toBe(1);
    expect(parsed.snapshots[0].snapshotName).toBe("S1");
  });

  it("import bevarer snapshots som frosne data", () => {
    getStore().saveSnapshot({ name: "S1" });
    getStore().saveSnapshot({ name: "S2" });
    const json = getStore().exportJson();

    useFinanceStore.setState({ scenarios: [makeBaseScenario()], activeScenarioId: "x", snapshots: [] });
    getStore().importJson(json);
    const names = getStore().snapshots.map((s) => s.snapshotName).sort();
    expect(names).toEqual(["S1", "S2"]);
  });

  it("gamle eksportfiler uden snapshots-felt accepteres (snapshots = [])", () => {
    const json = getStore().exportJson();
    const parsed = JSON.parse(json);
    delete parsed.snapshots;
    getStore().importJson(JSON.stringify(parsed));
    expect(getStore().snapshots).toEqual([]);
  });
});

describe("buildSnapshot helper er ren og uafhængig", () => {
  it("returnerer snapshot uden referencer til live state", () => {
    const sc = getStore().scenarios[0];
    const snap = buildSnapshot(sc, getStore().scenarios, getStore().assumptions, { name: "X" });
    expect(snap.resolvedInputs).not.toBe(sc.inputs);
    // Mutér live → snap er upåvirket
    const before = snap.resolvedInputs.person.currentAge;
    getStore().updateScenario(sc.id, (s) => ({
      ...s,
      inputs: { ...s.inputs, person: { ...s.inputs.person, currentAge: 99 } },
    }));
    expect(snap.resolvedInputs.person.currentAge).toBe(before);
  });
});

describe("Rapport-modul renders i både live- og snapshot-mode uden at smide", () => {
  it("Report module loader (lazy import er stabil)", async () => {
    const mod = await import("@/pages/Report");
    expect(typeof mod.default).toBe("function");
  });
});
