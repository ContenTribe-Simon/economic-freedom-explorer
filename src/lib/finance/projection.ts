import { Assumptions, Bucket, Scenario, YearRow } from "./types";
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
): { netCovered: number; gross: number; tax: number; withdrawn: number } {
  if (netNeeded <= 0) return { netCovered: 0, gross: 0, tax: 0, withdrawn: 0 };
  if (bucket === "free") {
    const take = Math.min(bal.free, netNeeded);
    bal.free -= take;
    return { netCovered: take, gross: take, tax: 0, withdrawn: take };
  }
  if (bucket === "holding") {
    const grossNeeded = grossHoldingForNet(netNeeded, a.tax);
    const take = Math.min(bal.holding, grossNeeded);
    const { net, tax } = shareTax(take, a.tax);
    bal.holding -= take;
    return { netCovered: net, gross: take, tax, withdrawn: take };
  }
  // pension
  const grossNeeded = grossPensionForNet(netNeeded, a.tax);
  const take = Math.min(bal.pension, grossNeeded);
  const { net, tax } = pensionPayoutTax(take, a.tax);
  bal.pension -= take;
  return { netCovered: net, gross: take, tax, withdrawn: take };
}

export function project(scenario: Scenario, globalAssumptions: Assumptions): YearRow[] {
  const a = mergeAssumptions(globalAssumptions, scenario.assumptionsOverride);
  const inp = scenario.inputs;
  const startYear = new Date().getFullYear();
  const years: YearRow[] = [];

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

    const working = age < inp.stopAge;
    const partTime = age >= inp.partTimeFromAgeOrStop(inp) && age < inp.partTimeUntilAge && !working;

    // --- Income ---
    let salaryGross = 0;
    let salaryNet = 0;
    let laborTaxAmt = 0;
    let employerPension = 0;
    let ownPensionContribution = 0;

    if (working) {
      salaryGross = inp.income.salaryGross;
      const r = laborTax(Math.max(0, salaryGross - inp.pension.monthlyContribution * 12), a.tax);
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

    // Planned holding distribution (taxed as share income)
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

    // Planned pension payout (after fullRetireAge, simple flat: cover gap; handled below via withdrawOrder)
    let pensionPayoutNet = 0;

    // Holding exit (adds to holding before growth; net of corp tax assumption already)
    if (inp.holding.exitYear === calYear && inp.holding.expectedExitValue > 0) {
      bal.holding += inp.holding.expectedExitValue;
    }

    // Debt servicing
    const debtInterest = bal.debt * inp.debt.interestRate;
    const yearlyDebtPayment = Math.min(bal.debt + debtInterest, inp.debt.monthlyPayment * 12);
    const debtPrincipal = Math.max(0, yearlyDebtPayment - debtInterest);
    bal.debt = Math.max(0, bal.debt + debtInterest - yearlyDebtPayment);

    // Spending (real DKK)
    const spending = inp.spending.desiredMonthlyNet * 12;

    // Cashflow: income net minus debt payment minus spending
    const incomeNet = salaryNet + partTimeNet + familyFundNet + statePensionNet + holdingDistNet;
    let cashflow = incomeNet - yearlyDebtPayment - spending;

    let freeContribution = 0;
    const withdrawn = { free: 0, pension: 0, holding: 0 };

    if (cashflow >= 0) {
      // Surplus: contribute to free, plus planned recurring contributions while working
      let surplus = cashflow;
      if (working) {
        // monthlyContribution to free
        const planned = inp.free.monthlyContribution * 12 + inp.free.annualExtraContribution;
        const actuallyContrib = Math.min(surplus, planned);
        freeContribution += actuallyContrib;
        surplus -= actuallyContrib;
      }
      freeContribution += surplus;
      bal.free += freeContribution;
    } else {
      // Shortfall: withdraw per priority
      let needed = -cashflow;
      const order = a.withdrawOrder;
      for (const b of order) {
        if (needed <= 0) break;
        const r = withdrawFromBucket(b, needed, bal, a);
        withdrawn[b] += r.withdrawn;
        needed -= r.netCovered;
        if (b === "pension") pensionPayoutNet += r.netCovered;
        if (b === "holding") holdingDistNet += r.netCovered, (holdingDistTax += r.tax);
      }
    }

    // Add own pension contribution to pension bucket (pre-growth)
    if (working) {
      bal.pension += ownPensionContribution + employerPension;
    }

    const shortfallAmount = cashflow < 0 ? Math.max(0, -cashflow - (incomeNet - yearlyDebtPayment - spending + (cashflow))) : 0; // recompute below
    // Recompute shortfall properly: did we cover spending?
    const totalAvailableNet =
      incomeNet + withdrawn.free + (withdrawn.pension > 0 ? pensionPayoutTax(withdrawn.pension, a.tax).net : 0) + (withdrawn.holding > 0 ? shareTax(withdrawn.holding, a.tax).net : 0);
    // Simplify shortfall: if needed > 0 still after withdrawals
    const stillShort = cashflow < 0 ? Math.max(0, -cashflow - (withdrawn.free + (withdrawn.pension ? pensionPayoutTax(withdrawn.pension, a.tax).net : 0) + (withdrawn.holding ? shareTax(withdrawn.holding, a.tax).net : 0))) : 0;

    // Growth (real return)
    bal.free *= 1 + a.realReturn.free;
    bal.pension *= 1 + a.realReturn.pension;
    bal.holding *= 1 + a.realReturn.holding;

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
        withdrawals: withdrawn,
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
