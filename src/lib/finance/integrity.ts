import { Scenario, YearRow } from "./types";

/**
 * Interne integritets-/sanity-checks for én projektion.
 * Bruges primært i tests og i debug/audit. Påvirker IKKE beregningen.
 *
 * Returnerer en liste af fejlbeskeder. Tom liste => modellen er konsistent.
 */
export function runIntegrityChecks(scenario: Scenario, years: YearRow[]): string[] {
  const errors: string[] = [];
  if (!Array.isArray(years) || years.length === 0) {
    errors.push("projection: ingen år genereret");
    return errors;
  }

  const isFiniteNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

  for (const y of years) {
    const tag = `år@alder=${y.age}`;
    const numericFields: Array<[string, number | undefined]> = [
      ["netWorth", y.netWorth],
      ["totalIncomeNet", y.totalIncomeNet],
      ["closing.free", y.closing?.free],
      ["closing.pension", y.closing?.pension],
      ["closing.holding", y.closing?.holding],
      ["closing.debt", y.closing?.debt],
      ["closing.buffer", y.closing?.buffer],
      ["flows.spending", y.flows?.spending],
      ["flows.cashflowSurplus", y.flows?.cashflowSurplus],
      ["flows.unallocatedCashflow", y.flows?.unallocatedCashflow],
      ["flows.investedAmount", y.flows?.investedAmount],
      ["flows.freeContribution", y.flows?.freeContribution],
      ["flows.pensionPayoutNet", y.flows?.pensionPayoutNet],
      ["flows.holdingDistributionNet", y.flows?.holdingDistributionNet],
    ];
    for (const [name, v] of numericFields) {
      if (!isFiniteNum(v)) errors.push(`${tag}: ${name} er ikke et endeligt tal (${String(v)})`);
    }

    // Saldi må ikke være negative (gæld håndteres som positiv balance i debt-feltet)
    if (isFiniteNum(y.closing?.free) && y.closing.free < -0.5) errors.push(`${tag}: closing.free negativ (${y.closing.free})`);
    if (isFiniteNum(y.closing?.pension) && y.closing.pension < -0.5) errors.push(`${tag}: closing.pension negativ (${y.closing.pension})`);
    if (isFiniteNum(y.closing?.holding) && y.closing.holding < -0.5) errors.push(`${tag}: closing.holding negativ (${y.closing.holding})`);

    // Ikke-allokeret cashflow må ikke være negativt
    if (isFiniteNum(y.flows?.unallocatedCashflow) && y.flows.unallocatedCashflow < -0.5) {
      errors.push(`${tag}: unallocatedCashflow negativ (${y.flows.unallocatedCashflow})`);
    }

    // Faktisk investeret beløb og freeContribution skal stemme
    if (isFiniteNum(y.flows?.investedAmount) && isFiniteNum(y.flows?.freeContribution)) {
      if (Math.abs(y.flows.investedAmount - y.flows.freeContribution) > 1) {
        errors.push(`${tag}: investedAmount (${y.flows.investedAmount}) ≠ freeContribution (${y.flows.freeContribution})`);
      }
    }

    // Pensionsudbetaling: rate + livrente + extra ≈ pensionPayoutNet
    const f = y.flows;
    if (f) {
      const expected = (f.ratePension?.net ?? 0) + (f.lifeAnnuity?.net ?? 0) + (f.pensionExtra?.net ?? 0);
      if (Math.abs(expected - (f.pensionPayoutNet ?? 0)) > 1) {
        errors.push(`${tag}: pensionPayoutNet (${f.pensionPayoutNet}) ≠ rate+livrente+extra (${expected})`);
      }
      // Holdingudlodning netto = planned + extra (netto)
      const distExpected = (f.holdingPlanned?.net ?? 0) + (f.holdingExtra?.net ?? 0);
      if (Math.abs(distExpected - (f.holdingDistributionNet ?? 0)) > 1) {
        errors.push(`${tag}: holdingDistributionNet (${f.holdingDistributionNet}) ≠ planned+extra (${distExpected})`);
      }
    }
  }

  // Scenarie-modifier konsistens: hvis modifiers er sat, skal mindst én være true
  if (scenario.modifiers && Object.keys(scenario.modifiers).length > 0) {
    const anyOn = Object.values(scenario.modifiers).some(Boolean);
    if (!anyOn && (scenario.baseScenarioId || scenario.baseScenarioName)) {
      errors.push("scenario: modifiers-objekt findes men ingen modifier er aktiv");
    }
  }

  return errors;
}
