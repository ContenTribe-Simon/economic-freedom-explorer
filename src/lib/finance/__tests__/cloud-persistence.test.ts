/**
 * Cloud persistence — round-trip tests.
 *
 * Verificerer at serialize/apply via cloud-modulet bevarer scenarios + snapshots
 * uden at genberegne snapshot-data. Beregningsmotoren mockes ikke.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock supabase client (cloud-modulet importerer det)
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ order: async () => ({ data: [], error: null }) }) }),
    auth: { getUser: async () => ({ data: { user: null } }) },
  },
}));

import { useFinanceStore } from "@/store/financeStore";
import { defaultAssumptions, makeBaseScenario } from "@/lib/finance/defaults";
import { serializeStoreState, applyStateToStore, hashCurrentState } from "@/lib/cloud/models";

beforeEach(() => {
  const fresh = makeBaseScenario();
  useFinanceStore.setState({
    scenarios: [fresh],
    activeScenarioId: fresh.id,
    assumptions: defaultAssumptions,
    snapshots: [],
  });
});

describe("cloud persistence round-trip", () => {
  it("serialize → apply bevarer scenarios og activeScenarioId", () => {
    useFinanceStore.getState().addScenario("Cloud test");
    const before = useFinanceStore.getState();
    const json = serializeStoreState();

    // mutér state og indlæs igen
    useFinanceStore.setState({ scenarios: [makeBaseScenario()], activeScenarioId: "x", snapshots: [] });
    applyStateToStore(json);

    const after = useFinanceStore.getState();
    expect(after.scenarios.length).toBe(before.scenarios.length);
    expect(after.scenarios.some((s) => s.name === "Cloud test")).toBe(true);
    expect(after.activeScenarioId).toBe(before.activeScenarioId);
  });

  it("snapshots forbliver frosne efter cloud round-trip (ingen genberegning)", () => {
    useFinanceStore.getState().saveSnapshot({ name: "Frozen v1" });
    const snapBefore = useFinanceStore.getState().snapshots[0];
    expect(snapBefore).toBeDefined();
    const kpisBefore = snapBefore.kpis;
    const yearsLenBefore = snapBefore.years.length;

    const json = serializeStoreState();

    // ændr basecase efter snapshot — skal ikke påvirke det indlæste snapshot
    useFinanceStore.getState().updateScenario(useFinanceStore.getState().activeScenarioId, (s) => ({
      ...s,
      stopAge: s.stopAge + 5,
    }));

    applyStateToStore(json);
    const snapAfter = useFinanceStore.getState().snapshots[0];
    expect(snapAfter.snapshotName).toBe("Frozen v1");
    expect(snapAfter.kpis).toEqual(kpisBefore);
    expect(snapAfter.years.length).toBe(yearsLenBefore);
  });

  it("hashCurrentState ændrer sig når state ændres, og er stabil ellers", async () => {
    const h1 = await hashCurrentState();
    const h2 = await hashCurrentState();
    expect(h1).toBe(h2);
    useFinanceStore.getState().addScenario("dirty");
    const h3 = await hashCurrentState();
    expect(h3).not.toBe(h1);
  });

  it("lokal eksport/import virker stadig (uafhængigt af cloud)", () => {
    useFinanceStore.getState().addScenario("Lokalt");
    const json = useFinanceStore.getState().exportJson();
    useFinanceStore.setState({ scenarios: [makeBaseScenario()], activeScenarioId: "x", snapshots: [] });
    useFinanceStore.getState().importJson(json);
    expect(useFinanceStore.getState().scenarios.some((s) => s.name === "Lokalt")).toBe(true);
  });

  it("app virker uden login: store kan initialiseres uden auth-session", () => {
    // Ingen auth-kald foretages af store ved init
    expect(useFinanceStore.getState().scenarios.length).toBeGreaterThan(0);
    expect(useFinanceStore.getState().activeScenarioId).toBeTruthy();
  });
});
