import { Scenario, StressModifierKey } from "./types";

/**
 * Hver modifier har et eksplicit allowedFields-katalog (dot-paths) der dokumenterer
 * præcis hvilke felter modifieren må ændre. Bruges af UI til at afgøre om en
 * brugerredigering er en "ren" modifier-justering (sjældent) vs. en eskalering
 * der skal konvertere scenariet til custom.
 */
export type StressModifier = {
  key: StressModifierKey;
  label: string;
  suffix: string;
  /** Felter modifieren styrer — alle andre felter skal komme fra basecase. */
  allowedFields: string[];
  apply: (s: Scenario) => void;
};

export const STRESS_TESTS: StressModifier[] = [
  {
    key: "noBarma",
    label: "No Barma",
    suffix: "uden Barma",
    allowedFields: [
      "inputs.holding.balance",
      "inputs.holding.expectedExitValue",
      "inputs.holding.annualDistribution",
    ],
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
    allowedFields: [
      "inputs.income.partTime.grossAnnual",
      "inputs.income.partTime.netMonthly",
      "inputs.fullRetireAge",
    ],
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
    allowedFields: [
      "assumptionsOverride.realReturn.free",
      "assumptionsOverride.realReturn.pension",
      "assumptionsOverride.realReturn.holding",
    ],
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
    allowedFields: ["inputs.spending.desiredMonthlyNet"],
    apply: (s) => {
      s.inputs.spending.desiredMonthlyNet = Math.round(s.inputs.spending.desiredMonthlyNet * 1.25);
    },
  },
  {
    key: "noFolkepension",
    label: "No folkepension",
    suffix: "uden folkepension",
    allowedFields: ["inputs.income.statePension.mode"],
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

  // Det "rigtige" basecase for et nyt linked stress-test er kilden, hvis kilden
  // selv er base/custom — eller kildens base, hvis kilden allerede er linket.
  const baseSource =
    source.type === "linked_stress_test" && source.baseScenarioId
      ? scenarios.find((s) => s.id === source.baseScenarioId) ?? source
      : source;

  const scenarioName = stressScenarioName(baseSource, newKeys);
  const next = structuredClone(baseSource);
  next.id = id();
  next.name = scenarioName;
  next.createdAt = Date.now();
  next.updatedAt = Date.now();
  next.baseScenarioId = baseSource.id;
  next.baseScenarioName = baseName(baseSource);
  next.modifiers = newKeys.reduce<Scenario["modifiers"]>((acc, modifierKey) => ({ ...acc, [modifierKey]: true }), {});
  next.type = "linked_stress_test";
  next.manuallyEdited = false;
  // Anvend alle aktive modifiers (ikke kun den nye) for at få et komplet snapshot
  // af den linkede cache. Beregningen bruger resolveScenario alligevel.
  for (const k of newKeys) {
    STRESS_TESTS.find((t) => t.key === k)?.apply(next);
  }

  return { scenarios: [...scenarios, next], activeScenarioId: next.id };
};

/**
 * Returnér det scenarie der skal bruges til beregning.
 *
 * For "linked_stress_test" rebygges scenariet ud fra den AKTUELLE basecase
 * + alle aktive modifiers. Dermed slår ændringer i basecase automatisk
 * igennem på linkede stress-tests.
 *
 * For "base" og "custom" returneres scenariet som-er.
 */
export function resolveScenario(scenario: Scenario, scenarios: Scenario[]): Scenario {
  if (scenario.type !== "linked_stress_test") return scenario;
  const base = scenario.baseScenarioId ? scenarios.find((s) => s.id === scenario.baseScenarioId) : undefined;
  if (!base) return scenario; // base findes ikke længere — fald tilbage til cache
  const keys = activeModifierKeys(scenario);
  const resolved = structuredClone(base);
  // Bevar identitet/metadata fra det linkede scenarie
  resolved.id = scenario.id;
  resolved.name = scenario.name;
  resolved.createdAt = scenario.createdAt;
  resolved.updatedAt = scenario.updatedAt;
  resolved.notes = scenario.notes;
  resolved.metadata = scenario.metadata;
  resolved.modifiers = scenario.modifiers;
  resolved.baseScenarioId = scenario.baseScenarioId;
  resolved.baseScenarioName = scenario.baseScenarioName ?? base.name;
  resolved.type = "linked_stress_test";
  resolved.manuallyEdited = false;
  for (const k of keys) {
    STRESS_TESTS.find((t) => t.key === k)?.apply(resolved);
  }
  return resolved;
}

/**
 * Klassificér et legacy-scenarie uden eksplicit `type`.
 * - Ingen modifiers → "base"
 * - Modifiers og inputs matcher base + modifiers → "linked_stress_test"
 * - Modifiers, men afviger på felter uden for modifier-whitelist → "custom" + manuallyEdited
 */
export function classifyLegacyScenario(scenario: Scenario, baseScenario: Scenario | undefined): {
  type: "base" | "linked_stress_test" | "custom";
  manuallyEdited: boolean;
} {
  const modKeys = activeModifierKeys(scenario);
  if (modKeys.length === 0) return { type: "base", manuallyEdited: false };
  if (!baseScenario) return { type: "custom", manuallyEdited: true };

  // Reproducér forventet linked-snapshot fra basen + modifiers
  const expected = structuredClone(baseScenario);
  for (const k of modKeys) STRESS_TESTS.find((t) => t.key === k)?.apply(expected);

  // Sammenlign relevante felter — hvis de matcher, er scenariet rent linket.
  const a = JSON.stringify({ inputs: scenario.inputs, override: scenario.assumptionsOverride ?? null });
  const b = JSON.stringify({ inputs: expected.inputs, override: expected.assumptionsOverride ?? null });
  if (a === b) return { type: "linked_stress_test", manuallyEdited: false };
  return { type: "custom", manuallyEdited: true };
}
