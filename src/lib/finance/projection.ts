import {
  Assumptions,
  AskWithdrawalStrategy,
  Bucket,
  CapitalSource,
  CapitalWithdrawalInputs,
  CapitalWithdrawalYearAudit,
  DebtItem,
  DebtYearDetail,
  Scenario,
  ScenarioInputs,
  ShareIncomeFundingStrategy,
  YearRow,
} from "./types";
import { resolveOrder } from "./capitalWithdrawal";


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

/** Grov, gennemsnitlig effektiv sats til latent skat-indikator i audit. */
function ctxEffectiveRate(ctx: ShareIncomeCtx): number {
  return (ctx.lowRate + ctx.highRate) / 2;
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
 * Eksisterer kun når depotTax er aktiv (ctx + accumulators bruges også for
 * annualShareIncomeTax — realization-gross-up er gated af realizationActive).
 */
interface DepotTaxState {
  ctx: ShareIncomeCtx;
  /** Skattemæssig kostpris for almindeligt depot. */
  costBasis: number;
  /** Aktivér gross-up ved depotudtræk (kun realizationSimple). */
  realizationActive: boolean;
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
      if (!depotTax || !depotTax.realizationActive) {
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
    if (depotTax?.ctx) {
      // Shared-pool: brug aktieindkomst-pulje (delt 27/42-grænse med depotgevinst).
      // Iterativt gross-up: tax afhænger af ctx.used, så solve s.
      const ctx = depotTax.ctx;
      const remainingLow = Math.max(0, ctx.threshold - ctx.used);
      // Inverse: net = grossNeeded - tax; tax = min(g, remLow)*lowRate + max(0, g-remLow)*highRate
      let grossNeeded: number;
      const lowCap = remainingLow * (1 - ctx.lowRate);
      if (netNeeded <= lowCap) {
        grossNeeded = ctx.lowRate < 1 ? netNeeded / (1 - ctx.lowRate) : netNeeded;
      } else {
        const overNet = netNeeded - lowCap;
        grossNeeded = remainingLow + (ctx.highRate < 1 ? overNet / (1 - ctx.highRate) : overNet);
      }
      const take = Math.min(bal.holding, grossNeeded);
      const r = applyShareIncomeTax(ctx, take);
      bal.holding -= take;
      return { netCovered: r.net, gross: take, tax: r.tax };
    }
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

  // ---- Samlet kapitaludtræksstrategi (v1) ----
  // Når inp.capitalWithdrawal er sat, bruger projection den nye samlede strategi
  // som source of truth. Når undefined → al udtræk og planlagt holdingudlodning
  // håndteres via det eksisterende legacy code path nedenfor (uændret adfærd).
  const cw: CapitalWithdrawalInputs | undefined = inp.capitalWithdrawal;
  const cwActive = !!cw;


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

  // ---- Depot-skat (almindeligt frit depot) initialisering ----
  const depotTaxInput = inp.free.depotTax;
  const depotTaxActive = !!depotTaxInput?.enabled && depotTaxInput?.method !== "legacy";
  const depotTaxMethod = depotTaxInput?.method ?? "legacy";
  const fundingStrategy: ShareIncomeFundingStrategy =
    depotTaxInput?.shareIncomeFundingStrategy ?? "holdingFirst";
  const depotInitialValue = totalFreeOpening - askInitialValue;
  // Kostpris: null ⇒ markedsværdi (ingen latent gevinst).
  let depotCostBasis = depotTaxActive
    ? Math.max(0, depotTaxInput!.costBasis ?? depotInitialValue)
    : depotInitialValue;


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

    // ---- Aktieindkomst-pulje + depot-skat state (per år) ----
    // Når depotTax ikke er aktiv, holder vi shareCtx=undefined → al holding-skat kører legacy.
    const shareCtx: ShareIncomeCtx | undefined = depotTaxActive ? newShareIncomeCtx(a.tax) : undefined;
    const depotPrimo = bal.free;
    const depotCostBasisPrimo = depotCostBasis;
    let depotContributionYear = 0;
    const depotTaxState: DepotTaxState | undefined = depotTaxActive
      ? {
          ctx: shareCtx!,
          costBasis: depotCostBasis,
          realizationActive: depotTaxMethod === "realizationSimple",
          grossSaleAcc: 0,
          realizedGainAcc: 0,
          saleTaxAcc: 0,
          costBasisReductionAcc: 0,
        }
      : undefined;


    // ---- Planlagt holdingudlodning (legacy code path) ----
    // Springes over når capitalWithdrawal er aktiv — så håndteres planlagt udtræk
    // af den samlede strategi nedenfor.
    const holdingPlanned = { gross: 0, net: 0, tax: 0 };
    if (!cwActive) {
      const canDistribute = bal.holding > 0 && age >= distFromAge;
      if (canDistribute) {
        if (holdingStrategy === "up_to_low_threshold") {
          holdingPlanned.gross = Math.min(bal.holding, a.tax.shareThreshold);
        } else if (inp.holding.annualDistribution > 0) {
          holdingPlanned.gross = Math.min(bal.holding, inp.holding.annualDistribution);
        }
        if (holdingPlanned.gross > 0) {
          if (shareCtx) {
            const r = applyShareIncomeTax(shareCtx, holdingPlanned.gross);
            holdingPlanned.net = r.net;
            holdingPlanned.tax = r.tax;
          } else {
            const r = shareTax(holdingPlanned.gross, a.tax);
            holdingPlanned.net = r.net;
            holdingPlanned.tax = r.tax;
          }
          bal.holding -= holdingPlanned.gross;
        }
      }
    }

    // ---- Samlet kapitaludtræk (capitalWithdrawal) — kun aktivt når cwActive ----
    // Per-source drainere genbruger withdrawFromBucket og giver én samlet logik
    // for planlagt udtræk + shortfall.
    let askDepotWithdrawYear = 0;
    const trackAskWithdrawCW = (n: number) => { askWithdrawYear += n; };
    const trackDepotWithdrawCW = (n: number) => { askDepotWithdrawYear += n; };

    const cwAudit: CapitalWithdrawalYearAudit | undefined = cwActive
      ? {
          strategy: cw!.strategy,
          plannedPolicy: cw!.plannedWithdrawalPolicy,
          startAge: cw!.startAtStopAge ? stopAge : cw!.startAge,
          effectiveOrder: [],
          grossBySource: { depot: 0, holding: 0, ask: 0, pension: 0 },
          netBySource: { depot: 0, holding: 0, ask: 0, pension: 0 },
          taxBySource: { depot: 0, holding: 0, ask: 0, pension: 0 },
          totalGross: 0,
          totalNet: 0,
          totalTax: 0,
        }
      : undefined;

    // Drainer der trækker fra én konkret kilde og tracker audit.
    // Bruges af både planlagt og shortfall i CW-stien.
    const drainSourceCW = (
      src: CapitalSource,
      netNeeded: number,
    ): { net: number; gross: number; tax: number } => {
      if (netNeeded <= 0) return { net: 0, gross: 0, tax: 0 };
      let r: { netCovered: number; gross: number; tax: number } = { netCovered: 0, gross: 0, tax: 0 };
      if (src === "pension") {
        if (age < pensionAvailableFromAge) return { net: 0, gross: 0, tax: 0 };
        r = withdrawFromBucket("pension", netNeeded, bal, a, rateTaxRate);
      } else if (src === "holding") {
        if (bal.holding <= 0) return { net: 0, gross: 0, tax: 0 };
        r = withdrawFromBucket("holding", netNeeded, bal, a, rateTaxRate, "depotFirst", undefined, undefined, depotTaxState);
      } else if (src === "depot") {
        if (bal.free <= 0) return { net: 0, gross: 0, tax: 0 };
        const savedAsk = bal.ask; bal.ask = 0;
        r = withdrawFromBucket("free", netNeeded, bal, a, rateTaxRate, "depotFirst", undefined, trackDepotWithdrawCW, depotTaxState);
        bal.ask = savedAsk;
      } else if (src === "ask") {
        if (bal.ask <= 0) return { net: 0, gross: 0, tax: 0 };
        const savedFree = bal.free; bal.free = 0;
        r = withdrawFromBucket("free", netNeeded, bal, a, rateTaxRate, "askFirst", trackAskWithdrawCW, undefined, depotTaxState);
        bal.free = savedFree;
      }
      if (cwAudit && r.gross > 0) {
        cwAudit.grossBySource[src] += r.gross;
        cwAudit.netBySource[src] += r.netCovered;
        cwAudit.taxBySource[src] += r.tax;
      }
      return { net: r.netCovered, gross: r.gross, tax: r.tax };
    };



    // Drainer der tager et BRUTTO beløb fra én kilde (bruges af fixedAnnual planned).
    const drainSourceCWGross = (
      src: CapitalSource,
      grossAmount: number,
    ): { net: number; gross: number; tax: number } => {
      if (grossAmount <= 0) return { net: 0, gross: 0, tax: 0 };
      if (src === "holding") {
        if (bal.holding <= 0) return { net: 0, gross: 0, tax: 0 };
        const take = Math.min(bal.holding, grossAmount);
        let net = take, tax = 0;
        if (shareCtx) {
          const tr = applyShareIncomeTax(shareCtx, take);
          net = tr.net; tax = tr.tax;
        } else {
          const tr = shareTax(take, a.tax);
          net = tr.net; tax = tr.tax;
        }
        bal.holding -= take;
        if (cwAudit) {
          cwAudit.grossBySource.holding += take;
          cwAudit.netBySource.holding += net;
          cwAudit.taxBySource.holding += tax;
        }
        return { net, gross: take, tax };
      }
      if (src === "depot") {
        if (bal.free <= 0) return { net: 0, gross: 0, tax: 0 };
        const take = Math.min(bal.free, grossAmount);
        let net = take, tax = 0;
        if (depotTaxState && depotTaxState.realizationActive) {
          const depotBefore = bal.free;
          const gainRatio = Math.max(0, depotBefore - depotTaxState.costBasis) / depotBefore;
          const realizedGain = take * gainRatio;
          const tr = applyShareIncomeTax(depotTaxState.ctx, realizedGain);
          tax = tr.tax;
          net = take - tax;
          const reductionRatio = take / depotBefore;
          const costBasisReduction = Math.max(0, depotTaxState.costBasis * reductionRatio);
          depotTaxState.costBasis = Math.max(0, depotTaxState.costBasis - costBasisReduction);
          depotTaxState.grossSaleAcc += take;
          depotTaxState.realizedGainAcc += realizedGain;
          depotTaxState.saleTaxAcc += tax;
          depotTaxState.costBasisReductionAcc += costBasisReduction;
        }
        bal.free = Math.max(0, bal.free - take);
        askDepotWithdrawYear += take;
        if (cwAudit) {
          cwAudit.grossBySource.depot += take;
          cwAudit.netBySource.depot += net;
          cwAudit.taxBySource.depot += tax;
        }
        return { net, gross: take, tax };
      }
      if (src === "ask") {
        if (bal.ask <= 0) return { net: 0, gross: 0, tax: 0 };
        const take = Math.min(bal.ask, grossAmount);
        bal.ask -= take;
        askWithdrawYear += take;
        if (cwAudit) {
          cwAudit.grossBySource.ask += take;
          cwAudit.netBySource.ask += take;
        }
        return { net: take, gross: take, tax: 0 };
      }
      // pension: skip i v1 for fixedAnnual (ratepension har egen plan-logik).
      return { net: 0, gross: 0, tax: 0 };
    };

    // Beregn realiseret gevinst-ratio for depot (bruges af fillLow til at vurdere
    // om depot reelt kan bidrage til aktieindkomst-puljen).
    const depotGainRatio = (): number => {
      if (!depotTaxState || !depotTaxState.realizationActive) return 0;
      if (bal.free <= 0) return 0;
      return Math.max(0, bal.free - depotTaxState.costBasis) / bal.free;
    };

    // CW planlagt kapitaludtræk — fixedAnnual & fillLow.
    // Resulterende net pr. kilde tilføjes til incomeNet via plannedNetExtra
    // (holding-delen lægges i holdingPlanned for bagudkompatibel audit).
    let plannedNetExtra = 0;
    if (cwActive && cw!.plannedWithdrawalPolicy !== "none") {
      const effStartAge = cw!.startAtStopAge ? stopAge : cw!.startAge;
      const canStart = effStartAge === null ? false : age >= effStartAge;
      if (canStart) {


        const orderAll = resolveOrder(cw!.strategy, cw!.customOrder);
        // Filter ud fra rådighed + age-gates
        const orderFiltered = orderAll.filter((s) => {
          if (s === "pension") return age >= pensionAvailableFromAge && bal.pension > 0;
          if (s === "ask") return askActive && bal.ask > 0;
          if (s === "depot") return bal.free > 0;
          if (s === "holding") return bal.holding > 0;
          return false;
        });

        if (cw!.plannedWithdrawalPolicy === "fixedAnnual" && cw!.plannedWithdrawalAmount > 0) {
          let remaining = cw!.plannedWithdrawalAmount;
          for (const s of orderFiltered) {
            if (remaining <= 0) break;
            // pension springes over for fixedAnnual i v1.
            if (s === "pension") continue;
            const r = drainSourceCWGross(s, remaining);
            if (s === "holding") {
              holdingPlanned.gross += r.gross;
              holdingPlanned.net += r.net;
              holdingPlanned.tax += r.tax;
            } else {
              plannedNetExtra += r.net;
            }
            remaining -= r.gross;
          }
        } else if (cw!.plannedWithdrawalPolicy === "fillLowShareIncomeBracket") {
          // Brug kun aktieindkomstkilder (holding + depot m. gevinst).
          // Lav-grænse: a.tax.shareThreshold minus allerede brugt i puljen.
          const usedSoFar = shareCtx?.used ?? 0;
          let remainingLow = Math.max(0, a.tax.shareThreshold - usedSoFar);
          for (const s of orderFiltered) {
            if (remainingLow <= 0) break;
            if (s === "holding" && bal.holding > 0) {
              const take = Math.min(bal.holding, remainingLow);
              const r = drainSourceCWGross("holding", take);
              holdingPlanned.gross += r.gross;
              holdingPlanned.net += r.net;
              holdingPlanned.tax += r.tax;
              remainingLow = Math.max(0, remainingLow - r.gross);
            } else if (s === "depot") {
              const gr = depotGainRatio();
              if (gr <= 0) continue;
              // For at få `remainingLow` ind i aktieindkomst-puljen, skal vi sælge
              // gross = remainingLow / gr (eller hele depot, hvad end er mindst).
              const grossNeeded = Math.min(bal.free, remainingLow / gr);
              const r = drainSourceCWGross("depot", grossNeeded);
              plannedNetExtra += r.net;
              remainingLow = Math.max(0, remainingLow - (r.gross * gr));
            }
            // ask / pension må aldrig bruges til at fylde aktieindkomstgrænsen.
          }
        }
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
      + plannedNetExtra
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
      // shareIncomeFundingStrategy: reorder holding vs. free når depotTax er aktiv.
      if (depotTaxActive && fundingStrategy === "holdingFirst") {
        const holdingIdx = filtered.indexOf("holding");
        const freeIdx = filtered.indexOf("free");
        if (holdingIdx > -1 && freeIdx > -1 && holdingIdx > freeIdx) {
          filtered.splice(holdingIdx, 1);
          filtered.splice(freeIdx, 0, "holding");
        }
      }
      // depotFirst og proRata: depot/free kommer først (standard withdrawOrder).
      return filtered;
    };

    const order = buildOrder();
    const askStrategy: AskWithdrawalStrategy = askActive
      ? (askInput!.withdrawalStrategy ?? "depotFirst")
      : "depotFirst";
    const trackAskWithdraw = (n: number) => { askWithdrawYear += n; };
    const trackDepotWithdraw = (n: number) => { askDepotWithdrawYear += n; };

    // CW-aware shortfall drainer der bruger den samlede strategi.
    const drainShortfallCW = (needed: number) => {
      const orderAll = resolveOrder(cw!.strategy, cw!.customOrder);
      const orderFiltered = orderAll.filter((s) => {
        if (s === "pension") return age >= pensionAvailableFromAge;
        if (s === "ask") return askActive;
        return true;
      });
      if (cwAudit) cwAudit.effectiveOrder = orderFiltered.slice();

      // proRata: split mellem depot+holding+ask (alle ikke-pension) efter saldi.
      if (cw!.strategy === "proRata" && needed > 0) {
        const candidates = orderFiltered.filter((s) => s !== "pension");
        const balOf = (s: CapitalSource) => s === "depot" ? bal.free : s === "holding" ? bal.holding : s === "ask" ? bal.ask : 0;
        const totalBal = candidates.reduce((sum, s) => sum + balOf(s), 0);
        if (totalBal > 0) {
          for (const s of candidates) {
            const share = needed * (balOf(s) / totalBal);
            if (share <= 0) continue;
            const r = drainSourceCW(s, share);
            withdrawals[s === "depot" || s === "ask" ? "free" : s as Bucket] += r.net;
            withdrawalsGross[s === "depot" || s === "ask" ? "free" : s as Bucket] += r.gross;
            if (s === "holding") { holdingExtra.net += r.net; holdingExtra.gross += r.gross; holdingExtra.tax += r.tax; }
            needed -= r.net;
          }
        }
      }
      for (const s of orderFiltered) {
        if (needed <= 0) break;
        const r = drainSourceCW(s, needed);
        const targetBucket: Bucket = s === "pension" ? "pension" : s === "holding" ? "holding" : "free";
        withdrawals[targetBucket] += r.net;
        withdrawalsGross[targetBucket] += r.gross;
        if (s === "pension") { pensionExtra.net += r.net; pensionExtra.gross += r.gross; pensionExtra.tax += r.tax; }
        if (s === "holding") { holdingExtra.net += r.net; holdingExtra.gross += r.gross; holdingExtra.tax += r.tax; }
        needed -= r.net;
      }
      if (needed > 0 && inp.free.bufferUsableForShortfall && bal.buffer > 0) {
        const take = Math.min(bal.buffer, needed);
        bal.buffer -= take;
        withdrawals.buffer += take;
        withdrawalsGross.buffer += take;
        needed -= take;
      }
    };

    const drainShortfallLegacy = (needed: number) => {
      // proRata: når depotTax aktiv og både holding og free er i drain-order,
      // split første pass proportionalt mellem dem efter disponible saldi.
      if (
        depotTaxActive &&
        fundingStrategy === "proRata" &&
        needed > 0 &&
        order.includes("holding") &&
        order.includes("free") &&
        bal.holding > 0 &&
        bal.free > 0
      ) {
        const total = bal.holding + bal.free;
        const holdingShare = needed * (bal.holding / total);
        const freeShare = needed - holdingShare;
        for (const [b, share] of [["holding", holdingShare], ["free", freeShare]] as const) {
          if (share <= 0) continue;
          const r = withdrawFromBucket(b, share, bal, a, rateTaxRate, askStrategy, trackAskWithdraw, trackDepotWithdraw, depotTaxState);
          withdrawals[b] += r.netCovered;
          withdrawalsGross[b] += r.gross;
          if (b === "holding") {
            holdingExtra.net += r.netCovered;
            holdingExtra.gross += r.gross;
            holdingExtra.tax += r.tax;
          }
          needed -= r.netCovered;
        }
      }
      for (const b of order) {
        if (needed <= 0) break;
        const r = withdrawFromBucket(b, needed, bal, a, rateTaxRate, askStrategy, trackAskWithdraw, trackDepotWithdraw, depotTaxState);

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

    const drainShortfall = cwActive ? drainShortfallCW : drainShortfallLegacy;



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
        if (toDepot > 0) {
          bal.free += toDepot;
          depotContributionYear += toDepot;
          if (depotTaxState) depotTaxState.costBasis += toDepot;
        }
      } else {
        bal.free += amount;
        depotContributionYear += amount;
        if (depotTaxState) depotTaxState.costBasis += amount;
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
      const lvDelta = lifeEventEffects.freeCapitalDelta;
      if (depotTaxState && lvDelta !== 0) {
        if (lvDelta > 0) {
          // Tilskud — behandles som indskud til cost basis
          depotTaxState.costBasis += lvDelta;
          depotContributionYear += lvDelta;
        } else if (bal.free > 0) {
          // Negativt one-time uttræk — reducer kostpris proportionalt (ingen skattepåvirkning i v1)
          const ratio = Math.min(1, -lvDelta / bal.free);
          depotTaxState.costBasis = Math.max(0, depotTaxState.costBasis * (1 - ratio));
        }
      }
      bal.free = Math.max(0, bal.free + lvDelta);
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

    // Årlig aktieindkomstskat af positivt depot-afkast (kun annualShareIncomeTax).
    let annualDepotTax = 0;
    if (depotTaxState && depotTaxMethod === "annualShareIncomeTax" && freeDepotGrowth > 0) {
      const r = applyShareIncomeTax(depotTaxState.ctx, freeDepotGrowth);
      annualDepotTax = r.tax;
      bal.free = Math.max(0, bal.free - annualDepotTax);
    }

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
        askCarryForward += -askGrowthGross;
      }
      bal.ask = Math.max(0, bal.ask + askGrowthGross - askTax);
    }

    const growth = {
      free: freeDepotGrowth - annualDepotTax + (askActive ? askGrowthGross - askTax : 0),
      pension: bal.pension * a.realReturn.pension,
      holding: bal.holding * a.realReturn.holding,
    };
    bal.pension += growth.pension;
    bal.holding += growth.holding;

    // Synkronisér depot-kostpris-state tilbage til persistent variable for næste år.
    if (depotTaxState) depotCostBasis = depotTaxState.costBasis;


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
        shareIncome: depotTaxState ? (() => {
          const ctx = depotTaxState.ctx;
          const holdingGrossTotal = holdingPlanned.gross + holdingExtra.gross;
          const thresholdUsedByHolding = Math.min(holdingGrossTotal, ctx.threshold);
          const thresholdRemainingForDepot = Math.max(0, ctx.threshold - thresholdUsedByHolding);
          const realizedDepotGain = depotTaxState.realizedGainAcc;
          const annualDepotTaxable = depotTaxMethod === "annualShareIncomeTax" ? Math.max(0, freeDepotGrowth) : 0;
          const totalShareIncome = ctx.used;
          const taxedAtLow = Math.min(totalShareIncome, ctx.threshold);
          const taxedAtHigh = Math.max(0, totalShareIncome - ctx.threshold);
          const holdingTotalGross = holdingPlanned.gross + holdingExtra.gross;
          const holdingTotalTax = holdingPlanned.tax + holdingExtra.tax;
          const fundedFromHolding = holdingPlanned.net + holdingExtra.net;
          const fundedFromDepot = depotTaxState.grossSaleAcc - depotTaxState.saleTaxAcc;
          const taxAllocatedHolding = holdingTotalGross > 0
            ? (ctx.taxLow + ctx.taxHigh) * (holdingTotalGross / Math.max(1e-9, holdingTotalGross + realizedDepotGain + annualDepotTaxable))
            : 0;
          const taxAllocatedDepot = (ctx.taxLow + ctx.taxHigh) - taxAllocatedHolding;
          // Fald tilbage til faktiske skattetal når muligt (mere præcist end pro-rata):
          const taxAllocatedHoldingExact = Math.min(holdingTotalTax, ctx.taxLow + ctx.taxHigh);
          const taxAllocatedDepotExact = Math.max(0, ctx.taxLow + ctx.taxHigh - taxAllocatedHoldingExact);
          return {
            threshold: ctx.threshold,
            lowRate: ctx.lowRate,
            highRate: ctx.highRate,
            holdingGross: holdingPlanned.gross,
            extraHoldingGross: holdingExtra.gross,
            realizedDepotGain,
            annualDepotTaxable,
            totalShareIncome,
            taxedAtLow,
            taxedAtHigh,
            taxLow: ctx.taxLow,
            taxHigh: ctx.taxHigh,
            taxTotal: ctx.taxLow + ctx.taxHigh,
            thresholdUsedByHolding,
            thresholdRemainingForDepot,
            fundingStrategy,
            fundedFromHolding,
            fundedFromDepot,
            taxAllocatedHolding: taxAllocatedHoldingExact || taxAllocatedHolding,
            taxAllocatedDepot: taxAllocatedDepotExact || taxAllocatedDepot,
          };
        })() : undefined,
        depot: depotTaxState ? (() => {
          const opening = depotPrimo;
          const costBasisOpening = depotCostBasisPrimo;
          const unrealizedGainOpening = Math.max(0, opening - costBasisOpening);
          const effRate = ctxEffectiveRate(depotTaxState.ctx);
          const deferredTaxOpening = unrealizedGainOpening * effRate;
          const closing = bal.free;
          const costBasisClosing = depotTaxState.costBasis;
          const unrealizedGainClosing = Math.max(0, closing - costBasisClosing);
          const deferredTaxClosing = unrealizedGainClosing * effRate;
          return {
            method: depotTaxMethod,
            opening,
            costBasisOpening,
            unrealizedGainOpening,
            deferredTaxOpening,
            contribution: depotContributionYear,
            growthGross: freeDepotGrowth,
            annualTax: annualDepotTax,
            grossSale: depotTaxState.grossSaleAcc,
            realizedGain: depotTaxState.realizedGainAcc,
            saleTax: depotTaxState.saleTaxAcc,
            netToCashflow: depotTaxState.grossSaleAcc - depotTaxState.saleTaxAcc,
            costBasisReduction: depotTaxState.costBasisReductionAcc,
            closing,
            costBasisClosing,
            unrealizedGainClosing,
            deferredTaxClosing,
          };
        })() : undefined,
        capitalWithdrawal: cwAudit ? (() => {
          // Sum totals fra per-source breakdown.
          const sources: CapitalSource[] = ["depot", "holding", "ask", "pension"];
          let tg = 0, tn = 0, tt = 0;
          for (const s of sources) {
            tg += cwAudit.grossBySource[s];
            tn += cwAudit.netBySource[s];
            tt += cwAudit.taxBySource[s];
          }
          cwAudit.totalGross = tg;
          cwAudit.totalNet = tn;
          cwAudit.totalTax = tt;
          if (cwAudit.effectiveOrder.length === 0) {
            cwAudit.effectiveOrder = resolveOrder(cw!.strategy, cw!.customOrder);
          }
          return cwAudit;
        })() : undefined,

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
