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
    {
      name: "finance-tool.v1",
      version: 4,
      migrate: (state: any) => {
        if (!state) return state;
        if (Array.isArray(state.scenarios)) {
          state.scenarios = state.scenarios.map((sc: any) => {
            const old = sc.inputs ?? {};
            const oldFree = old.free ?? {};
            const oldDebt = old.debt;
            const oldIncome = old.income ?? {};
            const oldHolding = old.holding ?? {};

            const debts = Array.isArray(old.debts)
              ? old.debts.map((d: any) => ({
                  ...d,
                  includeInNetWorth: d.includeInNetWorth ?? (d.impact !== "risk_only"),
                }))
              : oldDebt
                ? [
                    {
                      id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2),
                      name: "Privat gæld",
                      kind: "private",
                      balance: oldDebt.balance ?? 0,
                      interestRate: oldDebt.interestRate ?? 0.04,
                      monthlyPayment: oldDebt.monthlyPayment ?? 0,
                      impact: "private",
                      includeInNetWorth: true,
                    },
                  ]
                : [];

            const partTime = oldIncome.partTime ?? {
              mode: "net_monthly",
              grossAnnual: oldIncome.partTimeAnnualGross ?? 0,
              netMonthly: 18000,
              fromAge: oldIncome.partTimeFromAge ?? 55,
              untilAge: oldIncome.partTimeUntilAge ?? 62,
            };

            const statePension = oldIncome.statePension ?? {
              mode: "baseOnly",
              fromAge: oldIncome.statePensionFromAge ?? 67,
              baseGrossAnnual: 90528,
              effectiveTaxRate: 0.37,
              manualNetAnnual: state.assumptions?.statePensionAnnualNet ?? 90000,
            };

            return {
              ...sc,
              inputs: {
                ...old,
                free: {
                  balance: oldFree.balance ?? 0,
                  monthlyContribution: oldFree.monthlyContribution ?? 0,
                  annualExtraContribution: oldFree.annualExtraContribution ?? 0,
                  cashBuffer: oldFree.cashBuffer ?? 0,
                  bufferUsableForShortfall: oldFree.bufferUsableForShortfall ?? false,
                },
                debts,
                holding: {
                  distributionFromAge: oldHolding.distributionFromAge ?? old.stopAge ?? 55,
                  startDistributionAtStopAge: oldHolding.startDistributionAtStopAge ?? true,
                  withdrawalStrategy: oldHolding.withdrawalStrategy ?? "planned_only",
                  pensionAvailableFromAge: oldHolding.pensionAvailableFromAge ?? 60,
                  ...oldHolding,
                },
                income: {
                  salaryGross: oldIncome.salaryGross ?? 0,
                  familyFundAnnualNet: oldIncome.familyFundAnnualNet ?? 0,
                  familyFundUntilAge: oldIncome.familyFundUntilAge ?? 70,
                  partTime,
                  statePension,
                },
                target: old.target ?? { minNetWorthAtEnd: 0 },
              },
            };
          });
        }
        return state;
      },
    },
  ),
);

export function useActiveScenario() {
  return useFinanceStore((s) => s.scenarios.find((sc) => sc.id === s.activeScenarioId) ?? s.scenarios[0]);
}
