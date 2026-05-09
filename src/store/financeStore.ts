import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Assumptions, MODEL_RELEASE, MODEL_VERSION, ModelExport, Scenario, StressModifierKey } from "@/lib/finance/types";
import { defaultAssumptions, defaultInputs, makeBaseScenario } from "@/lib/finance/defaults";
import { applyStressModifierToState, STRESS_TESTS } from "@/lib/finance/stress";

interface FinanceState {
  scenarios: Scenario[];
  activeScenarioId: string;
  assumptions: Assumptions;
  setActive: (id: string) => void;
  updateScenario: (id: string, updater: (s: Scenario) => Scenario) => void;
  addScenario: (name?: string, fromId?: string) => string;
  duplicateScenario: (id: string) => string;
  applyStressModifier: (key: StressModifierKey) => void;
  renameScenario: (id: string, name: string) => void;
  deleteScenario: (id: string) => void;
  updateAssumptions: (updater: (a: Assumptions) => Assumptions) => void;
  resetAssumptions: () => void;
  exportJson: () => string;
  importJson: (json: string) => void;
  /** Tilføjer manglende standard-scenarier (Base + stress-tests) uden at overskrive eksisterende. */
  addStandardScenarios: () => { added: number; skipped: number };
}

const STANDARD_BASE_NAME = "Base case (standard)";

function isValidImport(parsed: unknown): parsed is { scenarios: Scenario[]; assumptions?: Assumptions; activeScenarioId?: string; modelVersion?: number } {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.scenarios) || p.scenarios.length === 0) return false;
  return p.scenarios.every((s) => s && typeof s === "object" && "inputs" in (s as object) && typeof (s as Scenario).name === "string");
}

const seed = makeBaseScenario();

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      scenarios: [seed],
      activeScenarioId: seed.id,
      assumptions: defaultAssumptions,
      setActive: (id) => {
        const cur = get().activeScenarioId;
        if (cur === id) return; // no-op when same scenario clicked
        if (!get().scenarios.some((s) => s.id === id)) return;
        set({ activeScenarioId: id });
      },
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
      applyStressModifier: (key) =>
        set((s) => applyStressModifierToState(s.scenarios, s.activeScenarioId, key)),
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
      exportJson: () => {
        const now = Date.now();
        const payload: ModelExport = {
          modelVersion: MODEL_VERSION,
          createdAt: now,
          updatedAt: now,
          activeScenarioId: get().activeScenarioId,
          scenarios: get().scenarios.map((s) => ({ ...s, updatedAt: s.updatedAt ?? now })),
          assumptions: get().assumptions,
          metadata: { source: "local", release: MODEL_RELEASE },
        };
        return JSON.stringify(payload, null, 2);
      },
      importJson: (json) => {
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed.scenarios) && parsed.scenarios.length > 0) {
          set({
            scenarios: parsed.scenarios,
            assumptions: parsed.assumptions ?? defaultAssumptions,
            activeScenarioId: parsed.activeScenarioId ?? parsed.scenarios[0].id,
          });
        }
      },
    }),
    {
      name: "finance-tool.v1",
      version: 10,
      migrate: (state: any, version: number) => {
        if (!state) return state;
        // v7: fjern global pensionPayoutRate fra assumptions
        if (state.assumptions?.tax && "pensionPayoutRate" in state.assumptions.tax) {
          delete state.assumptions.tax.pensionPayoutRate;
        }
        if (Array.isArray(state.scenarios)) {
          const stressLabels: Record<StressModifierKey, string> = {
            noBarma: "uden Barma",
            noPartTime: "uden deltid",
            lowReturn: "lavt afkast",
            higherSpending: "højere forbrug",
            noFolkepension: "uden folkepension",
          };
          const stressKeys = Object.keys(stressLabels) as StressModifierKey[];
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
                  holdingFinancing: d.kind === "holding" ? (d.holdingFinancing ?? "holding_capital") : d.holdingFinancing,
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

            const oldPension = old.pension ?? {};

            const existingModifiers = sc.modifiers ?? {};
            const inferredModifierKeys = stressKeys.filter((key) => existingModifiers[key] || String(sc.name ?? "").includes(stressLabels[key]));
            const baseScenarioName = sc.baseScenarioName ?? String(sc.name ?? "Base case").split(" – ")[0];
            const cleanName = [baseScenarioName, ...inferredModifierKeys.map((key) => stressLabels[key])].join(" – ");

            return {
              ...sc,
              name: inferredModifierKeys.length > 0 ? cleanName : sc.name,
              modifiers: inferredModifierKeys.reduce((acc, key) => ({ ...acc, [key]: true }), {}),
              baseScenarioId: sc.baseScenarioId,
              baseScenarioName: inferredModifierKeys.length > 0 ? baseScenarioName : sc.baseScenarioName,
              inputs: {
                ...old,
                free: {
                  balance: oldFree.balance ?? 0,
                  monthlyContribution: oldFree.monthlyContribution ?? 0,
                  annualExtraContribution: oldFree.annualExtraContribution ?? 0,
                  cashBuffer: oldFree.cashBuffer ?? 0,
                  bufferUsableForShortfall: oldFree.bufferUsableForShortfall ?? false,
                },
                pension: {
                  balance: oldPension.balance ?? 0,
                  monthlyContribution: oldPension.monthlyContribution ?? 0,
                  employerContribution: oldPension.employerContribution ?? 0,
                  payoutFromAge: oldPension.payoutFromAge ?? oldHolding.pensionAvailableFromAge ?? 64,
                  ratePensionEnabled: oldPension.ratePensionEnabled ?? true,
                  ratePensionPayoutYears: oldPension.ratePensionPayoutYears ?? 15,
                  ratePensionEffectiveTaxRate: oldPension.ratePensionEffectiveTaxRate ?? 0.4,
                  lifeAnnuity: oldPension.lifeAnnuity ?? {
                    enabled: false,
                    mode: "gross",
                    annualGross: 0,
                    annualNet: 0,
                    fromAge: 67,
                    effectiveTaxRate: 0.4,
                  },
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
        // v9: sikr at confidence-felt findes (tomt objekt = brug defaults)
        if (Array.isArray(state.scenarios)) {
          state.scenarios = state.scenarios.map((sc: any) => ({
            ...sc,
            inputs: { ...sc.inputs, confidence: sc.inputs?.confidence ?? {} },
          }));
        }
        // v10: forbered modelVersion-felter + lifeEvents placeholder
        if (Array.isArray(state.scenarios)) {
          const now = Date.now();
          state.scenarios = state.scenarios.map((sc: any) => ({
            ...sc,
            updatedAt: sc.updatedAt ?? sc.createdAt ?? now,
            metadata: sc.metadata ?? {},
            inputs: { ...sc.inputs, lifeEvents: sc.inputs?.lifeEvents ?? [] },
          }));
        }
        return state;
      },
    },
  ),
);

export function useActiveScenario() {
  return useFinanceStore((s) => s.scenarios.find((sc) => sc.id === s.activeScenarioId) ?? s.scenarios[0]);
}
