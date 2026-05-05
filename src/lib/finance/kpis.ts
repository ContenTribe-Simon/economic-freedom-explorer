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

  // ---- Finansiel robusthed ----
  const noShortfall = !firstShort;
  const positiveAt95 = yAt95.netWorth > 0;
  const annualSpend = scenario.inputs.spending.desiredMonthlyNet * 12;
  const buffer = Math.max(0, Math.min(1, yAt95.netWorth / Math.max(1, annualSpend * 10)));
  const financial = Math.round((noShortfall ? 40 : 0) + (positiveAt95 ? 30 : 0) + buffer * 30);

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
    robustnessScore: financial,
    minNetWorthAtEnd: minRequired,
  };
}
