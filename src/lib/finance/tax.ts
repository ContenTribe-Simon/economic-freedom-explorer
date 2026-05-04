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

/** Pensionsudbetaling - flad afgift. */
export function pensionPayoutTax(amount: number, t: TaxAssumptions): { net: number; tax: number } {
  if (amount <= 0) return { net: 0, tax: 0 };
  const tax = amount * t.pensionPayoutRate;
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

/** Hvor meget brutto fra pension for at få `net` netto. */
export function grossPensionForNet(net: number, t: TaxAssumptions): number {
  if (net <= 0) return 0;
  return net / (1 - t.pensionPayoutRate);
}
