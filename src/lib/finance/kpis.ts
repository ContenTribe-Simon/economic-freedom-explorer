import { KPIs, Scenario, YearRow } from "./types";
import { findEarliestSustainableStopAge } from "./projection";
import { defaultAssumptions } from "./defaults";
import { Assumptions } from "./types";

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

  const noShortfall = !firstShort;
  const positiveAt95 = yAt95.netWorth > 0;
  const annualSpend = scenario.inputs.spending.desiredMonthlyNet * 12;
  const buffer = Math.max(0, Math.min(1, yAt95.netWorth / (annualSpend * 10)));
  const robustness = Math.round((noShortfall ? 40 : 0) + (positiveAt95 ? 30 : 0) + buffer * 30);

  return {
    plannedStopAge: stopAge,
    earliestSustainableStopAge: earliest,
    capitalAtStopAge: yAtStop?.netWorth ?? 0,
    capitalAt65: yAt65?.netWorth ?? 0,
    capitalAt95: yAt95.netWorth,
    firstShortfallAge: firstShort?.age ?? null,
    monthlyGapAfterStop: avgGap,
    robustnessScore: robustness,
  };
}
