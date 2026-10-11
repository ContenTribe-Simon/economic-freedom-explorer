import type { ScenarioInputs } from "./types";

/**
 * Holding til/fra (avanceret app). Holding er det særlige ved modellen, men de fleste har ingen,
 * så den kan slås fra. Slået fra regner motoren som om der ingen holding er; de indtastede tal
 * bliver liggende i inputs, så de er der igen, hvis brugeren slår den til.
 *
 * Alt der regner (projection, FIRE-analyse, KPI'er, sanity-tjek) læser inputs gennem
 * `withHoldingToggleApplied`, så "slået fra" betyder det samme overalt.
 */

/** Mangler feltet (modeller fra før kontakten), er holding slået til som hidtil. */
export function isHoldingEnabled(inp: ScenarioInputs): boolean {
  return inp.holding?.enabled !== false;
}

/**
 * Inputs som motoren skal se dem. Slået til (eller felt mangler): de samme inputs, uændret
 * objekt. Slået fra: en kopi uden holdingkapital, exit og udlodning, uden gæld der belaster
 * holdingen (og hæftelser koblet til den), og uden livsbegivenheder der rammer holdingen.
 */
export function withHoldingToggleApplied(inp: ScenarioInputs): ScenarioInputs {
  if (isHoldingEnabled(inp)) return inp;
  const droppedDebtIds = new Set(
    (inp.debts ?? []).filter((d) => d.kind === "holding" || d.impact === "holding").map((d) => d.id),
  );
  return {
    ...inp,
    holding: { ...inp.holding, balance: 0, expectedExitValue: 0, annualDistribution: 0 },
    debts: (inp.debts ?? []).filter(
      (d) => !droppedDebtIds.has(d.id) && !(d.linkedDebtId && droppedDebtIds.has(d.linkedDebtId)),
    ),
    lifeEvents: inp.lifeEvents?.filter(
      (e) => e.effectTarget !== "holdingCapital" && e.effectTarget !== "holdingCashflow",
    ),
  };
}
