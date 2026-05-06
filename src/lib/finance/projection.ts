import {
  Assumptions,
  Bucket,
  DebtItem,
  DebtYearDetail,
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
  /** Betalinger der sker uden for modellen (ekstern selskabscashflow). */
  externalPayment: number;
  /** Saldo der tæller med i nettoformuen. */
  totalBalanceNW: number;
  /** Holding-shortfall: forsøgt afdrag mod tom holdingkapital. */
  holdingFinancingShortfall: number;
  detail: DebtYearDetail[];
}

function processDebts(
  debts: DebtItem[],
  holdingBalance: number,
  calYear: number,
  exitYear: number,
): DebtTotals {
  const t: DebtTotals = {
    privateInterest: 0,
    privatePrincipal: 0,
    privatePayment: 0,
    holdingInterest: 0,
    holdingPrincipal: 0,
    holdingPayment: 0,
    externalPayment: 0,
    totalBalanceNW: 0,
    holdingFinancingShortfall: 0,
    detail: [],
  };
  let availableHolding = holdingBalance;
  for (const d of debts) {
    if (!d) continue;
    const opening = d.balance;
    const includeInNW = d.includeInNetWorth ?? (d.impact !== "risk_only");
    if (d.balance <= 0) {
      t.detail.push({
        id: d.id, name: d.name, kind: d.kind, impact: d.impact,
        opening: 0, interest: 0, principal: 0, closing: 0,
        includeInNetWorth: includeInNW, linkedDebtId: d.linkedDebtId,
        financingNote: undefined,
      });
      continue;
    }

    const financing = d.kind === "holding" ? (d.holdingFinancing ?? "holding_capital") : undefined;
    // Renter påløber for alle reelle gældsposter (ikke display_only / risk_only)
    const accrueInterest = !(d.impact === "risk_only" || financing === "display_only");
    const interest = accrueInterest ? d.balance * (d.interestRate ?? 0) : 0;
    const wantPay = (d.monthlyPayment ?? 0) * 12;

    let interestPaid = 0;
    let principalPaid = 0;
    let paid = 0;
    let financingNote: string | undefined;
    let unfinanced = 0;

    if (d.impact === "risk_only" || financing === "display_only") {
      financingNote = "Kun visning/risiko";
    } else if (financing === "exit_only") {
      if (calYear >= exitYear) {
        // Afdrag ved exit — træk fra holdingkapital
        const due = d.balance + interest;
        const cover = Math.min(availableHolding, due);
        availableHolding -= cover;
        unfinanced = due - cover;
        interestPaid = Math.min(interest, cover);
        principalPaid = Math.max(0, cover - interestPaid);
        paid = cover;
        t.holdingInterest += interestPaid;
        t.holdingPrincipal += principalPaid;
        t.holdingPayment += paid;
        t.holdingFinancingShortfall += unfinanced;
        financingNote = unfinanced > 0
          ? "Exit-afdrag — utilstrækkelig holdingkapital"
          : "Afdraget ved exit fra holdingkapital";
      } else {
        financingNote = `Afdrages først ved exit (${exitYear})`;
      }
    } else if (d.impact === "private" || financing === "private_cashflow") {
      paid = Math.min(d.balance + interest, wantPay);
      interestPaid = Math.min(interest, paid);
      principalPaid = Math.max(0, paid - interestPaid);
      t.privateInterest += interestPaid;
      t.privatePrincipal += principalPaid;
      t.privatePayment += paid;
      if (financing === "private_cashflow") financingNote = "Holdinggæld betales af privat cashflow";
    } else if (financing === "external_company") {
      // Betales af ekstern selskabscashflow uden for modellen — saldo nedbringes uden at trække fra modellen
      paid = Math.min(d.balance + interest, wantPay);
      interestPaid = Math.min(interest, paid);
      principalPaid = Math.max(0, paid - interestPaid);
      t.externalPayment += paid;
      financingNote = "Betales eksternt — uden for modellen";
    } else if (financing === "holding_capital" || d.impact === "holding") {
      // Træk fra holdingkapital — kun hvad der er dækning for
      const want = Math.min(d.balance + interest, wantPay);
      const cover = Math.min(availableHolding, want);
      availableHolding -= cover;
      unfinanced = want - cover;
      interestPaid = Math.min(interest, cover);
      principalPaid = Math.max(0, cover - interestPaid);
      paid = cover;
      t.holdingInterest += interestPaid;
      t.holdingPrincipal += principalPaid;
      t.holdingPayment += paid;
      t.holdingFinancingShortfall += unfinanced;
      if (unfinanced > 0) financingNote = `Holdingkapital utilstrækkelig — ${Math.round(unfinanced).toLocaleString("da-DK")} kr ufinansieret`;
    }

    // Saldo: tilføj renter (hvis påløbet), træk det faktisk betalte
    d.balance = Math.max(0, d.balance + interest - paid);
    if (includeInNW) t.totalBalanceNW += d.balance;
    t.detail.push({
      id: d.id, name: d.name, kind: d.kind, impact: d.impact,
      opening, interest, principal: principalPaid, closing: d.balance,
      includeInNetWorth: includeInNW, linkedDebtId: d.linkedDebtId,
      financingNote,
    });
  }
  return t;
}

/** Synkronisér linked hæftelser så de spejler den underliggende gælds saldo. */
function syncLinkedLiabilities(debts: DebtItem[]) {
  for (const d of debts) {
    if (d.linkedDebtId) {
      const parent = debts.find((p) => p.id === d.linkedDebtId);
      if (parent) d.balance = Math.min(d.balance, parent.balance);
    }
  }
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
  const holdingStrategy = inp.holding.withdrawalStrategy ?? "planned_only";
  const pensionAvailableFromAge = inp.pension.payoutFromAge ?? inp.holding.pensionAvailableFromAge ?? 60;

  const debts: DebtItem[] = (inp.debts ?? []).map((d) => ({ ...d }));

  const bal: Balances = {
    free: inp.free.balance,
    pension: inp.pension.balance,
    holding: inp.holding.balance,
    buffer: inp.free.cashBuffer ?? 0,
    debt: debts.filter((d) => (d.includeInNetWorth ?? d.impact !== "risk_only")).reduce((s, d) => s + (d?.balance ?? 0), 0),
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
    }

    if (inp.holding.exitYear === calYear && inp.holding.expectedExitValue > 0) {
      bal.holding += inp.holding.expectedExitValue;
    }

    const distFromAge = inp.holding.startDistributionAtStopAge
      ? stopAge
      : inp.holding.distributionFromAge;

    // ---- Planlagt holdingudlodning ----
    const holdingPlanned = { gross: 0, net: 0, tax: 0 };
    const canDistribute = bal.holding > 0 && age >= distFromAge;
    if (canDistribute) {
      if (holdingStrategy === "up_to_low_threshold") {
        // Udlod automatisk op til lav-sats grænse (brutto)
        holdingPlanned.gross = Math.min(bal.holding, a.tax.shareThreshold);
      } else if (inp.holding.annualDistribution > 0) {
        holdingPlanned.gross = Math.min(bal.holding, inp.holding.annualDistribution);
      }
      if (holdingPlanned.gross > 0) {
        const r = shareTax(holdingPlanned.gross, a.tax);
        holdingPlanned.net = r.net;
        holdingPlanned.tax = r.tax;
        bal.holding -= holdingPlanned.gross;
      }
    }

    // Gæld
    syncLinkedLiabilities(debts);
    const dt = processDebts(debts, bal.holding);
    bal.debt = dt.totalBalanceNW;
    bal.holding = Math.max(0, bal.holding - dt.holdingPayment);

    const spending = inp.spending.desiredMonthlyNet * 12;
    const incomeNet = salaryNet + partTimeNet + familyFundNet + statePensionNet + holdingPlanned.net;
    const cashflow = incomeNet - dt.privatePayment - spending;

    let freeContribution = 0;
    const bufferContribution = 0;
    const withdrawals = { free: 0, pension: 0, holding: 0, buffer: 0 };
    const withdrawalsGross = { free: 0, pension: 0, holding: 0, buffer: 0 };
    let pensionPayoutNet = 0;
    let cashflowSurplus = 0;
    const holdingExtra = { gross: 0, net: 0, tax: 0 };

    // Bestem rækkefølge for shortfall-udtræk afhængig af strategi
    const buildOrder = (): Bucket[] => {
      const baseOrder = a.withdrawOrder.slice();
      const allowExtraHolding =
        holdingStrategy === "allow_extra_on_shortfall" ||
        holdingStrategy === "pension_before_extra_holding" ||
        holdingStrategy === "up_to_low_threshold"; // tillader stadig dækning fra holding-resten
      const filtered = baseOrder.filter((b) => {
        if (b === "holding") {
          if (!allowExtraHolding) return false;
          if (age < distFromAge) return false;
          return true;
        }
        return true;
      });
      if (holdingStrategy === "pension_before_extra_holding") {
        // Sørg for at pension kommer før holding hvis pension er tilgængelig
        const pensionIdx = filtered.indexOf("pension");
        const holdingIdx = filtered.indexOf("holding");
        if (pensionIdx > -1 && holdingIdx > -1 && age >= pensionAvailableFromAge && pensionIdx > holdingIdx) {
          filtered.splice(pensionIdx, 1);
          filtered.splice(holdingIdx, 0, "pension");
        }
        // Hvis pension ikke tilgængelig endnu, fjern pension
        if (age < pensionAvailableFromAge) {
          const idx = filtered.indexOf("pension");
          if (idx > -1) filtered.splice(idx, 1);
        }
      } else {
        // Standard: pension først tilgængelig fra pensionAvailableFromAge
        if (age < pensionAvailableFromAge) {
          const idx = filtered.indexOf("pension");
          if (idx > -1) filtered.splice(idx, 1);
        }
      }
      return filtered;
    };

    const order = buildOrder();
    const drainShortfall = (needed: number) => {
      for (const b of order) {
        if (needed <= 0) break;
        const r = withdrawFromBucket(b, needed, bal, a);
        withdrawals[b] += r.netCovered;
        withdrawalsGross[b] += r.gross;
        if (b === "pension") pensionPayoutNet += r.netCovered;
        if (b === "holding") {
          holdingExtra.net += r.netCovered;
          holdingExtra.gross += r.gross;
          holdingExtra.tax += r.tax;
        }
        needed -= r.netCovered;
      }
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
    const totalHoldingNet = holdingPlanned.net + holdingExtra.net;
    const totalHoldingGross = holdingPlanned.gross + holdingExtra.gross;
    const totalHoldingTax = holdingPlanned.tax + holdingExtra.tax;

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
        holdingDistributionNet: totalHoldingNet,
        pensionPayoutNet,
        employerPensionContribution: employerPension,
        ownPensionContribution,
        freeContribution,
        bufferContribution,
        spending,
        taxes: laborTaxAmt + totalHoldingTax + statePensionTax,
        debtInterest: dt.privateInterest + dt.holdingInterest,
        debtPrincipal: dt.privatePrincipal + dt.holdingPrincipal,
        withdrawals: { ...withdrawals, holding: totalHoldingNet },
        withdrawalsGross: { ...withdrawalsGross, holding: totalHoldingGross },
        holdingPlanned,
        holdingExtra,
        debtsDetail: dt.detail,
        cashflowSurplus,
        growth,
        holdingFinancingShortfall: dt.holdingFinancingShortfall,
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
