import { Assumptions, KPIs, Scenario, YearRow } from "./types";
import { findEarliestSustainableStopAge, project, projectWithStopAge, mergeAssumptions } from "./projection";
import { defaultAssumptions } from "./defaults";

export function deriveKPIs(scenario: Scenario, years: YearRow[], assumptions: Assumptions = defaultAssumptions): KPIs {
  const stopAge = scenario.inputs.stopAge;
  const yAtStop = years.find((y) => y.age === stopAge);
  const yAt65 = years.find((y) => y.age === 65);
  const yAt95 = years.find((y) => y.age === 95) ?? years[years.length - 1];

  const firstShort = years.find((y) => y.shortfall);
  const afterStopYears = years.filter((y) => y.age >= stopAge);
  const avgGap =
    afterStopYears.length > 0
      ? afterStopYears.reduce((s, y) => s + y.monthlyGap, 0) / afterStopYears.length
      : 0;

  const earliest = findEarliestSustainableStopAge(scenario, assumptions);
  const minRequired = scenario.inputs.target?.minNetWorthAtEnd ?? 0;

  // ---- Finansiel robusthed (graduérbar) ----
  const annualSpend = Math.max(1, scenario.inputs.spending.desiredMonthlyNet * 12);
  let score = 100;

  // 1) Cashflow-shortfall: vægtes efter HVOR TIDLIGT det rammer ift. stop og levealder.
  if (firstShort) {
    const yearsAfterStop = firstShort.age - stopAge;
    const lifeRemainingAtShort = Math.max(1, scenario.inputs.person.lifeExpectancy - firstShort.age);
    if (yearsAfterStop < 0) {
      // shortfall FØR planlagt stop = kritisk
      score -= 70 + Math.min(15, -yearsAfterStop * 2);
    } else {
      // 0 år efter stop ≈ -55, 30 år efter stop ≈ -10
      score -= Math.max(10, 55 - yearsAfterStop * 1.5);
    }
    // ekstra straf hvis stort restliv ramt
    score -= Math.min(10, (lifeRemainingAtShort / 30) * 10);
  }

  // 2) Månedligt hul efter stop
  if (avgGap > 0) {
    score -= Math.min(20, (avgGap / 5000) * 20);
  }

  // 3) Slutformue vs. minimumskrav
  const endMargin = (yAt95.netWorth - minRequired) / Math.max(1, annualSpend * 5);
  if (endMargin < 0) score -= 25;
  else if (endMargin < 1) score -= Math.min(20, (1 - endMargin) * 20);
  else score += Math.min(8, (endMargin - 1) * 4); // bonus for buffer

  // 4) Afhængighed af holding/exit (andel af slutformue)
  const totalEndAssets = Math.max(1, yAt95.closing.free + yAt95.closing.pension + yAt95.closing.holding);
  const holdingShareEnd = yAt95.closing.holding / totalEndAssets;
  score -= Math.min(12, holdingShareEnd * 12);

  // 5) Afhængighed af deltid
  const ptYearsAll = years.filter((y) => y.flows.partTimeNet > 0);
  if (ptYearsAll.length > 0) {
    const avgPt = ptYearsAll.reduce((s, y) => s + y.flows.partTimeNet, 0) / ptYearsAll.length;
    score -= Math.min(8, (avgPt / annualSpend) * 8);
  }

  // 6) Afhængighed af folkepension
  const spInp = scenario.inputs.income.statePension;
  if (spInp.mode !== "none") {
    const spYearsAll = years.filter((y) => y.flows.statePensionNet > 0);
    if (spYearsAll.length > 0) {
      const avgSp = spYearsAll.reduce((s, y) => s + y.flows.statePensionNet, 0) / spYearsAll.length;
      score -= Math.min(8, (avgSp / annualSpend) * 8);
    }
  }

  const financial = Math.max(0, Math.min(100, Math.round(score)));

  // ---- Antagelsesrisiko ----
  const inp = scenario.inputs;
  const a = mergeAssumptions(assumptions, scenario.assumptionsOverride);
  let risk = 0;

  // Hvor meget af slutformuen kommer fra holding?
  const totalEnd = Math.max(1, yAt95.closing.free + yAt95.closing.pension + yAt95.closing.holding);
  const holdingShare = yAt95.closing.holding / totalEnd;
  const exitWeight = inp.holding.expectedExitValue / Math.max(1, inp.holding.balance + inp.holding.expectedExitValue);
  risk += Math.min(30, holdingShare * 25 + exitWeight * 10);

  // Folkepension: hvor stor andel af nettoindkomst efter stop?
  const sp = inp.income.statePension;
  if (sp.mode !== "none") {
    const spYears = years.filter((y) => y.age >= sp.fromAge && y.flows.statePensionNet > 0);
    if (spYears.length > 0) {
      const avgSp = spYears.reduce((s, y) => s + y.flows.statePensionNet, 0) / spYears.length;
      risk += Math.min(15, (avgSp / annualSpend) * 20);
    }
  }

  // Deltidsindtægt
  const ptYears = years.filter((y) => y.flows.partTimeNet > 0);
  if (ptYears.length > 0) {
    const avgPt = ptYears.reduce((s, y) => s + y.flows.partTimeNet, 0) / ptYears.length;
    risk += Math.min(15, (avgPt / annualSpend) * 15);
  }

  // Realafkast – jo højere antagelse, jo større risiko
  const avgReturn = (a.realReturn.free + a.realReturn.pension + a.realReturn.holding) / 3;
  risk += Math.max(0, Math.min(20, (avgReturn - 0.03) * 400)); // 3 % = 0, 8 % = 20

  // Margin ved slutalder ift. minimum
  const margin = (yAt95.netWorth - minRequired) / Math.max(1, annualSpend * 5);
  if (margin < 1) risk += Math.min(20, (1 - margin) * 20);

  const assumptionRisk = Math.round(Math.max(0, Math.min(100, risk)));

  const endShortfallVsTarget = Math.max(0, minRequired - yAt95.netWorth);

  // ---- Holdinggæld finansiering ----
  let unfinancedHoldingDebt = 0;
  let unfinancedHoldingYears = 0;
  for (const y of years) {
    const s = y.flows.holdingFinancingShortfall ?? 0;
    if (s > 0.5) {
      unfinancedHoldingDebt += s;
      unfinancedHoldingYears++;
    }
  }

  // ---- Model status ----
  let modelStatus: "valid" | "target_missed" | "invalid" = "valid";
  let modelStatusReason = "Scenariet er validt — ingen shortfall, ingen ufinansierede afdrag, mål opfyldt.";
  if (unfinancedHoldingDebt > 0.5 || firstShort) {
    modelStatus = "invalid";
    const reasons: string[] = [];
    if (firstShort) reasons.push(`cashflow-shortfall fra alder ${firstShort.age}`);
    if (unfinancedHoldingDebt > 0.5) reasons.push(`ufinansieret holdinggæld i ${unfinancedHoldingYears} år (${Math.round(unfinancedHoldingDebt).toLocaleString("da-DK")} kr)`);
    modelStatusReason = `Scenariet har ugyldige antagelser eller ufinansierede betalinger: ${reasons.join("; ")}.`;
  } else if (endShortfallVsTarget > 0.5) {
    modelStatus = "target_missed";
    modelStatusReason = `Scenariet holder, men minimumsmål er ikke opfyldt — mangler ${Math.round(endShortfallVsTarget).toLocaleString("da-DK")} kr ved slutalder.`;
  }

  return {
    plannedStopAge: stopAge,
    earliestSustainableStopAge: earliest,
    capitalAtStopAge: yAtStop?.netWorth ?? 0,
    capitalAt65: yAt65?.netWorth ?? 0,
    capitalAt95: yAt95.netWorth,
    firstShortfallAge: firstShort?.age ?? null,
    monthlyGapAfterStop: avgGap,
    financialRobustness: financial,
    assumptionRisk,
    assumptionConfidence: 100 - assumptionRisk,
    robustnessScore: financial,
    minNetWorthAtEnd: minRequired,
    endShortfallVsTarget,
    unfinancedHoldingDebt,
    unfinancedHoldingYears,
    modelStatus,
    modelStatusReason,
  };
}
