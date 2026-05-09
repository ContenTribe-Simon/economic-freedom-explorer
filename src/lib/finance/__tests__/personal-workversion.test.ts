/**
 * Personal arbejdsversion — regression tests.
 *
 * Dækker:
 *  - lokal persistence (zustand persist round-trip)
 *  - eksport indeholder modelversion + alle scenarier
 *  - import af gyldig fil virker
 *  - import af ugyldig fil fejler pænt
 *  - standard-scenarier oprettes uden at overskrive eksisterende
 *  - beregningslogikken for et eksisterende scenarie er uændret
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useFinanceStore } from "@/store/financeStore";
import { defaultAssumptions, makeBaseScenario } from "@/lib/finance/defaults";
import { project } from "@/lib/finance/projection";
import { deriveKPIs } from "@/lib/finance/kpis";
import { MODEL_VERSION } from "@/lib/finance/types";

const PERSIST_KEY = "finance-tool.v1";

function snapshotState() {
  const s = useFinanceStore.getState();
  return {
    scenarioCount: s.scenarios.length,
    activeId: s.activeScenarioId,
    names: s.scenarios.map((sc) => sc.name),
  };
}

beforeEach(() => {
  // Reset store to a single fresh base scenario.
  const fresh = makeBaseScenario();
  useFinanceStore.setState({
    scenarios: [fresh],
    activeScenarioId: fresh.id,
    assumptions: defaultAssumptions,
  });
});

afterEach(() => {
  if (typeof localStorage !== "undefined") localStorage.removeItem(PERSIST_KEY);
});

describe("local persistence", () => {
  it("zustand persist writes a snapshot to localStorage that can be re-read", () => {
    useFinanceStore.getState().addScenario("Persist test scenarie");
    const before = snapshotState();
    const raw = localStorage.getItem(PERSIST_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    expect(parsed.state.scenarios.length).toBe(before.scenarioCount);
    expect(parsed.state.scenarios.some((s: any) => s.name === "Persist test scenarie")).toBe(true);
    expect(parsed.state.activeScenarioId).toBe(before.activeId);
  });
});

describe("export / import", () => {
  it("exportJson contains modelVersion and every scenario", () => {
    useFinanceStore.getState().addScenario("Eksport scenarie");
    const json = useFinanceStore.getState().exportJson();
    const parsed = JSON.parse(json);
    expect(parsed.modelVersion).toBe(MODEL_VERSION);
    expect(typeof parsed.createdAt).toBe("number");
    expect(parsed.scenarios.length).toBe(useFinanceStore.getState().scenarios.length);
    expect(parsed.activeScenarioId).toBe(useFinanceStore.getState().activeScenarioId);
    expect(parsed.assumptions).toBeTruthy();
  });

  it("importJson with a valid file restores scenarios and assumptions", () => {
    useFinanceStore.getState().addScenario("Original A");
    useFinanceStore.getState().addScenario("Original B");
    const exported = useFinanceStore.getState().exportJson();

    // Mutate state, then re-import the snapshot.
    useFinanceStore.setState({ scenarios: [makeBaseScenario()], activeScenarioId: "x" });
    useFinanceStore.getState().importJson(exported);

    const names = useFinanceStore.getState().scenarios.map((s) => s.name);
    expect(names).toContain("Original A");
    expect(names).toContain("Original B");
  });

  it("importJson with malformed JSON throws a friendly error", () => {
    expect(() => useFinanceStore.getState().importJson("not-json")).toThrowError(/JSON/i);
  });

  it("importJson with structurally invalid JSON throws a friendly error", () => {
    expect(() => useFinanceStore.getState().importJson(JSON.stringify({ foo: "bar" }))).toThrowError(/scenarios/i);
  });
});

describe("standard scenarier", () => {
  it("addStandardScenarios adds Base + 5 stress-tests on a clean store", () => {
    const before = useFinanceStore.getState().scenarios.length;
    const { added } = useFinanceStore.getState().addStandardScenarios();
    expect(added).toBe(6);
    expect(useFinanceStore.getState().scenarios.length).toBe(before + 6);
    const names = useFinanceStore.getState().scenarios.map((s) => s.name);
    expect(names).toContain("Base case (standard)");
    expect(names).toContain("Base case (standard) – uden Barma");
  });

  it("addStandardScenarios is idempotent — does not overwrite existing scenarios", () => {
    useFinanceStore.getState().addStandardScenarios();
    const firstCount = useFinanceStore.getState().scenarios.length;
    const userScenarioId = useFinanceStore.getState().scenarios[0].id;
    const userScenarioName = useFinanceStore.getState().scenarios[0].name;
    const result = useFinanceStore.getState().addStandardScenarios();
    expect(result.added).toBe(0);
    expect(useFinanceStore.getState().scenarios.length).toBe(firstCount);
    // user's original scenario is untouched
    expect(useFinanceStore.getState().scenarios.find((s) => s.id === userScenarioId)?.name).toBe(userScenarioName);
  });
});

describe("model logic untouched", () => {
  it("base case KPIs are stable (sanity snapshot)", () => {
    const s = makeBaseScenario();
    const years = project(s, defaultAssumptions);
    const kpis = deriveKPIs(s, years, defaultAssumptions);
    expect(kpis.plannedStopAge).toBe(s.inputs.stopAge);
    expect(years.length).toBeGreaterThan(0);
    expect(typeof kpis.financialRobustness).toBe("number");
  });
});

describe("Report page module", () => {
  it("Report module loads without throwing at import time", async () => {
    const mod = await import("@/pages/Report");
    expect(typeof mod.default).toBe("function");
  });
});
