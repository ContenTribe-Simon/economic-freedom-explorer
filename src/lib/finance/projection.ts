import {
  Assumptions,
  AskWithdrawalStrategy,
  Bucket,
  DebtItem,
  DebtYearDetail,
  Scenario,
  ScenarioInputs,
  YearRow,
} from "./types";

import {
  applyShareIncomeTax,
  grossHoldingForNet,
  grossPensionForNet,
  grossSaleForNetNeeded,
  laborTax,
  newShareIncomeCtx,
  pensionPayoutTax,
  shareTax,
  type ShareIncomeCtx,
} from "./tax";
import { computeLifeEventEffects } from "./lifeEvents";


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
  /** ASK sub-bucket (0 hvis ASK ikke er aktiveret). Bevarer bagudkompatibilitet. */
  ask: number;
}

/**
 * Depot-skat state der opdateres in-place ved salg fra almindeligt depot.
 * Bruges kun når depotTax.method = "realizationSimple". For andre metoder
 * (legacy / annual) sættes denne til undefined og udtræk sker uden gross-up.
 */
interface DepotTaxState {
  ctx: ShareIncomeCtx;
  /** Skattemæssig kostpris for almindeligt depot. */
  costBasis: number;
  /** Akkumuleret brutto salg i året (audit). */
  grossSaleAcc: number;
  /** Akkumuleret realiseret gevinst i året (audit). */
  realizedGainAcc: number;
  /** Akkumuleret skat fra depotsalg i året (audit). */
  saleTaxAcc: number;
  /** Akkumuleret reduktion af kostpris (audit). */
  costBasisReductionAcc: number;
}

function withdrawFromBucket(
  bucket: Bucket,
  netNeeded: number,
  bal: Balances,
  a: Assumptions,
  pensionTaxRate: number,
  askStrategy: AskWithdrawalStrategy = "depotFirst",
  onAskWithdraw?: (n: number) => void,
  onDepotWithdraw?: (n: number) => void,
  depotTax?: DepotTaxState,
): { netCovered: number; gross: number; tax: number } {
  if (netNeeded <= 0) return { netCovered: 0, gross: 0, tax: 0 };
  if (bucket === "free") {
    // Hjælper: træk netto fra depot med korrekt gross-up når depotTax.realizationSimple.
    // Returnerer netto faktisk dækket og brutto salg fra depot.
    const drainDepotNet = (need: number): { net: number; gross: number; tax: number } => {
      if (need <= 0 || bal.free <= 0) return { net: 0, gross: 0, tax: 0 };
      if (!depotTax) {
        const g = Math.min(bal.free, need);
        bal.free -= g;
        return { net: g, gross: g, tax: 0 };
      }
      const depotBefore = bal.free;
      const gainRatio = Math.max(0, depotBefore - depotTax.costBasis) / depotBefore;
      const thresholdRemaining = Math.max(0, depotTax.ctx.threshold - depotTax.ctx.used);
      const sol = grossSaleForNetNeeded(
        need,
        gainRatio,
        thresholdRemaining,
        depotTax.ctx.lowRate,
        depotTax.ctx.highRate,
        depotBefore,
      );
      if (sol.sale <= 0) return { net: 0, gross: 0, tax: 0 };
      // Anvend gevinst gennem ctx (opdaterer used/taxLow/taxHigh)
      applyShareIncomeTax(depotTax.ctx, sol.realizedGain);
      // Reducer kostpris proportionalt
      const reductionRatio = sol.sale / depotBefore;
      const costBasisReduction = Math.max(0, depotTax.costBasis * reductionRatio);
      depotTax.costBasis = Math.max(0, depotTax.costBasis - costBasisReduction);
      bal.free = Math.max(0, bal.free - sol.sale);
      depotTax.grossSaleAcc += sol.sale;
      depotTax.realizedGainAcc += sol.realizedGain;
      depotTax.saleTaxAcc += sol.tax;
      depotTax.costBasisReductionAcc += costBasisReduction;
      return { net: sol.sale - sol.tax, gross: sol.sale, tax: sol.tax };
    };

    const drainAskNet = (need: number): number => {
      if (need <= 0 || bal.ask <= 0) return 0;
      const take = Math.min(bal.ask, need);
      bal.ask -= take;
      return take;
    };

    let netCovered = 0;
    let grossOut = 0;
    let taxOut = 0;
    if (askStrategy === "askFirst") {
      const a1 = drainAskNet(netNeeded);
      if (a1 > 0) onAskWithdraw?.(a1);
      netCovered += a1; grossOut += a1;
      const rem = netNeeded - netCovered;
      if (rem > 0) {
        const d = drainDepotNet(rem);
        if (d.gross > 0) onDepotWithdraw?.(d.gross);
        netCovered += d.net; grossOut += d.gross; taxOut += d.tax;
      }
    } else if (askStrategy === "proRata" && bal.ask > 0 && bal.free > 0) {
      const total = bal.ask + bal.free;
      const askPart = Math.min(bal.ask, netNeeded * (bal.ask / total));
      const depotPart = netNeeded - askPart;
      const a1 = drainAskNet(askPart);
      if (a1 > 0) onAskWithdraw?.(a1);
      const d = drainDepotNet(depotPart);
      if (d.gross > 0) onDepotWithdraw?.(d.gross);
      netCovered = a1 + d.net; grossOut = a1 + d.gross; taxOut = d.tax;
      // Hvis en gren ikke dækkede pga. cap, prøv den anden
      const shortfall = netNeeded - netCovered;
      if (shortfall > 0.5) {
        if (bal.free > 0) {
          const d2 = drainDepotNet(shortfall);
          if (d2.gross > 0) onDepotWithdraw?.(d2.gross);
          netCovered += d2.net; grossOut += d2.gross; taxOut += d2.tax;
        } else if (bal.ask > 0) {
          const a2 = drainAskNet(shortfall);
          if (a2 > 0) onAskWithdraw?.(a2);
          netCovered += a2; grossOut += a2;
        }
      }
    } else {
      // depotFirst (default)
      const d = drainDepotNet(netNeeded);
      if (d.gross > 0) onDepotWithdraw?.(d.gross);
      netCovered += d.net; grossOut += d.gross; taxOut += d.tax;
      const rem = netNeeded - netCovered;
      if (rem > 0) {
        const a1 = drainAskNet(rem);
        if (a1 > 0) onAskWithdraw?.(a1);
        netCovered += a1; grossOut += a1;
      }
    }
    return { netCovered, gross: grossOut, tax: taxOut };
  }
  if (bucket === "holding") {
    const grossNeeded = grossHoldingForNet(netNeeded, a.tax);
    const take = Math.min(bal.holding, grossNeeded);
    const { net, tax } = shareTax(take, a.tax);
    bal.holding -= take;
    return { netCovered: net, gross: take, tax };
  }
  const grossNeeded = grossPensionForNet(netNeeded, pensionTaxRate);
  const take = Math.min(bal.pension, grossNeeded);
  const { net, tax } = pensionPayoutTax(take, pensionTaxRate);
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

/**
 * Resolve hvornår planlagt fri opsparing stopper, ud fra stopreglen.
 * Returnerer null for "never".
 */
export function resolvePlannedContributionStopAge(
  inp: ScenarioInputs,
  stopAge: number,
): number | null {
  const rule = inp.free.contributionStopRule ?? "stopAge";
  if (rule === "never") return null;
  if (rule === "fullRetireAge") return inp.fullRetireAge ?? stopAge;
  if (rule === "customAge") return inp.free.contributionStopAge ?? stopAge;
  return stopAge;
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
  const plannedStopAge = resolvePlannedContributionStopAge(inp, stopAge);

  const debts: DebtItem[] = (inp.debts ?? []).map((d) => ({ ...d }));

  // ---- ASK (Aktiesparekonto) initialisering ----
  // ASK er optional og defaulter til disabled — når disabled giver al logik
  // præcis samme resultater som tidligere (bal.ask = 0).
  const askInput = inp.free.ask;
  const askActive = !!askInput?.enabled;
  const askTaxRate = askInput?.taxRate ?? 0.17;
  const askDepositLimit = askInput?.depositLimit ?? 174_200;
  const totalFreeOpening = inp.free.balance;
  // currentValue er "heraf ASK" — må ikke overstige samlet fri kapital.
  const askInitialValue = askActive
    ? Math.max(0, Math.min(askInput!.currentValue ?? 0, totalFreeOpening))
    : 0;
  let askCarryForward = askActive ? Math.max(0, askInput!.taxCreditCarryForward ?? 0) : 0;
  // Indskudsrum for år 0 baseret på priorYearEndValue (fallback til currentValue).
  let askPriorYearEnd = askActive
    ? Math.max(0, askInput!.priorYearEndValue ?? askInitialValue)
    : 0;

  const bal: Balances = {
    free: totalFreeOpening - askInitialValue,
    pension: inp.pension.balance,
    holding: inp.holding.balance,
    buffer: inp.free.cashBuffer ?? 0,
    debt: debts.filter((d) => (d.includeInNetWorth ?? d.impact !== "risk_only")).reduce((s, d) => s + (d?.balance ?? 0), 0),
    ask: askInitialValue,
  };

  /** Persisterende effekt af one_time privat-gælds-events. */
  let lifeEventDebtBalance = 0;

  const totalYears = inp.person.lifeExpectancy - inp.person.currentAge + 1;

  for (let i = 0; i < totalYears; i++) {
    const age = inp.person.currentAge + i;
    const calYear = startYear + i;
    // Opening eksponerer fri kapital som samlet sum (ask + depot) — bagudkompatibelt.
    const openingFree = bal.free + bal.ask;
    const opening = {
      free: openingFree,
      pension: bal.pension,
      holding: bal.holding,
      buffer: bal.buffer,
      debt: bal.debt,
    };
    const askOpening = bal.ask;
    let askContribYear = 0;
    let askWithdrawYear = 0;

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
    const ratePensionEnabled = inp.pension.ratePensionEnabled ?? true;

    if (working) {
      salaryGross = inp.income.salaryGross;
      const taxableGross = Math.max(0, salaryGross - inp.pension.monthlyContribution * 12);
      const r = laborTax(taxableGross, a.tax);
      salaryNet = r.net;
      laborTaxAmt = r.tax;
      employerPension = ratePensionEnabled ? inp.pension.employerContribution * 12 : 0;
      ownPensionContribution = ratePensionEnabled ? inp.pension.monthlyContribution * 12 : 0;
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

    // ---- Ratepension (planlagt udbetaling over fast periode) ----
    const ratePension = { gross: 0, net: 0, tax: 0, active: false };
    const ratePayoutFromAge = inp.pension.payoutFromAge ?? 64;
    const ratePayoutYears = Math.max(1, inp.pension.ratePensionPayoutYears ?? 15);
    const rateTaxRate = inp.pension.ratePensionEffectiveTaxRate ?? 0.4;
    if (
      ratePensionEnabled &&
      age >= ratePayoutFromAge &&
      age < ratePayoutFromAge + ratePayoutYears &&
      bal.pension > 0
    ) {
      const remainingYears = ratePayoutFromAge + ratePayoutYears - age;
      const grossPlanned = bal.pension / Math.max(1, remainingYears);
      const grossTake = Math.min(bal.pension, grossPlanned);
      bal.pension -= grossTake;
      const tax = grossTake * rateTaxRate;
      ratePension.gross = grossTake;
      ratePension.tax = tax;
      ratePension.net = grossTake - tax;
      ratePension.active = true;
    }

    // ---- Livsvarig pension / livrente (stream til levealder) ----
    const lifeAnnuity = { gross: 0, net: 0, tax: 0, active: false };
    const la = inp.pension.lifeAnnuity;
    if (la?.enabled && age >= la.fromAge) {
      if (la.mode === "gross") {
        const tax = la.annualGross * (la.effectiveTaxRate ?? 0.4);
        lifeAnnuity.gross = la.annualGross;
        lifeAnnuity.tax = tax;
        lifeAnnuity.net = la.annualGross - tax;
      } else {
        lifeAnnuity.net = la.annualNet;
        lifeAnnuity.gross = la.annualNet;
      }
      lifeAnnuity.active = lifeAnnuity.net > 0;
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
    const dt = processDebts(debts, bal.holding, calYear, inp.holding.exitYear);
    bal.debt = dt.totalBalanceNW;
    bal.holding = Math.max(0, bal.holding - dt.holdingPayment);

    // ---- Livsfaser (life events) — aggreger effekter for året ----
    const lifeEventEffects = computeLifeEventEffects(
      inp.lifeEvents,
      age,
      inp.person.lifeExpectancy,
    );

    const baseSpending = inp.spending.desiredMonthlyNet * 12;
    const spending = Math.max(0, baseSpending + (lifeEventEffects?.spendingDelta ?? 0));
    const pensionStreamNet = ratePension.net + lifeAnnuity.net;
    const incomeNet =
      salaryNet + partTimeNet + familyFundNet + statePensionNet + holdingPlanned.net + pensionStreamNet
      + (lifeEventEffects?.incomeDelta ?? 0);
    const cashflow = incomeNet - dt.privatePayment - spending;

    let freeContribution = 0;
    const bufferContribution = 0;
    const withdrawals = { free: 0, pension: 0, holding: 0, buffer: 0 };
    const withdrawalsGross = { free: 0, pension: 0, holding: 0, buffer: 0 };
    let cashflowSurplus = 0;
    const holdingExtra = { gross: 0, net: 0, tax: 0 };
    const pensionExtra = { gross: 0, net: 0, tax: 0 };

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
    const askStrategy: AskWithdrawalStrategy = askActive
      ? (askInput!.withdrawalStrategy ?? "depotFirst")
      : "depotFirst";
    let askDepotWithdrawYear = 0;
    const trackAskWithdraw = (n: number) => { askWithdrawYear += n; };
    const trackDepotWithdraw = (n: number) => { askDepotWithdrawYear += n; };
    const drainShortfall = (needed: number) => {
      for (const b of order) {
        if (needed <= 0) break;
        const r = withdrawFromBucket(b, needed, bal, a, rateTaxRate, askStrategy, trackAskWithdraw, trackDepotWithdraw);

        withdrawals[b] += r.netCovered;
        withdrawalsGross[b] += r.gross;
        if (b === "pension") {
          pensionExtra.net += r.netCovered;
          pensionExtra.gross += r.gross;
          pensionExtra.tax += r.tax;
        }
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

    // Allokering af planlagt fri opsparing — fyld evt. ASK først.
    const allocateFreeContribution = (amount: number) => {
      if (amount <= 0) return;
      if (askActive && askInput!.autoFillFirst) {
        const room = Math.max(0, askDepositLimit - askPriorYearEnd);
        const toAsk = Math.min(amount, room);
        if (toAsk > 0) {
          bal.ask += toAsk;
          askContribYear += toAsk;
        }
        const toDepot = amount - toAsk;
        if (toDepot > 0) bal.free += toDepot;
      } else {
        bal.free += amount;
      }
    };

    let unallocatedCashflow = 0;
    const plannedActive = plannedStopAge === null || age < plannedStopAge;
    const rawPlanned = inp.free.monthlyContribution * 12 + inp.free.annualExtraContribution;
    const plannedFreeContribution = plannedActive ? rawPlanned : 0;
    if (working || plannedActive) {
      const planned = plannedFreeContribution;
      cashflowSurplus = cashflow - planned;
      if (savingsLogic === "cashflow") {
        if (cashflow >= 0) {
          freeContribution = cashflow;
          allocateFreeContribution(freeContribution);
        } else drainShortfall(-cashflow);
      } else if (savingsLogic === "planned") {
        freeContribution = Math.max(0, Math.min(planned, Math.max(0, cashflow)));
        allocateFreeContribution(freeContribution);
        // Overskydende cashflow ud over planlagt opsparing investeres IKKE — vises som ikke-allokeret.
        unallocatedCashflow = Math.max(0, cashflow - freeContribution);
      } else {
        freeContribution = planned;
        allocateFreeContribution(freeContribution);
        const net = cashflow - planned;
        if (net < 0) drainShortfall(-net);
        else unallocatedCashflow = net;
      }
    } else {
      if (cashflow >= 0) {
        freeContribution = cashflow;
        allocateFreeContribution(freeContribution);
      } else {
        drainShortfall(-cashflow);
      }
    }

    if (working) bal.pension += ownPensionContribution + employerPension;

    // ---- Livsfaser: engangs-effekter på fri kapital og privat gæld ----
    if (lifeEventEffects) {
      bal.free = Math.max(0, bal.free + lifeEventEffects.freeCapitalDelta);
      lifeEventDebtBalance = Math.max(0, lifeEventDebtBalance + lifeEventEffects.debtDelta);
    }

    const required = spending + dt.privatePayment;
    const provided =
      incomeNet + withdrawals.free + withdrawals.pension + withdrawals.holding + withdrawals.buffer;
    const stillShort = Math.max(0, required - provided);

    // ---- Vækst ----
    // Almindeligt frit depot bevarer eksisterende sti (brutto realafkast).
    const freeDepotGrowth = bal.free * a.realReturn.free;
    bal.free += freeDepotGrowth;

    // ASK: brutto afkast, fremført negativ skat modregnes, lagerskat fratrækkes ASK.
    let askGrowthGross = 0;
    let askTax = 0;
    let askCarryUsed = 0;
    if (askActive) {
      askGrowthGross = bal.ask * a.realReturn.free;
      if (askGrowthGross > 0) {
        let taxable = askGrowthGross;
        if (askCarryForward > 0) {
          askCarryUsed = Math.min(askCarryForward, taxable);
          taxable -= askCarryUsed;
          askCarryForward -= askCarryUsed;
        }
        askTax = Math.max(0, taxable) * askTaxRate;
      } else if (askGrowthGross < 0) {
        // Negativt afkast — fremfør tabet til modregning i fremtidige positive afkast.
        askCarryForward += -askGrowthGross;
      }
      bal.ask = Math.max(0, bal.ask + askGrowthGross - askTax);
    }

    const growth = {
      free: freeDepotGrowth + (askActive ? askGrowthGross - askTax : 0),
      pension: bal.pension * a.realReturn.pension,
      holding: bal.holding * a.realReturn.holding,
    };
    bal.pension += growth.pension;
    bal.holding += growth.holding;

    // Tilføj persisterende livsfase-gæld til årets udgående gæld (efter processDebts).
    bal.debt = bal.debt + lifeEventDebtBalance;

    const closing = {
      free: bal.free + bal.ask,
      pension: bal.pension,
      holding: bal.holding,
      buffer: bal.buffer,
      debt: bal.debt,
    };
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
        pensionPayoutNet: ratePension.net + lifeAnnuity.net + pensionExtra.net,
        ratePension,
        lifeAnnuity,
        pensionExtra,
        employerPensionContribution: employerPension,
        ownPensionContribution,
        freeContribution,
        bufferContribution,
        spending,
        taxes: laborTaxAmt + totalHoldingTax + statePensionTax + ratePension.tax + lifeAnnuity.tax + pensionExtra.tax,
        debtInterest: dt.privateInterest + dt.holdingInterest,
        debtPrincipal: dt.privatePrincipal + dt.holdingPrincipal,
        withdrawals: { ...withdrawals, holding: totalHoldingNet, pension: ratePension.net + lifeAnnuity.net + pensionExtra.net },
        withdrawalsGross: { ...withdrawalsGross, holding: totalHoldingGross, pension: ratePension.gross + lifeAnnuity.gross + pensionExtra.gross },
        holdingPlanned,
        holdingExtra,
        debtsDetail: dt.detail,
        cashflowSurplus,
        unallocatedCashflow,
        investedAmount: freeContribution,
        plannedFreeContribution,
        plannedContributionsActive: plannedActive,
        plannedContributionStopAge: plannedStopAge,
        growth,
        holdingFinancingShortfall: dt.holdingFinancingShortfall,
        lifeEventEffects: lifeEventEffects ?? undefined,
        ask: askActive ? {
          opening: askOpening,
          contribution: askContribYear,
          growthGross: askGrowthGross,
          tax: askTax,
          carryForwardUsed: askCarryUsed,
          carryForwardEnd: askCarryForward,
          withdrawal: askWithdrawYear,
          withdrawalFreeDepot: askDepotWithdrawYear,
          withdrawalStrategy: askStrategy,

          closing: bal.ask,
          freeDepotClosing: bal.free,
          depositLimit: askDepositLimit,
          depositRoom: Math.max(0, askDepositLimit - askPriorYearEnd),
          autoFillFirst: !!askInput!.autoFillFirst,
        } : undefined,
      },
      totalIncomeNet: incomeNet,
      netWorth,
      shortfall: stillShort > 0.5,
      shortfallAmount: stillShort,
      monthlyGap: stillShort / 12,
    });

    // Forbered næste år: ASK ultimo er grundlag for indskudsrum næste år.
    if (askActive) askPriorYearEnd = bal.ask;
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
