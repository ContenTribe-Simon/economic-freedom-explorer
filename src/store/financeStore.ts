import { useMemo } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Assumptions, LifeEvent, MODEL_RELEASE, MODEL_VERSION, ModelExport, Scenario, Snapshot, StressModifierKey } from "@/lib/finance/types";
import { defaultAssumptions, defaultInputs, makeBaseScenario } from "@/lib/finance/defaults";
import { applyStressModifierToState, classifyLegacyScenario, resolveScenario, STRESS_TESTS } from "@/lib/finance/stress";
import { buildSnapshot } from "@/lib/finance/snapshots";
import { normalizeLegacyLifeEvent } from "@/lib/finance/lifeEvents";

interface FinanceState {
  scenarios: Scenario[];
  activeScenarioId: string;
  assumptions: Assumptions;
  /** Frosne point-in-time snapshots — bruges som dokumentation/rapportgrundlag. */
  snapshots: Snapshot[];
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
  /** Materialisér et linked stress-test til et frit redigerbart custom-scenarie. */
  convertToCustom: (id: string) => void;
  /** Genskab et custom/linked-scenarie ud fra aktuel basecase + modifiers (gør det igen til linked stress-test). */
  rebaseOnCurrentBase: (id: string) => void;
  /** Alias for rebaseOnCurrentBase — fjerner manuelle ændringer og genskaber rent linked stress-test. */
  resetToCleanStressTest: (id: string) => void;
  /** Snapshots — frosne point-in-time kopier af aktivt scenarie. */
  saveSnapshot: (options?: { name?: string; notes?: string; scenarioId?: string }) => string;
  deleteSnapshot: (snapshotId: string) => void;
  renameSnapshot: (snapshotId: string, name: string) => void;
  updateSnapshotNotes: (snapshotId: string, notes: string) => void;
  duplicateSnapshot: (snapshotId: string) => string;
  /** Livsfaser CRUD på aktivt scenarie. */
  addLifeEvent: (scenarioId: string, event: LifeEvent) => void;
  updateLifeEvent: (scenarioId: string, eventId: string, patch: Partial<LifeEvent>) => void;
  removeLifeEvent: (scenarioId: string, eventId: string) => void;
  duplicateLifeEvent: (scenarioId: string, eventId: string) => void;
  toggleLifeEvent: (scenarioId: string, eventId: string) => void;
}

const STANDARD_BASE_NAME = "Base case (standard)";

function isValidImport(parsed: unknown): parsed is { scenarios: Scenario[]; assumptions?: Assumptions; activeScenarioId?: string; modelVersion?: number } {
  if (!parsed || typeof parsed !== "object") return false;
  const p = parsed as Record<string, unknown>;
  if (!Array.isArray(p.scenarios) || p.scenarios.length === 0) return false;
  return p.scenarios.every((s) => s && typeof s === "object" && "inputs" in (s as object) && typeof (s as Scenario).name === "string");
}

const seed: Scenario = { ...makeBaseScenario(), type: "base", updatedAt: Date.now() };

export const useFinanceStore = create<FinanceState>()(
  persist(
    (set, get) => ({
      scenarios: [seed],
      activeScenarioId: seed.id,
      assumptions: defaultAssumptions,
      snapshots: [],
      setActive: (id) => {
        const cur = get().activeScenarioId;
        if (cur === id) return; // no-op when same scenario clicked
        if (!get().scenarios.some((s) => s.id === id)) return;
        set({ activeScenarioId: id });
      },
      updateScenario: (id, updater) =>
        set((s) => ({
          scenarios: s.scenarios.map((sc) => {
            if (sc.id !== id) return sc;
            const next = updater(sc);
            // Hvis et linket stress-test bliver opdateret, materialisér det til custom.
            // (UI eskalerer typisk via convertToCustom() først, men dette er en sikkerhedsventil.)
            if (sc.type === "linked_stress_test" && next !== sc) {
              return { ...next, type: "custom", manuallyEdited: true, updatedAt: Date.now() };
            }
            return { ...next, updatedAt: Date.now() };
          }),
        })),
      addScenario: (name = "Nyt scenarie", fromId) => {
        const base = fromId ? get().scenarios.find((s) => s.id === fromId) : undefined;
        const sc: Scenario = base
          ? {
              ...structuredClone(base),
              id: crypto.randomUUID(),
              name,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              // Et nyt scenarie kopieret fra en anden er altid uafhængigt (custom),
              // medmindre brugeren eksplicit kører applyStressModifier bagefter.
              type: "custom",
              manuallyEdited: false,
              modifiers: {},
              baseScenarioId: undefined,
              baseScenarioName: undefined,
            }
          : {
              id: crypto.randomUUID(),
              name,
              createdAt: Date.now(),
              updatedAt: Date.now(),
              type: "custom",
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
          snapshots: get().snapshots,
          metadata: { source: "local", release: MODEL_RELEASE },
        };
        return JSON.stringify(payload, null, 2);
      },
      importJson: (json) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(json);
        } catch {
          throw new Error("Filen er ikke gyldig JSON.");
        }
        if (!isValidImport(parsed)) {
          throw new Error("Filen ligner ikke en gyldig model-eksport (mangler scenarios).");
        }
        // Klassificér evt. legacy-scenarier uden `type`-felt.
        const scenarios = parsed.scenarios.map((sc) => {
          if (sc.type) return sc;
          const baseScenario = sc.baseScenarioId ? parsed.scenarios.find((x) => x.id === sc.baseScenarioId) : undefined;
          const cls = classifyLegacyScenario(sc, baseScenario);
          return { ...sc, type: cls.type, manuallyEdited: cls.manuallyEdited };
        });
        const importedSnapshots = Array.isArray((parsed as any).snapshots) ? ((parsed as any).snapshots as Snapshot[]) : [];
        set({
          scenarios,
          assumptions: parsed.assumptions ?? defaultAssumptions,
          activeScenarioId: parsed.activeScenarioId ?? scenarios[0].id,
          snapshots: importedSnapshots,
        });
      },
      addStandardScenarios: () => {
        const existingNames = new Set(get().scenarios.map((s) => s.name));
        const toAdd: Scenario[] = [];

        // Base
        if (!existingNames.has(STANDARD_BASE_NAME)) {
          const base = makeBaseScenario();
          base.name = STANDARD_BASE_NAME;
          base.metadata = { ...(base.metadata ?? {}), standard: true };
          toAdd.push(base);
        }

        // Build a temporary working set including the base, to apply each stress-test on top.
        const baseRef = toAdd[0] ?? get().scenarios.find((s) => s.name === STANDARD_BASE_NAME);
        if (baseRef) {
          for (const t of STRESS_TESTS) {
            const expectedName = `${STANDARD_BASE_NAME} – ${t.suffix}`;
            if (existingNames.has(expectedName)) continue;
            const next = structuredClone(baseRef);
            next.id = crypto.randomUUID();
            next.name = expectedName;
            next.createdAt = Date.now();
            next.updatedAt = Date.now();
            next.baseScenarioId = baseRef.id;
            next.baseScenarioName = baseRef.name;
            next.modifiers = { [t.key]: true };
            next.metadata = { ...(next.metadata ?? {}), standard: true };
            next.type = "linked_stress_test";
            next.manuallyEdited = false;
            t.apply(next);
            toAdd.push(next);
          }
        }

        // Sørg for at base-scenariet er markeret som "base"
        if (toAdd[0]) toAdd[0].type = "base";

        const skipped = (1 + STRESS_TESTS.length) - toAdd.length;
        if (toAdd.length > 0) {
          set((s) => ({ scenarios: [...s.scenarios, ...toAdd] }));
        }
        return { added: toAdd.length, skipped };
      },
      convertToCustom: (id) =>
        set((s) => ({
          scenarios: s.scenarios.map((sc) => {
            if (sc.id !== id) return sc;
            if (sc.type !== "linked_stress_test") return sc;
            // Materialisér med aktuelle resolved værdier
            const resolved = resolveScenario(sc, s.scenarios);
            return {
              ...resolved,
              type: "custom",
              manuallyEdited: true,
              updatedAt: Date.now(),
            };
          }),
        })),
      rebaseOnCurrentBase: (id) =>
        set((s) => {
          const sc = s.scenarios.find((x) => x.id === id);
          if (!sc || !sc.baseScenarioId) return s;
          const base = s.scenarios.find((x) => x.id === sc.baseScenarioId);
          if (!base) return s;
          // Genskab som linked_stress_test ud fra aktuel base + bevarede modifiers
          const linked: Scenario = {
            ...sc,
            type: "linked_stress_test",
            manuallyEdited: false,
            updatedAt: Date.now(),
          };
          const resolved = resolveScenario(linked, s.scenarios);
          return {
            ...s,
            scenarios: s.scenarios.map((x) => (x.id === id ? resolved : x)),
          };
        }),
      resetToCleanStressTest: (id) => get().rebaseOnCurrentBase(id),

      saveSnapshot: (options = {}) => {
        const state = get();
        const sourceId = options.scenarioId ?? state.activeScenarioId;
        const scenario = state.scenarios.find((s) => s.id === sourceId);
        if (!scenario) return "";
        const snap = buildSnapshot(scenario, state.scenarios, state.assumptions, {
          name: options.name,
          notes: options.notes,
        });
        set((s) => ({ snapshots: [snap, ...s.snapshots] }));
        return snap.snapshotId;
      },
      deleteSnapshot: (snapshotId) =>
        set((s) => ({ snapshots: s.snapshots.filter((x) => x.snapshotId !== snapshotId) })),
      renameSnapshot: (snapshotId, name) =>
        set((s) => ({
          snapshots: s.snapshots.map((x) =>
            x.snapshotId === snapshotId ? { ...x, snapshotName: name, updatedAt: Date.now() } : x,
          ),
        })),
      updateSnapshotNotes: (snapshotId, notes) =>
        set((s) => ({
          snapshots: s.snapshots.map((x) =>
            x.snapshotId === snapshotId ? { ...x, notes, updatedAt: Date.now() } : x,
          ),
        })),
      duplicateSnapshot: (snapshotId) => {
        const orig = get().snapshots.find((x) => x.snapshotId === snapshotId);
        if (!orig) return "";
        const copy: Snapshot = structuredClone({
          ...orig,
          snapshotId: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2),
          snapshotName: `${orig.snapshotName} (kopi)`,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        set((s) => ({ snapshots: [copy, ...s.snapshots] }));
        return copy.snapshotId;
      },

      // -------- LifeEvents --------
      addLifeEvent: (scenarioId, event) =>
        get().updateScenario(scenarioId, (sc) => ({
          ...sc,
          inputs: { ...sc.inputs, lifeEvents: [...(sc.inputs.lifeEvents ?? []), event] },
        })),
      updateLifeEvent: (scenarioId, eventId, patch) =>
        get().updateScenario(scenarioId, (sc) => ({
          ...sc,
          inputs: {
            ...sc.inputs,
            lifeEvents: (sc.inputs.lifeEvents ?? []).map((e) => (e.id === eventId ? { ...e, ...patch } : e)),
          },
        })),
      removeLifeEvent: (scenarioId, eventId) =>
        get().updateScenario(scenarioId, (sc) => ({
          ...sc,
          inputs: {
            ...sc.inputs,
            lifeEvents: (sc.inputs.lifeEvents ?? []).filter((e) => e.id !== eventId),
          },
        })),
      duplicateLifeEvent: (scenarioId, eventId) =>
        get().updateScenario(scenarioId, (sc) => {
          const events = sc.inputs.lifeEvents ?? [];
          const orig = events.find((e) => e.id === eventId);
          if (!orig) return sc;
          const copy: LifeEvent = {
            ...orig,
            id: typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2),
            name: `${orig.name} (kopi)`,
          };
          return { ...sc, inputs: { ...sc.inputs, lifeEvents: [...events, copy] } };
        }),
      toggleLifeEvent: (scenarioId, eventId) =>
        get().updateScenario(scenarioId, (sc) => ({
          ...sc,
          inputs: {
            ...sc.inputs,
            lifeEvents: (sc.inputs.lifeEvents ?? []).map((e) => (e.id === eventId ? { ...e, enabled: !e.enabled } : e)),
          },
        })),
    }),
    {
      name: "finance-tool.v1",
      version: 14,
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
        // v11: klassificér eksisterende scenarier til ny scenario-type
        // (base / linked_stress_test / custom + manuallyEdited).
        if (Array.isArray(state.scenarios)) {
          const all = state.scenarios as Scenario[];
          state.scenarios = all.map((sc) => {
            if (sc.type) return sc; // allerede klassificeret (nyt felt)
            const baseScenario = sc.baseScenarioId ? all.find((x) => x.id === sc.baseScenarioId) : undefined;
            const cls = classifyLegacyScenario(sc, baseScenario);
            return { ...sc, type: cls.type, manuallyEdited: cls.manuallyEdited };
          });
        }
        // v12: tilføj eksplicit stopregel for planlagt fri opsparing (default = "stopAge")
        if (Array.isArray(state.scenarios)) {
          state.scenarios = state.scenarios.map((sc: any) => ({
            ...sc,
            inputs: {
              ...sc.inputs,
              free: {
                ...sc.inputs?.free,
                contributionStopRule: sc.inputs?.free?.contributionStopRule ?? "stopAge",
              },
            },
          }));
        }
        // v13: snapshots-felt — sikr at det altid findes som array
        if (!Array.isArray(state.snapshots)) {
          state.snapshots = [];
        }
        // v14: normalisér lifeEvents til ny shape (legacy events deaktiveres)
        if (Array.isArray(state.scenarios)) {
          state.scenarios = state.scenarios.map((sc: any) => {
            const raw = Array.isArray(sc.inputs?.lifeEvents) ? sc.inputs.lifeEvents : [];
            const normalized = raw.map((e: any) => normalizeLegacyLifeEvent(e));
            return { ...sc, inputs: { ...sc.inputs, lifeEvents: normalized } };
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

/**
 * Hook der returnerer det aktive scenarie KLAR til beregning.
 * For linked stress-tests rebygges scenariet ud fra aktuel basecase + modifiers.
 */
export function useResolvedActiveScenario() {
  const scenarios = useFinanceStore((s) => s.scenarios);
  const activeScenarioId = useFinanceStore((s) => s.activeScenarioId);
  return useMemo(() => {
    const active = scenarios.find((sc) => sc.id === activeScenarioId) ?? scenarios[0];
    return resolveScenario(active, scenarios);
  }, [scenarios, activeScenarioId]);
}
