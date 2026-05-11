import { Assumptions, Scenario, Snapshot, MODEL_RELEASE, MODEL_VERSION } from "./types";
import { resolveScenario } from "./stress";
import { project } from "./projection";
import { deriveKPIs } from "./kpis";
import { sanityChecks } from "./sanity";
import type { CountryProfile } from "./country";

const id = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);

/**
 * Byg et frosset snapshot ud fra et aktivt scenarie + assumptions.
 *
 * Linked stress-tests materialiseres som resolved data, så snapshottet er
 * uafhængigt af senere ændringer i basecase eller scenario-listen.
 */
export function buildSnapshot(
  scenario: Scenario,
  scenarios: Scenario[],
  assumptions: Assumptions,
  options: { name?: string; notes?: string; countryProfiles?: CountryProfile[] } = {},
): Snapshot {
  const resolved = resolveScenario(scenario, scenarios);
  const years = project(resolved, assumptions);
  const kpis = deriveKPIs(resolved, years, assumptions);
  const checks = sanityChecks(resolved, years);
  const chartData = years.map((y) => ({
    age: y.age,
    Fri: Math.round(y.closing.free),
    Buffer: Math.round(y.closing.buffer),
    Pension: Math.round(y.closing.pension),
    Holding: Math.round(y.closing.holding),
    Nettoformue: Math.round(y.netWorth),
  }));
  const now = Date.now();
  const defaultName =
    options.name?.trim() ||
    `${scenario.name} – ${new Date(now).toLocaleString("da-DK", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}`;

  // Dyb klon for at sikre at snapshot ikke deler referencer med live state
  const snap: Snapshot = structuredClone({
    snapshotId: id(),
    snapshotName: defaultName,
    createdAt: now,
    updatedAt: now,
    modelVersion: MODEL_VERSION,
    modelRelease: MODEL_RELEASE,

    scenarioId: scenario.id,
    scenarioName: scenario.name,
    scenarioType: scenario.type ?? "custom",
    baseScenarioId: scenario.baseScenarioId,
    baseScenarioName: scenario.baseScenarioName,
    modifiers: scenario.modifiers,
    manuallyEdited: scenario.manuallyEdited,

    resolvedInputs: resolved.inputs,
    assumptionsOverride: scenario.assumptionsOverride,
    assumptions,

    kpis,
    sanityChecks: checks,
    years,
    chartData,

    notes: options.notes,
    metadata: {},
    countryProfiles: options.countryProfiles ?? [],
  });
  return snap;
}
