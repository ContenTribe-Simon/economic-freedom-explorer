import { Scenario, StressModifierKey } from "./types";

export type StressModifier = { key: StressModifierKey; label: string; suffix: string; apply: (s: Scenario) => void };

export const STRESS_TESTS: StressModifier[] = [
  {
    key: "noBarma",
    label: "No Barma",
    suffix: "uden Barma",
    apply: (s) => {
      s.inputs.holding.balance = 0;
      s.inputs.holding.expectedExitValue = 0;
      s.inputs.holding.annualDistribution = 0;
    },
  },
  {
    key: "noPartTime",
    label: "No part-time",
    suffix: "uden deltid",
    apply: (s) => {
      s.inputs.income.partTime.grossAnnual = 0;
      s.inputs.income.partTime.netMonthly = 0;
      s.inputs.fullRetireAge = s.inputs.stopAge;
    },
  },
  {
    key: "lowReturn",
    label: "Low return",
    suffix: "lavt afkast",
    apply: (s) => {
      s.assumptionsOverride = {
        ...(s.assumptionsOverride ?? {}),
        realReturn: { free: 0.02, pension: 0.02, holding: 0.01 },
      };
    },
  },
  {
    key: "higherSpending",
    label: "Higher spending",
    suffix: "højere forbrug",
    apply: (s) => {
      s.inputs.spending.desiredMonthlyNet = Math.round(s.inputs.spending.desiredMonthlyNet * 1.25);
    },
  },
  {
    key: "noFolkepension",
    label: "No folkepension",
    suffix: "uden folkepension",
    apply: (s) => {
      s.inputs.income.statePension.mode = "none";
    },
  },
];

export const modifierOrder = STRESS_TESTS.map((t) => t.key);

export const activeModifierKeys = (scenario: Scenario) => modifierOrder.filter((key) => scenario.modifiers?.[key]);

export const modifierSignature = (keys: StressModifierKey[]) => [...new Set(keys)].sort().join("|");

export const baseIdentity = (scenario: Scenario) => scenario.baseScenarioId ?? scenario.id;

export const baseName = (scenario: Scenario) => scenario.baseScenarioName ?? scenario.name.split(" – ")[0];

export const stressScenarioName = (source: Scenario, keys: StressModifierKey[]) => {
  const suffixes = modifierOrder
    .filter((key) => keys.includes(key))
    .map((key) => STRESS_TESTS.find((t) => t.key === key)?.suffix)
    .filter(Boolean);
  return [baseName(source), ...suffixes].join(" – ");
};

export const findStressScenario = (scenarios: Scenario[], source: Scenario, keys: StressModifierKey[]) => {
  const signature = modifierSignature(keys);
  const base = baseIdentity(source);
  return scenarios.find((scenario) => baseIdentity(scenario) === base && modifierSignature(activeModifierKeys(scenario)) === signature);
};

const id = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

export const applyStressModifierToState = (scenarios: Scenario[], activeScenarioId: string, key: StressModifierKey) => {
  const test = STRESS_TESTS.find((t) => t.key === key);
  const source = scenarios.find((s) => s.id === activeScenarioId);
  if (!test || !source || source.modifiers?.[key]) return { scenarios, activeScenarioId };

  const newKeys = [...activeModifierKeys(source), key];
  const existing = findStressScenario(scenarios, source, newKeys);
  if (existing) return { scenarios, activeScenarioId: existing.id };

  const scenarioName = stressScenarioName(source, newKeys);
  const next = structuredClone(source);
  next.id = id();
  next.name = scenarioName;
  next.createdAt = Date.now();
  next.baseScenarioId = baseIdentity(source);
  next.baseScenarioName = baseName(source);
  next.modifiers = newKeys.reduce<Scenario["modifiers"]>((acc, modifierKey) => ({ ...acc, [modifierKey]: true }), {});
  test.apply(next);

  return { scenarios: [...scenarios, next], activeScenarioId: next.id };
};