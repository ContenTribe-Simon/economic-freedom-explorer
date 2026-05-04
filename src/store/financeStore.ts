import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Assumptions, Scenario } from "@/lib/finance/types";
import { defaultAssumptions, defaultInputs, makeBaseScenario } from "@/lib/finance/defaults";

interface FinanceState {
  scenarios: Scenario[];
  activeScenarioId: string;
  assumptions: Assumptions;
  setActive: (id: string) => void;
  updateScenario: (id: string, updater: (s: Scenario) => Scenario) => void;
  addScenario: (name?: string, fromId?: string) => string;
  duplicateScenario: (id: string) => string;
  renameScenario: (id: string, name: string) => void;
  deleteScenario: (id: string) => void;
  updateAssumptions: (updater: (a: Assumptions) => Assumptions) => void;
  resetAssumptions: () => void;
  exportJson: () => string;
  importJson: (json: string) => void;
}

const seed = makeBaseScenario();

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      scenarios: [seed],
      activeScenarioId: seed.id,
      assumptions: defaultAssumptions,
      setActive: (id) => set({ activeScenarioId: id }),
      updateScenario: (id, updater) =>
        set((s) => ({
          scenarios: s.scenarios.map((sc) => (sc.id === id ? updater(sc) : sc)),
        })),
      addScenario: (name = "Nyt scenarie", fromId) => {
        const base = fromId ? get().scenarios.find((s) => s.id === fromId) : undefined;
        const sc: Scenario = base
          ? { ...structuredClone(base), id: crypto.randomUUID(), name, createdAt: Date.now() }
          : {
              id: crypto.randomUUID(),
              name,
              createdAt: Date.now(),
              inputs: structuredClone(defaultInputs),
            };
        set((s) => ({ scenarios: [...s.scenarios, sc], activeScenarioId: sc.id }));
        return sc.id;
      },
      duplicateScenario: (id) => {
        const orig = get().scenarios.find((s) => s.id === id);
        if (!orig) return id;
        return get().addScenario(`${orig.name} (kopi)`, id);
      },
      renameScenario: (id, name) =>
        set((s) => ({ scenarios: s.scenarios.map((sc) => (sc.id === id ? { ...sc, name } : sc)) })),
      deleteScenario: (id) =>
        set((s) => {
          const remaining = s.scenarios.filter((sc) => sc.id !== id);
          if (remaining.length === 0) {
            const fresh = makeBaseScenario();
            return { scenarios: [fresh], activeScenarioId: fresh.id };
          }
          return {
            scenarios: remaining,
            activeScenarioId: s.activeScenarioId === id ? remaining[0].id : s.activeScenarioId,
          };
        }),
      updateAssumptions: (updater) => set((s) => ({ assumptions: updater(s.assumptions) })),
      resetAssumptions: () => set({ assumptions: defaultAssumptions }),
      exportJson: () => JSON.stringify({ scenarios: get().scenarios, assumptions: get().assumptions }, null, 2),
      importJson: (json) => {
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed.scenarios) && parsed.scenarios.length > 0) {
          set({
            scenarios: parsed.scenarios,
            assumptions: parsed.assumptions ?? defaultAssumptions,
            activeScenarioId: parsed.scenarios[0].id,
          });
        }
      },
    }),
    { name: "finance-tool.v1" },
  ),
);

export function useActiveScenario() {
  return useFinanceStore((s) => s.scenarios.find((sc) => sc.id === s.activeScenarioId) ?? s.scenarios[0]);
}
