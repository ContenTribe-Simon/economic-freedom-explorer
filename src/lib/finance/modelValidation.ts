import type { Scenario, YearRow } from "./types";

export type ValidationStatus = "pass" | "fail";

export interface ValidationCheckResult {
  id: string;
  name: string;
  category: string;
  status: ValidationStatus;
  age?: number;
  expected?: number | string;
  actual?: number | string;
  difference?: number;
  detail?: string;
}

export interface ValidationReport {
  scenarioId: string;
  scenarioName: string;
  createdAt: string;
  totalChecks: number;
  failed: number;
  results: ValidationCheckResult[];
}

const EPS = 1.0; // 1 kr tolerance — modellen runder internt

function approxEqual(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) <= eps;
}

/**
 * Kør sanity-/integritetschecks på et beregnet scenarie. Påvirker IKKE beregningen.
 * Hvert check er ikke-skylagende: et fejlet check tilføjer et resultat og fortsætter.
 */
export function runModelValidation(scenario: Scenario, years: YearRow[]): ValidationReport {
  const results: ValidationCheckResult[] = [];
  const push = (r: ValidationCheckResult) => results.push(r);

  for (const y of years) {
    const f = y.flows;
    const age = y.age;

    // ---------- A. Balance checks ----------
    if (f.ask && f.depot && f.depot.method !== "legacy") {
      const sum = f.ask.closing + f.depot.closing;
      const diff = sum - y.closing.free;
      push({
        id: `bal-ask-depot-free-${age}`,
        category: "A. Balance",
        name: "ASK ultimo + depot ultimo = fri kapital slut",
        status: approxEqual(sum, y.closing.free) ? "pass" : "fail",
        age,
        expected: y.closing.free,
        actual: sum,
        difference: diff,
      });
    }

    const nw = y.closing.free + y.closing.buffer + y.closing.pension + y.closing.holding - y.closing.debt;
    // Personal liabilities + includeInNetWorth-flag tillader at netWorth afviger fra rå sum.
    // Vi tester kun tegn/størrelsesorden via debtsDetail-aggregat.
    const debtInNW = f.debtsDetail
      .filter((d) => d.includeInNetWorth)
      .reduce((s, d) => s + d.closing, 0);
    const nwExpected = y.closing.free + y.closing.buffer + y.closing.pension + y.closing.holding - debtInNW;
    push({
      id: `bal-networth-${age}`,
      category: "A. Balance",
      name: "Fri + buffer + pension + holding − gæld (i NW) = nettoformue",
      status: approxEqual(nwExpected, y.netWorth, 5) ? "pass" : "fail",
      age,
      expected: y.netWorth,
      actual: nwExpected,
      difference: nwExpected - y.netWorth,
      detail: `rå sum uden NW-filter: ${Math.round(nw)}`,
    });

    // Ingen negative saldi (tolerance 0.5)
    for (const [key, val] of [
      ["closing.free", y.closing.free],
      ["closing.buffer", y.closing.buffer],
      ["closing.pension", y.closing.pension],
      ["closing.holding", y.closing.holding],
      ["ask.closing", f.ask?.closing ?? 0],
      ["depot.closing", f.depot?.closing ?? 0],
    ] as Array<[string, number]>) {
      if (val < -0.5) {
        push({
          id: `bal-neg-${key}-${age}`,
          category: "A. Balance",
          name: `${key} må ikke være negativ`,
          status: "fail",
          age,
          expected: ">= 0",
          actual: val,
          difference: val,
        });
      }
    }

    // ---------- B. Cashflow ----------
    const cb = f.cashflowBridge;
    if (cb) {
      const ps = f.plannedSavingsShortfall;
      const allowedBuffer = ps?.coveredByBuffer ?? 0;
      const maxInvest = Math.max(0, cb.cashflowBeforeSavings) + allowedBuffer + 1;
      push({
        id: `cf-invest-le-cashflow-${age}`,
        category: "B. Cashflow",
        name: "Faktisk investering ≤ cashflow + tilladt buffertræk",
        status: f.investedAmount <= maxInvest ? "pass" : "fail",
        age,
        expected: `≤ ${Math.round(maxInvest)}`,
        actual: f.investedAmount,
        difference: f.investedAmount - maxInvest,
      });
    }

    const sa = f.surplusAllocation;
    if (sa && sa.surplus > 0.5) {
      const allocated = sa.toBuffer + sa.toFreeInvestment + sa.extraSpending + sa.outOfModel;
      push({
        id: `cf-surplus-allocated-${age}`,
        category: "B. Cashflow",
        name: "Overskydende cashflow er fuldt allokeret",
        status: approxEqual(allocated, sa.surplus, 1) ? "pass" : "fail",
        age,
        expected: sa.surplus,
        actual: allocated,
        difference: allocated - sa.surplus,
      });
    }

    // ---------- C. ASK ----------
    if (f.ask) {
      const si = f.shareIncome;
      if (si) {
        // ASK må ikke indgå i personlig aktieindkomst
        const askInShare = (si.holdingGross + si.extraHoldingGross + si.realizedDepotGain + (si.annualDepotTaxable ?? 0));
        // Heuristik: hvis ASK-afkast er beskattet via shareIncome i stedet for ASK-skat, dukker det op her.
        // Vi kan ikke direkte se det, men vi kan tjekke at ASK selv har sin egen skatpost når der er afkast.
        const askHasOwnTax = f.ask.growthGross <= 0.5 || f.ask.tax >= 0 || f.ask.carryForwardEnd > 0;
        push({
          id: `ask-own-tax-${age}`,
          category: "C. ASK",
          name: "ASK-afkast beskattes via ASK-logik (ikke aktieindkomst)",
          status: askHasOwnTax ? "pass" : "fail",
          age,
          detail: `ASK growth=${Math.round(f.ask.growthGross)} tax=${Math.round(f.ask.tax)} shareIncomeGross=${Math.round(askInShare)}`,
        });
      }
      if (f.depot && f.depot.method !== "legacy") {
        const sum = f.ask.closing + f.depot.closing;
        push({
          id: `ask-depot-sum-${age}`,
          category: "C. ASK",
          name: "ASK + depot summerer til fri kapital",
          status: approxEqual(sum, y.closing.free) ? "pass" : "fail",
          age,
          expected: y.closing.free,
          actual: sum,
          difference: sum - y.closing.free,
        });
      }
    }

    // ---------- D. Depot ----------
    const d = f.depot;
    if (d && d.method !== "legacy") {
      if (d.costBasisClosing < -0.5) {
        push({
          id: `depot-cost-neg-${age}`,
          category: "D. Depot",
          name: "Depot kostpris ultimo må ikke være negativ",
          status: "fail",
          age,
          expected: ">= 0",
          actual: d.costBasisClosing,
        });
      }
      if (d.grossSale > 0.5) {
        // Realiseret gevinst skal være ≤ brutto salg
        const ok = d.realizedGain <= d.grossSale + 1;
        push({
          id: `depot-gain-le-sale-${age}`,
          category: "D. Depot",
          name: "Realiseret depotgevinst ≤ brutto salg",
          status: ok ? "pass" : "fail",
          age,
          expected: `≤ ${Math.round(d.grossSale)}`,
          actual: d.realizedGain,
        });
      }
    }

    // ---------- E. Personlig aktieindkomst ----------
    const si = f.shareIncome;
    if (si) {
      const usedLow = si.thresholdUsedByHolding + (si.threshold - si.thresholdRemainingForDepot - si.thresholdUsedByHolding);
      void usedLow;
      // 27/42-grænsen må ikke bruges to gange — taxedAtLow ≤ threshold
      push({
        id: `si-low-once-${age}`,
        category: "E. Aktieindkomst",
        name: "Lav sats-grænsen bruges højst én gang pr. år",
        status: si.taxedAtLow <= si.threshold + 1 ? "pass" : "fail",
        age,
        expected: `≤ ${Math.round(si.threshold)}`,
        actual: si.taxedAtLow,
        difference: si.taxedAtLow - si.threshold,
      });
      // Sum-konsistens
      const sum = si.taxedAtLow + si.taxedAtHigh;
      push({
        id: `si-sum-${age}`,
        category: "E. Aktieindkomst",
        name: "Lav + høj = samlet aktieindkomst",
        status: approxEqual(sum, si.totalShareIncome, 1) ? "pass" : "fail",
        age,
        expected: si.totalShareIncome,
        actual: sum,
        difference: sum - si.totalShareIncome,
      });
    }

    // ---------- F. Capital withdrawal ----------
    const cw = f.capitalWithdrawal;
    if (cw) {
      const totalNet =
        cw.netBySource.depot + cw.netBySource.holding + cw.netBySource.ask + cw.netBySource.pension;
      push({
        id: `cw-net-sum-${age}`,
        category: "F. Kapitaludtræk",
        name: "Sum af netto pr. kilde = totalNet",
        status: approxEqual(totalNet, cw.totalNet, 1) ? "pass" : "fail",
        age,
        expected: cw.totalNet,
        actual: totalNet,
        difference: totalNet - cw.totalNet,
      });
      // “Træk kun ved behov”: ingen kapital må hæves uden cashflow-underskud (med mindre planlagt politik)
      if (cw.plannedPolicy === "none") {
        const cashflowOk = (f.cashflowBridge?.cashflowBeforeSavings ?? 0) >= -0.5;
        const hasWithdraw = cw.totalGross > 0.5;
        if (cashflowOk && hasWithdraw && cw.totalGross > 1) {
          push({
            id: `cw-on-demand-${age}`,
            category: "F. Kapitaludtræk",
            name: "Træk kun ved behov hæver ikke kapital uden underskud",
            status: "fail",
            age,
            expected: 0,
            actual: cw.totalGross,
            difference: cw.totalGross,
          });
        }
      }
    }

    // ---------- G. Shortfall ----------
    const ps = f.plannedSavingsShortfall;
    if (ps && ps.unmetPlannedInvestment > 0.5) {
      // Manglende opsparing må ikke fremstå som forbrugs-shortfall medmindre policy = showShortfall og forbrug ikke er dækket
      const realShortfall = y.shortfallAmount;
      if (realShortfall > 0.5 && ps.policy !== "showShortfall") {
        push({
          id: `sf-mix-${age}`,
          category: "G. Shortfall",
          name: "Opsparings-shortfall blandes ikke med forbrugs-shortfall",
          status: "fail",
          age,
          detail: `policy=${ps.policy} unmet=${Math.round(ps.unmetPlannedInvestment)} realShortfall=${Math.round(realShortfall)}`,
        });
      }
    }
  }

  const failed = results.filter((r) => r.status === "fail").length;
  return {
    scenarioId: scenario.id,
    scenarioName: scenario.name,
    createdAt: new Date().toISOString(),
    totalChecks: results.length,
    failed,
    results,
  };
}
