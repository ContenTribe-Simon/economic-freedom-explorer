import { TaxAssumptions } from "./types";

/** Beregner nettoløn fra bruttoløn (DK forsimplet). */
export function laborTax(gross: number, t: TaxAssumptions): { net: number; tax: number } {
  if (gross <= 0) return { net: 0, tax: 0 };
  const am = gross * t.amBidrag;
  const afterAm = gross - am;
  const taxable = Math.max(0, afterAm - t.personalAllowance);
  const bottomPart = Math.min(taxable, Math.max(0, t.laborTopBracket - t.personalAllowance));
  const topPart = Math.max(0, taxable - bottomPart);
  const incomeTax = bottomPart * t.laborBottomRate + topPart * t.laborTopRate;
  const totalTax = am + incomeTax;
  return { net: gross - totalTax, tax: totalTax };
}

/** Aktieindkomstskat (udbytte fra holding, frie aktier). */
export function shareTax(amount: number, t: TaxAssumptions): { net: number; tax: number } {
  if (amount <= 0) return { net: 0, tax: 0 };
  const low = Math.min(amount, t.shareThreshold);
  const high = Math.max(0, amount - t.shareThreshold);
  const tax = low * t.shareLowRate + high * t.shareHighRate;
  return { net: amount - tax, tax };
}

/** Pensionsudbetaling - flad afgift med eksplicit sats (lokal pr. spor). */
export function pensionPayoutTax(amount: number, rate: number): { net: number; tax: number } {
  if (amount <= 0) return { net: 0, tax: 0 };
  const tax = amount * rate;
  return { net: amount - tax, tax };
}

/** Hvor meget brutto skal der hæves fra fri kapital for at få `targetNet` netto?
 *  Antagelse: udtræk fra fri kapital er (forsimplet) skattefrit (allerede beskattede midler).
 *  Aktieavance ignoreres i MVP – kan tilføjes som effektiv sats senere.
 */
export function grossFromFreeForNet(net: number): number {
  return net;
}

/** Hvor meget brutto fra holding-udlodning for at få `net` netto. Invers af shareTax. */
export function grossHoldingForNet(net: number, t: TaxAssumptions): number {
  if (net <= 0) return 0;
  const lowNet = t.shareThreshold * (1 - t.shareLowRate);
  if (net <= lowNet) return net / (1 - t.shareLowRate);
  const remaining = net - lowNet;
  return t.shareThreshold + remaining / (1 - t.shareHighRate);
}

/** Hvor meget brutto fra pension for at få `net` netto. Sats er lokal pr. spor. */
export function grossPensionForNet(net: number, rate: number): number {
  if (net <= 0) return 0;
  return net / (1 - rate);
}

/**
 * Per-år kontekst for personlig aktieindkomst-pulje.
 * Holdingudlodning og realiserede depotgevinster deler 27/42 %-grænsen.
 * Brugt KUN når depotTax.enabled (ellers bevares legacy-adfærd via shareTax).
 */
export interface ShareIncomeCtx {
  threshold: number;
  lowRate: number;
  highRate: number;
  /** Akkumuleret aktieindkomst brugt af tidligere kilder i året. */
  used: number;
  /** Akkumuleret skat i den lave sats. */
  taxLow: number;
  /** Akkumuleret skat i den høje sats. */
  taxHigh: number;
}

export function newShareIncomeCtx(t: TaxAssumptions): ShareIncomeCtx {
  return {
    threshold: t.shareThreshold,
    lowRate: t.shareLowRate,
    highRate: t.shareHighRate,
    used: 0,
    taxLow: 0,
    taxHigh: 0,
  };
}

/** Påfør en aktieindkomstkilde til puljen. Returnerer skat opdelt på lav/høj sats. */
export function applyShareIncomeTax(
  ctx: ShareIncomeCtx,
  gross: number,
): { tax: number; net: number; atLow: number; atHigh: number } {
  if (gross <= 0) return { tax: 0, net: 0, atLow: 0, atHigh: 0 };
  const remainingLow = Math.max(0, ctx.threshold - ctx.used);
  const atLow = Math.min(gross, remainingLow);
  const atHigh = Math.max(0, gross - atLow);
  const taxLow = atLow * ctx.lowRate;
  const taxHigh = atHigh * ctx.highRate;
  const tax = taxLow + taxHigh;
  ctx.used += gross;
  ctx.taxLow += taxLow;
  ctx.taxHigh += taxHigh;
  return { tax, net: gross - tax, atLow, atHigh };
}

/**
 * Beregn brutto salg fra almindeligt depot for at dække et givet netto-behov,
 * når kun gevinstandelen beskattes som aktieindkomst med 27/42 %-grænse.
 *
 * Lukker form (analytisk løsning):
 *   - Lav-gren: s ≤ thresholdRemaining/gainRatio
 *     net = s (1 − g·lowRate)
 *   - Høj-gren: net = s (1 − g·highRate) + thresholdRemaining (highRate − lowRate)
 *
 * Salg cappes til depotMax — så netCovered kan blive < netNeeded (resten dækkes af ASK/andre buckets).
 */
export function grossSaleForNetNeeded(
  netNeeded: number,
  gainRatio: number,
  thresholdRemaining: number,
  lowRate: number,
  highRate: number,
  depotMax: number,
): { sale: number; tax: number; realizedGain: number; atLow: number; atHigh: number } {
  if (netNeeded <= 0 || depotMax <= 0) {
    return { sale: 0, tax: 0, realizedGain: 0, atLow: 0, atHigh: 0 };
  }
  if (gainRatio <= 0) {
    const sale = Math.min(depotMax, netNeeded);
    return { sale, tax: 0, realizedGain: 0, atLow: 0, atHigh: 0 };
  }
  const sLowBoundary = thresholdRemaining > 0 ? thresholdRemaining / gainRatio : 0;
  const sLowFactor = 1 - gainRatio * lowRate;
  // Forsøg lav-gren først
  const sLowCandidate = sLowFactor > 0 ? netNeeded / sLowFactor : Infinity;
  if (sLowCandidate <= sLowBoundary + 1e-9) {
    const sale = Math.min(depotMax, sLowCandidate);
    const realizedGain = sale * gainRatio;
    const atLow = Math.min(realizedGain, thresholdRemaining);
    const atHigh = Math.max(0, realizedGain - thresholdRemaining);
    const tax = atLow * lowRate + atHigh * highRate;
    return { sale, tax, realizedGain, atLow, atHigh };
  }
  // Høj-gren
  const highFactor = 1 - gainRatio * highRate;
  const numerator = netNeeded - thresholdRemaining * (highRate - lowRate);
  const sHighCandidate = highFactor > 0 ? numerator / highFactor : Infinity;
  const sale = Math.min(depotMax, Math.max(sHighCandidate, sLowBoundary));
  const realizedGain = sale * gainRatio;
  const atLow = Math.min(realizedGain, thresholdRemaining);
  const atHigh = Math.max(0, realizedGain - thresholdRemaining);
  const tax = atLow * lowRate + atHigh * highRate;
  return { sale, tax, realizedGain, atLow, atHigh };
}

