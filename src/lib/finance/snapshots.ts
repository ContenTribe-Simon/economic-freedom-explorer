import { Assumptions, Scenario, Snapshot, MODEL_RELEASE, MODEL_VERSION } from "./types";
import { resolveScenario } from "./stress";
import { project } from "./projection";
import { deriveKPIs } from "./kpis";
import { sanityChecks } from "./sanity";
import type { CountryProfile, CountryAnalysisSettings } from "./country";

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
  options: { name?: string; notes?: string; countryProfiles?: CountryProfile[]; countryAnalysisSettings?: CountryAnalysisSettings } = {},
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
    countryAnalysisSettings: options.countryAnalysisSettings,
  });
  return snap;
}

/**
 * Normalisér et gemt snapshots slut-horisont-forankrede KPI-felter ud fra snapshottets EGNE
 * frosne YearRows (motor-anker-fixet: slutstørrelser læses fra sidste projicerede år, ikke fast
 * alder 95).
 *
 * Hvorfor: snapshots gemt FØR anker-fixet med lifeExpectancy > 95 har alder-95-værdien liggende
 * under `capitalAt95`, mens nye snapshots har slutalder-værdien under samme feltnavn —
 * sammenligningssiderne ville lydløst blande to forskellige størrelser under én label. Kører i
 * BÅDE persist-migrationen (v17) og importJson (som cloud-`loadModel()` også går igennem —
 * cloud-stien rammer aldrig persist-migrate).
 *
 * Bevidst KIRURGISK: der genberegnes INTET gennem motoren (et frosset snapshot må aldrig ændre
 * substans, og en re-projektion med nutidens motor kunne ændre alt). Kun de felter, hvis ANKER
 * var forkert, omlæses fra de frosne rækker:
 *  - capitalAt95 = sidste YearRows netWorth
 *  - endShortfallVsTarget = max(0, minNetWorthAtEnd - slutformue)
 *  - modelStatus: KUN valid <-> target_missed-aksen (invalid har sine egne årsager og røres
 *    ikke). Flippes der TIL target_missed, spejles motorens robusthedscap (<= 40, hårdere ved
 *    stort miss); flippes der til valid, står den frosne (konservative) score urørt.
 * Snapshots med horisont <= 95 er uændrede (det gamle fallback var allerede sidste række);
 * funktionen er idempotent og returnerer SAMME objekt når intet skal ændres.
 */
export function normalizeSnapshotEndAnchors(snap: Snapshot): Snapshot {
  const years = Array.isArray(snap?.years) ? snap.years : [];
  const kpis = snap?.kpis;
  if (years.length === 0 || !kpis) return snap;

  const endNW = years[years.length - 1].netWorth;
  const minRequired = kpis.minNetWorthAtEnd ?? 0;
  const endShortfall = Math.max(0, minRequired - endNW);

  const capitalChanged = Math.abs((kpis.capitalAt95 ?? 0) - endNW) > 0.005;
  const shortfallChanged = Math.abs((kpis.endShortfallVsTarget ?? 0) - endShortfall) > 0.005;
  if (!capitalChanged && !shortfallChanged) return snap;

  const next: Snapshot = structuredClone(snap);
  next.kpis.capitalAt95 = endNW;
  next.kpis.endShortfallVsTarget = endShortfall;

  if (next.kpis.modelStatus === "target_missed" && endShortfall <= 0.5) {
    next.kpis.modelStatus = "valid";
    next.kpis.modelStatusReason = "Scenariet er validt — ingen shortfall, ingen ufinansierede afdrag, mål opfyldt.";
  } else if (next.kpis.modelStatus === "valid" && endShortfall > 0.5) {
    next.kpis.modelStatus = "target_missed";
    next.kpis.modelStatusReason = `Scenariet er gyldigt, men minimumsmålet er ikke opfyldt — mangler ${Math.round(endShortfall).toLocaleString("da-DK")} kr ved slutalder.`;
    // Spejl motorens target-missed-cap, så status og score fortæller samme historie.
    const ratio = minRequired > 0 ? endShortfall / minRequired : 0;
    const cap = ratio > 0.5 ? 30 : ratio > 0.25 ? 35 : 40;
    next.kpis.financialRobustness = Math.min(next.kpis.financialRobustness, cap);
    next.kpis.robustnessScore = next.kpis.financialRobustness;
  }
  return next;
}
