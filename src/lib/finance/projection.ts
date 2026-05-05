import {
  Assumptions,
  Bucket,
  DebtItem,
  Scenario,
  ScenarioInputs,
  YearRow,
} from "./types";
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
  buffer: number;
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

interface DebtTotals {
  privateInterest: number;
  privatePrincipal: number;
  privatePayment: number;
  holdingInterest: number;
  holdingPrincipal: number;
  holdingPayment: number;
  totalBalance: number;
}

function processDebts(debts: DebtItem[]): DebtTotals {
  const t: DebtTotals = {
    privateInterest: 0,
    privatePrincipal: 0,
    privatePayment: 0,
    holdingInterest: 0,
    holdingPrincipal: 0,
    holdingPayment: 0,
    totalBalance: 0,
  };
  for (const d of debts) {
    if (!d || d.balance <= 0) continue;
    const interest = d.balance * (d.interestRate ?? 0);
    const wantPay = (d.monthlyPayment ?? 0) * 12;
    const pay = d.impact === "risk_only" ? 0 : Math.min(d.balance + interest, wantPay);
    const principal = Math.max(0, pay - interest);
    d.balance = Math.max(0, d.balance + (d.impact === "risk_only" ? 0 : interest) - pay);
    if (d.impact === "private") {
      t.privateInterest += interest;
      t.privatePrincipal += principal;
      t.privatePayment += pay;
    } else if (d.impact === "holding") {
      t.holdingInterest += interest;
      t.holdingPrincipal += principal;
      t.holdingPayment += pay;
    }
    t.totalBalance += d.balance;
  }
  return t;
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

  // deep-clone debts so we don't mutate input
  const debts: DebtItem[] = (inp.debts ?? []).map((d) => ({ ...d }));

  const bal: Balances = {
    free: inp.free.balance,
    pension: inp.pension.balance,
    holding: inp.holding.balance,
    buffer: inp.free.cashBuffer ?? 0,
    debt: debts.reduce((s, d) => s + (d?.balance ?? 0), 0),
  };

  const totalYears = inp.person.lifeExpectancy - inp.person.currentAge + 1;

  for (let i = 0; i < totalYears; i++) {
    const age = inp.person.currentAge + i;
    const calYear = startYear + i;
    const opening = { ...bal };

    const working = age < stopAge;
    const pt = inp.income.partTime;
    const ptStart = Math.max(pt.fromAge, stopAge);
    const partTime = !working && age >= ptStart && age < pt.untilAge && age < inp.fullRetireAge;

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
    if (partTime) {
      if (pt.mode === "gross_annual" && pt.grossAnnual > 0) {
        const r = laborTax(pt.grossAnnual, a.tax);
        partTimeNet = r.net;
        laborTaxAmt += r.tax;
      } else if (pt.mode === "net_monthly" && pt.netMonthly > 0) {
        partTimeNet = pt.netMonthly * 12;
      }
    }

    const familyFundNet = age < inp.income.familyFundUntilAge ? inp.income.familyFundAnnualNet : 0;

    // Folkepension
    const sp = inp.income.statePension;
    let statePensionNet = 0;
    let statePensionGross = 0;
    let statePensionTax = 0;
    if (age >= sp.fromAge) {
      if (sp.mode === "manualNet") {
        statePensionNet = sp.manualNetAnnual;
      } else if (sp.mode === "baseOnly") {
        statePensionGross = sp.baseGrossAnnual;
        statePensionTax = statePensionGross * sp.effectiveTaxRate;
        statePensionNet = statePensionGross - statePensionTax;
      }
      // mode === "none" → 0
    }

    // Holding-exit (tilføjes saldo før vækst)
    if (inp.holding.exitYear === calYear && inp.holding.expectedExitValue > 0) {
      bal.holding += inp.holding.expectedExitValue;
    }

    // Planlagt holding-udlodning – kun hvis alder ≥ udlodningsalder
    const distFromAge = inp.holding.startDistributionAtStopAge
      ? stopAge
      : inp.holding.distributionFromAge;
    let holdingDistGross = 0;
    let holdingDistNet = 0;
    let holdingDistTax = 0;
    if (inp.holding.annualDistribution > 0 && bal.holding > 0 && age >= distFromAge) {
      holdingDistGross = Math.min(bal.holding, inp.holding.annualDistribution);
      const r = shareTax(holdingDistGross, a.tax);
      holdingDistNet = r.net;
      holdingDistTax = r.tax;
      bal.holding -= holdingDistGross;
    }

    // Gæld – behandl alle poster
    const dt = processDebts(debts);
    bal.debt = dt.totalBalance;
    // Holdinggæld trækkes fra holding-saldo
    bal.holding = Math.max(0, bal.holding - dt.holdingPayment);

    const spending = inp.spending.desiredMonthlyNet * 12;
    const incomeNet = salaryNet + partTimeNet + familyFundNet + statePensionNet + holdingDistNet;
    const cashflow = incomeNet - dt.privatePayment - spending;

    // ---- Opsparing / udtræk ----
    let freeContribution = 0;
    let bufferContribution = 0;
    const withdrawals = { free: 0, pension: 0, holding: 0, buffer: 0 };
    const withdrawalsGross = { free: 0, pension: 0, holding: 0, buffer: 0 };
    let pensionPayoutNet = 0;
    let cashflowSurplus = 0;

    const baseOrder = a.withdrawOrder.filter((b) => b !== "holding" || age >= distFromAge);
    const drainShortfall = (needed: number) => {
      // Først ordinære buckets
      for (const b of baseOrder) {
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
      // Buffer som sidste udvej hvis tilladt
      if (needed > 0 && inp.free.bufferUsableForShortfall && bal.buffer > 0) {
        const take = Math.min(bal.buffer, needed);
        bal.buffer -= take;
        withdrawals.buffer += take;
        withdrawalsGross.buffer += take;
        needed -= take;
      }
    };

    if (working) {
      const planned = inp.free.monthlyContribution * 12 + inp.free.annualExtraContribution;
      cashflowSurplus = cashflow - planned;
      if (savingsLogic === "cashflow") {
        if (cashflow >= 0) {
          freeContribution = cashflow;
          bal.free += freeContribution;
        } else drainShortfall(-cashflow);
      } else if (savingsLogic === "planned") {
        freeContribution = Math.max(0, Math.min(planned, Math.max(0, cashflow)));
        bal.free += freeContribution;
      } else {
        freeContribution = planned;
        bal.free += freeContribution;
        const net = cashflow - planned;
        if (net < 0) drainShortfall(-net);
      }
    } else {
      if (cashflow >= 0) {
        freeContribution = cashflow;
        bal.free += freeContribution;
      } else {
        drainShortfall(-cashflow);
      }
    }

    if (working) bal.pension += ownPensionContribution + employerPension;

    const required = spending + dt.privatePayment;
    const provided =
      incomeNet + withdrawals.free + withdrawals.pension + withdrawals.holding + withdrawals.buffer;
    const stillShort = Math.max(0, required - provided);

    // Vækst (realafkast) — buffer får intet afkast
    const growth = {
      free: bal.free * a.realReturn.free,
      pension: bal.pension * a.realReturn.pension,
      holding: bal.holding * a.realReturn.holding,
    };
    bal.free += growth.free;
    bal.pension += growth.pension;
    bal.holding += growth.holding;

    const closing = { ...bal };
    const netWorth = closing.free + closing.pension + closing.holding + closing.buffer - closing.debt;

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
        statePensionGross,
        statePensionTax,
        holdingDistributionNet: holdingDistNet,
        pensionPayoutNet,
        employerPensionContribution: employerPension,
        ownPensionContribution,
        freeContribution,
        bufferContribution,
        spending,
        taxes: laborTaxAmt + holdingDistTax + statePensionTax,
        debtInterest: dt.privateInterest + dt.holdingInterest,
        debtPrincipal: dt.privatePrincipal + dt.holdingPrincipal,
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

/** Tidligste stopalder uden shortfall og med min nettoformue ved slutalder. */
export function findEarliestSustainableStopAge(
  scenario: Scenario,
  globalAssumptions: Assumptions,
): number | null {
  const a = mergeAssumptions(globalAssumptions, scenario.assumptionsOverride);
  const inp = scenario.inputs;
  const minRequired = inp.target?.minNetWorthAtEnd ?? 0;
  const minAge = Math.max(inp.person.currentAge, 40);
  const maxAge = Math.min(inp.person.lifeExpectancy, 75);
  for (let age = minAge; age <= maxAge; age++) {
    const ys = projectWithStopAge(inp, a, age);
    const noShort = !ys.some((y) => y.shortfall);
    const endNW = ys[ys.length - 1].netWorth;
    if (noShort && endNW >= minRequired) return age;
  }
  return null;
}
