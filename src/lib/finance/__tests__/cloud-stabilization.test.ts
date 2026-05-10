/**
 * Cloud stabilization & data consistency
 *
 * Tester at cloud save/load via serialize/apply bevarer hele modellen 1:1,
 * at snapshots forbliver frosne, at lokal eksport/import virker uafhængigt
 * af cloud, og at legacy-data uden cloud-felter kan indlæses.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }),
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}));

import { useFinanceStore } from "@/store/financeStore";
import { defaultAssumptions, makeBaseScenario } from "@/lib/finance/defaults";
import { serializeStoreState, applyStateToStore } from "@/lib/cloud/models";
import { MODEL_VERSION } from "@/lib/finance/types";

function resetStore() {
  const fresh = makeBaseScenario();
  useFinanceStore.setState({
    scenarios: [fresh],
    activeScenarioId: fresh.id,
    assumptions: defaultAssumptions,
    snapshots: [],
  });
}

beforeEach(resetStore);

describe("cloud stabilization — full roundtrip", () => {
  it("bevarer scenarios, types, modifiers, baseScenarioId, manuallyEdited, assumptions, snapshots, activeScenarioId, modelVersion", () => {
    const store = useFinanceStore.getState();

    // Byg en rig state: base + linked stress test + custom
    store.applyStressModifier("noBarma");
    const customId = store.addScenario("Manuel kopi");
    store.updateScenario(customId, (s) => ({
      ...s,
      manuallyEdited: true,
      inputs: { ...s.inputs, stopAge: s.inputs.stopAge + 3 },
    }));
    store.saveSnapshot({ name: "Snap A", notes: "test note A" });
    store.saveSnapshot({ name: "Snap B" });

    const before = useFinanceStore.getState();
    const beforeSerialized = serializeStoreState();
    const parsed = JSON.parse(beforeSerialized);

    // modelVersion + metadata bevares i payload
    expect(parsed.modelVersion).toBe(MODEL_VERSION);
    expect(parsed.metadata?.source).toBe("local");

    // Simulér cloud roundtrip: nulstil → applyStateToStore (load) → exportJson → importJson
    resetStore();
    applyStateToStore(beforeSerialized);
    const exported = useFinanceStore.getState().exportJson();
    resetStore();
    useFinanceStore.getState().importJson(exported);

    const after = useFinanceStore.getState();
    expect(after.scenarios.length).toBe(before.scenarios.length);
    expect(after.activeScenarioId).toBe(before.activeScenarioId);
    expect(after.assumptions).toEqual(before.assumptions);

    // Scenario types + felter
    for (const sBefore of before.scenarios) {
      const sAfter = after.scenarios.find((x) => x.id === sBefore.id);
      expect(sAfter, `scenario ${sBefore.name} mangler efter roundtrip`).toBeDefined();
      expect(sAfter!.type).toBe(sBefore.type);
      expect(sAfter!.modifiers ?? {}).toEqual(sBefore.modifiers ?? {});
      expect(sAfter!.baseScenarioId).toBe(sBefore.baseScenarioId);
      expect(!!sAfter!.manuallyEdited).toBe(!!sBefore.manuallyEdited);
    }

    // Snapshots bevaret med navn, noter og frosne tal
    expect(after.snapshots.length).toBe(before.snapshots.length);
    for (const snapBefore of before.snapshots) {
      const snapAfter = after.snapshots.find((x) => x.snapshotId === snapBefore.snapshotId)!;
      expect(snapAfter.snapshotName).toBe(snapBefore.snapshotName);
      expect(snapAfter.notes).toBe(snapBefore.notes);
      expect(snapAfter.kpis).toEqual(snapBefore.kpis);
      expect(snapAfter.years.length).toBe(snapBefore.years.length);
      expect(snapAfter.scenarioType).toBe(snapBefore.scenarioType);
    }
  });
});

describe("cloud stabilization — snapshot frysning", () => {
  it("snapshots genberegnes ikke ved cloud-load — tal er identiske", () => {
    const store = useFinanceStore.getState();
    store.saveSnapshot({ name: "Frozen" });
    const snapBefore = useFinanceStore.getState().snapshots[0];
    const kpisJson = JSON.stringify(snapBefore.kpis);

    const json = serializeStoreState();

    // Ændr alt muligt på basecase som ville påvirke en genberegning
    store.updateScenario(useFinanceStore.getState().activeScenarioId, (s) => ({
      ...s,
      inputs: { ...s.inputs, stopAge: s.inputs.stopAge + 7 },
    }));
    useFinanceStore.setState({ assumptions: { ...defaultAssumptions, returnReal: 0.01 } as any });

    applyStateToStore(json);
    const snapAfter = useFinanceStore.getState().snapshots[0];
    expect(JSON.stringify(snapAfter.kpis)).toBe(kpisJson);
  });
});

describe("cloud stabilization — lokal fallback", () => {
  it("eksport/import virker uden at have rørt cloud-modulet", () => {
    useFinanceStore.getState().addScenario("Lokalt scenarie");
    useFinanceStore.getState().saveSnapshot({ name: "Lokalt snap" });
    const json = useFinanceStore.getState().exportJson();
    resetStore();
    useFinanceStore.getState().importJson(json);
    const s = useFinanceStore.getState();
    expect(s.scenarios.some((x) => x.name === "Lokalt scenarie")).toBe(true);
    expect(s.snapshots.some((x) => x.snapshotName === "Lokalt snap")).toBe(true);
  });

  it("store er fuldt brugbar uden auth-session (logged-out mode)", () => {
    expect(useFinanceStore.getState().scenarios.length).toBeGreaterThan(0);
    const id = useFinanceStore.getState().saveSnapshot({ name: "noauth" });
    expect(id).toBeTruthy();
    expect(useFinanceStore.getState().snapshots[0].snapshotName).toBe("noauth");
  });
});

describe("cloud stabilization — legacy data", () => {
  it("importerer legacy payload uden snapshots-array og uden scenario.type", () => {
    const fresh = makeBaseScenario();
    const legacy = {
      modelVersion: MODEL_VERSION,
      activeScenarioId: fresh.id,
      assumptions: defaultAssumptions,
      scenarios: [
        // intet `type`-felt — skal klassificeres som "base"
        { ...fresh, type: undefined, manuallyEdited: undefined },
      ],
      // bevidst ingen snapshots-key
    };
    expect(() => useFinanceStore.getState().importJson(JSON.stringify(legacy))).not.toThrow();
    const s = useFinanceStore.getState();
    expect(s.scenarios.length).toBe(1);
    expect(s.scenarios[0].type).toBeTruthy();
    expect(Array.isArray(s.snapshots)).toBe(true);
    expect(s.snapshots.length).toBe(0);
  });
});

describe("cloud stabilization — ingen render loops", () => {
  it("gentagne load-kald giver stabil state (idempotent)", () => {
    useFinanceStore.getState().addScenario("Stabilt");
    useFinanceStore.getState().saveSnapshot({ name: "S" });
    const json = serializeStoreState();
    applyStateToStore(json);
    const a = serializeStoreState();
    applyStateToStore(json);
    const b = serializeStoreState();
    applyStateToStore(json);
    const c = serializeStoreState();
    // Strip volatile timestamps tilføjet af exportJson()
    const strip = (s: string) => s.replace(/"(updatedAt|createdAt)":\s*\d+/g, "");
    expect(strip(a)).toBe(strip(b));
    expect(strip(b)).toBe(strip(c));
  });
});
