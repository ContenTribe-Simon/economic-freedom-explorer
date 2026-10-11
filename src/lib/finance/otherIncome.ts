import { laborTax } from "./tax";
import type { IncomeInputs, OtherIncome, TaxAssumptions, YearFlows } from "./types";

/**
 * "Anden indtægt" (erstatter familiefond-feltet). En liste, hvor brugeren selv navngiver sine
 * indtægter og vælger om beløbet er netto eller beskattes som løn.
 */

/** Felterne fra før listen fandtes; kun til at læse gemte modeller. */
interface LegacyFamilyFund {
  familyFundAnnualNet?: number;
  familyFundUntilAge?: number;
}

export const LEGACY_FAMILY_FUND_ID = "legacy-family-fund";

/**
 * Indtægtslisten for et sæt inputs. Har inputs endnu ikke en liste (gemt før v18: snapshots,
 * cloud-modeller, eksporter), bliver et gammelt familiefond-beløb til én netto-post, der løber
 * fra start til den gamle slutalder. Det regner præcis som den gamle formel
 * `age < familyFundUntilAge ? familyFundAnnualNet : 0`.
 */
export function otherIncomesOf(income: IncomeInputs): OtherIncome[] {
  if (Array.isArray(income.otherIncomes)) return income.otherIncomes;
  const legacy = income as unknown as LegacyFamilyFund;
  const amount = legacy.familyFundAnnualNet ?? 0;
  if (!(amount > 0)) return [];
  return [
    {
      id: LEGACY_FAMILY_FUND_ID,
      name: "Familiefond",
      annualAmount: amount,
      taxation: "net",
      fromAge: 0,
      untilAge: legacy.familyFundUntilAge ?? 70,
    },
  ];
}

/** Gemte indkomst-inputs i den nye form: listen udfyldt, de gamle felter fjernet. */
export function normalizeIncomeInputs(income: IncomeInputs): IncomeInputs {
  const otherIncomes = otherIncomesOf(income);
  const { familyFundAnnualNet: _a, familyFundUntilAge: _b, ...rest } = income as IncomeInputs & LegacyFamilyFund;
  return { ...rest, otherIncomes };
}

/** Andre indtægter i et givet år: netto til cashflow og skat (for brutto-poster). */
export function otherIncomeForAge(
  income: IncomeInputs,
  age: number,
  tax: TaxAssumptions,
): { net: number; tax: number } {
  let net = 0;
  let taxAmt = 0;
  for (const item of otherIncomesOf(income)) {
    const amount = Number.isFinite(item.annualAmount) ? Math.max(0, item.annualAmount) : 0;
    if (amount === 0 || age < item.fromAge || age >= item.untilAge) continue;
    if (item.taxation === "gross_labor") {
      const r = laborTax(amount, tax);
      net += r.net;
      taxAmt += r.tax;
    } else {
      net += amount;
    }
  }
  return { net, tax: taxAmt };
}

/**
 * Andre indtægter netto fra en årsrække. Frosne årsrækker i snapshots gemt før v18 har feltet
 * `familyFundNet` i stedet; de læses som det samme.
 */
export function otherIncomeNetOf(flows: YearFlows): number {
  return flows.otherIncomeNet ?? (flows as unknown as { familyFundNet?: number }).familyFundNet ?? 0;
}
