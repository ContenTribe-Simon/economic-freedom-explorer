import { Assumptions, Bucket, Scenario, ScenarioInputs, YearRow } from "./types";
import {
  grossHoldingForNet,
  grossPensionForNet,
  laborTax,
  pensionPayoutTax,
  shareTax,
} from "./tax";

export function mergeAssumptions(global: Assumptions, override?: Partial<Assumptions>): Assumptions {
  if (!override) return global;
  return {
    ...global,
    ...override,
    realReturn: { ...global.realReturn, ...(override.realReturn ?? {}) },
    tax: { ...global.tax, ...(override.tax ?? {}) },
    withdrawOrder: override.withdrawOrder ?? global.withdrawOrder,
  };
}

interface Balances {
  free: number;
  pension: number;
  holding: number;
  debt: number;
}

function withdrawFromBucket(
  bucket: Bucket,
  netNeeded: number,
  bal: Balances,
  a: Assumptions,
): { netCovered: number; gross: number; tax: number } {
  if (netNeeded <= 0) return { netCovered: 0, gross: 0, tax: 0 };
  if (bucket === "free") {
    const take = Math.min(bal.free, netNeeded);
    bal.free -= take;
    return { netCovered: take, gross: take, tax: 0 };
  }
  if (bucket === "holding") {
    const grossNeeded = grossHoldingForNet(netNeeded, a.tax);
    const take = Math.min(bal.holding, grossNeeded);
    const { net, tax } = shareTax(take, a.tax);
    bal.holding -= take;
    return { netCovered: net, gross: take, tax };
  }
  const grossNeeded = grossPensionForNet(netNeeded, a.tax);
  const take = Math.min(bal.pension, grossNeeded);
  const { net, tax } = pensionPayoutTax(take, a.tax);
  bal.pension -= take;
  return { netCovered: net, gross: take, tax };
}

export function project(scenario: Scenario, globalAssumptions: Assumptions): YearRow[] {
  const a = mergeAssumptions(globalAssumptions, scenario.assumptionsOverride);
  return projectWithStopAge(scenario.inputs, a, scenario.inputs.stopAge);
}

export function projectWithStopAge(
  inp: ScenarioInputs,
  a: Assumptions,
  stopAge: number,
): YearRow[] {
  const startYear = new Date().getFullYear();
  const years: YearRow[] = [];
  const savingsLogic = inp.savingsLogic ?? "planned";

  const bal: Balances = {
    free: inp.free.balance,
    pension: inp.pension.balance,
    holding: inp.holding.balance,
    debt: inp.debt.balance,
  };

  const totalYears = inp.person.lifeExpectancy - inp.person.currentAge + 1;

  for (let i = 0; i < totalYears; i++) {
    const age = inp.person.currentAge + i;
    const calYear = startYear + i;
    const opening = { ...bal };

    const working = age < stopAge;
    const ptStart = Math.max(inp.income.partTimeFromAge, stopAge);
    const partTime =
      !working && age >= ptStart && age < inp.income.partTimeUntilAge && age < inp.fullRetireAge;

    // ---- Income ----
    let salaryGross = 0;
    let salaryNet = 0;
    let laborTaxAmt = 0;
    let employerPension = 0;
    let ownPensionContribution = 0;

    if (working) {
      salaryGross = inp.income.salaryGross;
      const taxableGross = Math.max(0, salaryGross - inp.pension.monthlyContribution * 12);
      const r = laborTax(taxableGross, a.tax);
      salaryNet = r.net;
      laborTaxAmt = r.tax;
      employerPension = inp.pension.employerContribution * 12;
      ownPensionContribution = inp.pension.monthlyContribution * 12;
    }

    let partTimeNet = 0;
    if (partTime && inp.income.partTimeAnnualGross > 0) {
      const r = laborTax(inp.income.partTimeAnnualGross, a.tax);
      partTimeNet = r.net;
      laborTaxAmt += r.tax;
    }

    const familyFundNet = age < inp.income.familyFundUntilAge ? inp.income.familyFundAnnualNet : 0;
    const statePensionNet = age >= inp.income.statePensionFromAge ? a.statePensionAnnualNet : 0;

    // Holding-exit (tilføjes saldo før vækst)
    if (inp.holding.exitYear === calYear && inp.holding.expectedExitValue > 0) {
      bal.holding += inp.holding.expectedExitValue;
    }

    // Planlagt holding-udlodning
    let holdingDistGross = 0;
    let holdingDistNet = 0;
    let holdingDistTax = 0;
    if (inp.holding.annualDistribution > 0 && bal.holding > 0) {
      holdingDistGross = Math.min(bal.holding, inp.holding.annualDistribution);
      const r = shareTax(holdingDistGross, a.tax);
      holdingDistNet = r.net;
      holdingDistTax = r.tax;
      bal.holding -= holdingDistGross;
    }

    // Gæld
    const debtInterest = bal.debt * inp.debt.interestRate;
    const yearlyDebtPayment = Math.min(bal.debt + debtInterest, inp.debt.monthlyPayment * 12);
    const debtPrincipal = Math.max(0, yearlyDebtPayment - debtInterest);
    bal.debt = Math.max(0, bal.debt + debtInterest - yearlyDebtPayment);

    const spending = inp.spending.desiredMonthlyNet * 12;
    const incomeNet = salaryNet + partTimeNet + familyFundNet + statePensionNet + holdingDistNet;

    // Cashflow før opsparing/udtræk
    const cashflow = incomeNet - yearlyDebtPayment - spending;

    // ---- Opsparing / udtræk efter logik ----
    let freeContribution = 0;
    const withdrawals = { free: 0, pension: 0, holding: 0 };
    const withdrawalsGross = { free: 0, pension: 0, holding: 0 };
    let pensionPayoutNet = 0;
    let cashflowSurplus = 0;

    if (working) {
      const planned = inp.free.monthlyContribution * 12 + inp.free.annualExtraContribution;
      cashflowSurplus = cashflow - planned;

      if (savingsLogic === "cashflow") {
        // Investér hele overskuddet, eller hæv hvis underskud
        if (cashflow >= 0) {
          freeContribution = cashflow;
          bal.free += freeContribution;
        } else {
          let needed = -cashflow;
          for (const b of a.withdrawOrder) {
            if (needed <= 0) break;
            const r = withdrawFromBucket(b, needed, bal, a);
            withdrawals[b] += r.netCovered;
            withdrawalsGross[b] += r.gross;
            if (b === "pension") pensionPayoutNet += r.netCovered;
            if (b === "holding") {
              holdingDistNet += r.netCovered;
              holdingDistGross += r.gross;
              holdingDistTax += r.tax;
            }
            needed -= r.netCovered;
          }
        }
      } else {
        // planned eller hybrid: brug planlagt opsparing
        // Hvis cashflow ikke kan dække planlagt → reducer til hvad der er råd til (planned mode),
        // eller behold planlagt og lad shortfall vise sig (hybrid)
        if (savingsLogic === "planned") {
          freeContribution = Math.max(0, Math.min(planned, Math.max(0, cashflow)));
          bal.free += freeContribution;
          // Resterende cashflow ignoreres (forbruges) – ingen dobbeltregning
        } else {
          // hybrid: træk altid planlagt, dæk underskud via udtræk
          freeContribution = planned;
          bal.free += freeContribution;
          const net = cashflow - planned;
          if (net < 0) {
            let needed = -net;
            for (const b of a.withdrawOrder) {
              if (needed <= 0) break;
              const r = withdrawFromBucket(b, needed, bal, a);
              withdrawals[b] += r.netCovered;
              withdrawalsGross[b] += r.gross;
              if (b === "pension") pensionPayoutNet += r.netCovered;
              if (b === "holding") {
                holdingDistNet += r.netCovered;
                holdingDistGross += r.gross;
                holdingDistTax += r.tax;
              }
              needed -= r.netCovered;
            }
          }
        }
      }
    } else {
      // Efter stopalder: dæk evt. underskud via prioriteret udtræk
      if (cashflow >= 0) {
        freeContribution = cashflow;
        bal.free += freeContribution;
      } else {
        let needed = -cashflow;
        for (const b of a.withdrawOrder) {
          if (needed <= 0) break;
          const r = withdrawFromBucket(b, needed, bal, a);
          withdrawals[b] += r.netCovered;
          withdrawalsGross[b] += r.gross;
          if (b === "pension") pensionPayoutNet += r.netCovered;
          if (b === "holding") {
            holdingDistNet += r.netCovered;
            holdingDistGross += r.gross;
            holdingDistTax += r.tax;
          }
          needed -= r.netCovered;
        }
      }
    }

    // Pensionsindbetalinger (efter cashflow-håndtering, før vækst)
    if (working) {
      bal.pension += ownPensionContribution + employerPension;
    }

    // Beregn faktisk shortfall: kunne vi dække forbrug + gæld?
    const totalNetCovered =
      incomeNet + withdrawals.free + withdrawals.pension + withdrawals.holding - holdingDistNet;
    // Note: holdingDistNet er allerede del af incomeNet, så vi trækker det fra for ikke at dobbelttælle
    const required = spending + yearlyDebtPayment;
    const provided = incomeNet + withdrawals.free + withdrawals.pension + (withdrawals.holding > 0 ? 0 : 0);
    // Forenklet: shortfall = manglende dækning efter alle udtræk
    const stillShort = Math.max(0, required - (incomeNet + withdrawals.free + withdrawals.pension + withdrawals.holding));

    // Vækst (realafkast)
    const growth = {
      free: bal.free * a.realReturn.free,
      pension: bal.pension * a.realReturn.pension,
      holding: bal.holding * a.realReturn.holding,
    };
    bal.free += growth.free;
    bal.pension += growth.pension;
    bal.holding += growth.holding;

    const closing = { ...bal };
    const netWorth = closing.free + closing.pension + closing.holding - closing.debt;

    years.push({
      age,
      yearIndex: i,
      opening,
      closing,
      flows: {
        salaryGross,
        salaryNet,
        partTimeNet,
        familyFundNet,
        statePensionNet,
        holdingDistributionNet: holdingDistNet,
        pensionPayoutNet,
        employerPensionContribution: employerPension,
        ownPensionContribution,
        freeContribution,
        spending,
        taxes: laborTaxAmt + holdingDistTax,
        debtInterest,
        debtPrincipal,
        withdrawals,
        withdrawalsGross,
        cashflowSurplus,
        growth,
      },
      totalIncomeNet: incomeNet,
      netWorth,
      shortfall: stillShort > 0.5,
      shortfallAmount: stillShort,
      monthlyGap: stillShort / 12,
    });
  }

  return years;
}

/** Find tidligste stopalder hvor scenariet kan gennemføres uden shortfall. */
export function findEarliestSustainableStopAge(
  scenario: Scenario,
  globalAssumptions: Assumptions,
): number | null {
  const a = mergeAssumptions(globalAssumptions, scenario.assumptionsOverride);
  const inp = scenario.inputs;
  const minAge = Math.max(inp.person.currentAge, 40);
  const maxAge = Math.min(inp.person.lifeExpectancy, 75);
  for (let age = minAge; age <= maxAge; age++) {
    const ys = projectWithStopAge(inp, a, age);
    if (!ys.some((y) => y.shortfall)) return age;
  }
  return null;
}
