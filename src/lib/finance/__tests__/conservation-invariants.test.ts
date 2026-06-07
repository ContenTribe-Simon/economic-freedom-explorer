import { describe, expect, it } from "vitest";
import { defaultAssumptions, makeBaseScenario } from "../defaults";
import { project } from "../projection";
import type { Assumptions } from "../types";

/**
 * Konservering: negativt cashflow i opsparingsfasen må ALDRIG "skabe penge".
 *
 * I en verden uden afkast og uden eksterne tilførsler er identiteten:
 *
 *     closingNetWorth === openingNetWorth + cashflowBeforeSavings
 *
 * Når årets cashflow før opsparing er negativt, skal nettoformuen falde med
 * præcis underskuddet — underskuddet skal dækkes ved at tappe en formuepost
 * (buffer/depot/...), ikke ved at lade som om pengene aldrig blev brugt.
 *
 * Testen isolerer udelukkende dette: alle realafkast er 0, der er ingen gæld,
 * ingen livsbegivenheder, ingen kapitaludtræk og ingen pensionsstrømme
 * (hverken ind- eller udbetalinger), så det eneste der kan flytte nettoformuen
 * væk fra opening + cashflow ville være "skabte" eller "tilintetgjorte" penge.
 */

// Alle realafkast sat til 0 ⇒ ingen vækst i nogen pulje (ASK arver free-afkastet).
const zeroReturnAssumptions: Assumptions = {
  ...defaultAssumptions,
  realReturn: { free: 0, pension: 0, holding: 0 },
};

/** Nettoformue af et åbnings-/lukkesaldosæt: aktiver minus gæld. */
function netWorthOf(b: { free: number; pension: number; holding: number; buffer: number; debt: number }): number {
  return b.free + b.pension + b.holding + b.buffer - b.debt;
}

describe("Konservering — negativt cashflow i opsparingsfasen kan ikke skabe penge", () => {
  it("nettoformuen falder med præcis underskuddet (closing ≈ opening + cashflow)", () => {
    const s = makeBaseScenario();

    // Kendte, rene åbningssaldi.
    s.inputs.free.balance = 500000;
    s.inputs.pension.balance = 800000;
    s.inputs.holding.balance = 1000000;

    // Buffer med kendt startsaldo, der rigeligt dækker hele årets underskud.
    s.inputs.free.cashBuffer = 1000000;
    s.inputs.free.bufferUsableForShortfall = true;

    // Ingen gæld.
    s.inputs.debts = [];

    // Ingen pensionsstrømme: hverken ind- eller udbetalinger må flytte nettoformue
    // uden om cashflow-broen.
    s.inputs.pension.monthlyContribution = 0;
    s.inputs.pension.employerContribution = 0;

    // Planlagt opsparing (planned-metoden) med useBuffer-politik.
    s.inputs.free.monthlyContribution = 10000;
    s.inputs.free.annualExtraContribution = 50000;
    s.inputs.cashflowAllocation = {
      surplusPolicy: "outOfModel",
      bufferTarget: null,
      plannedInvestmentMethod: "planned",
      plannedShortfallPolicy: "useBuffer",
    };

    // Forbrug højt nok til at cashflow før opsparing i år 0 bliver klart negativt.
    s.inputs.spending.desiredMonthlyNet = 100000;

    const y0 = project(s, zeroReturnAssumptions)[0];

    const openingNetWorth = netWorthOf(y0.opening);
    const closingNetWorth = netWorthOf(y0.closing);
    const cashflow = y0.flows.cashflowBridge!.cashflowBeforeSavings;

    // Forudsætning: vi er reelt i et negativt-cashflow-tilfælde.
    expect(cashflow).toBeLessThan(0);

    // KONSERVERING: nettoformuen skal falde med præcis underskuddet.
    expect(closingNetWorth).toBeCloseTo(openingNetWorth + cashflow, 1);
  });
});

describe("Buffer-politik ved negativt cashflow (bufferUsableForShortfall)", () => {
  /**
   * Fælles opsætning: ren opsparingsfase (alder 40), planned-metode, klart negativt
   * cashflow, ingen afkast, ingen gæld og ingen pensionsstrømme. Hvilke andre
   * kapitalkilder der findes styres via free/holding-saldi i den enkelte test.
   *
   * Vigtigt: plannedShortfallPolicy="useBuffer" er sat med vilje. Den politik gælder
   * KUN opsparings-shortfall (positivt cashflow under det planlagte beløb) og må
   * ALDRIG dræne buffer ved et negativt forbrugs-cashflow — dér er
   * inp.free.bufferUsableForShortfall den eneste kontrol.
   */
  function negativeCashflowScenario() {
    const s = makeBaseScenario();
    s.inputs.pension.balance = 0;
    s.inputs.pension.monthlyContribution = 0;
    s.inputs.pension.employerContribution = 0;
    s.inputs.holding.balance = 0;
    s.inputs.debts = [];
    s.inputs.spending.desiredMonthlyNet = 100000; // langt over indkomsten ⇒ negativt cashflow
    s.inputs.cashflowAllocation = {
      surplusPolicy: "outOfModel",
      bufferTarget: null,
      plannedInvestmentMethod: "planned",
      plannedShortfallPolicy: "useBuffer",
    };
    return s;
  }

  it("A: bufferUsableForShortfall=false + ingen anden kapital ⇒ buffer urørt, underskud vises som shortfall", () => {
    const s = negativeCashflowScenario();
    s.inputs.free.balance = 0; // ingen fri kapital at tappe
    s.inputs.free.cashBuffer = 300000; // buffer findes, men må ikke bruges
    s.inputs.free.bufferUsableForShortfall = false;

    const y0 = project(s, zeroReturnAssumptions)[0];
    const deficit = -y0.flows.cashflowBridge!.cashflowBeforeSavings;

    expect(deficit).toBeGreaterThan(0);
    // Ingen planlagt investering finansieret ud af et underskud.
    expect(y0.flows.investedAmount).toBeLessThanOrEqual(0.5);
    // Bufferen er IKKE rørt (bufferUsableForShortfall=false), selv om useBuffer er sat.
    expect(y0.closing.buffer).toBeCloseTo(y0.opening.buffer, 1);
    expect(y0.flows.withdrawals.buffer).toBeCloseTo(0, 1);
    // Hele underskuddet fremgår som reelt shortfall — ikke skjult / "skabte penge".
    expect(y0.shortfallAmount).toBeCloseTo(deficit, 1);
  });

  it("B: bufferUsableForShortfall=true ⇒ buffer dækker underskuddet, intet shortfall", () => {
    const s = negativeCashflowScenario();
    s.inputs.free.balance = 0;
    s.inputs.free.cashBuffer = 1500000; // rigeligt til at dække underskuddet
    s.inputs.free.bufferUsableForShortfall = true;

    const y0 = project(s, zeroReturnAssumptions)[0];
    const deficit = -y0.flows.cashflowBridge!.cashflowBeforeSavings;

    expect(deficit).toBeGreaterThan(0);
    // Buffer reduceret med præcis underskuddet (op til tilgængelig buffer).
    expect(y0.closing.buffer).toBeCloseTo(y0.opening.buffer - deficit, 1);
    expect(y0.flows.withdrawals.buffer).toBeCloseTo(deficit, 1);
    // Buffer dækkede alt ⇒ intet restshortfall.
    expect(y0.shortfallAmount).toBeLessThanOrEqual(0.5);
  });

  it("C: anden tilladt kapital findes + bufferUsableForShortfall=false ⇒ kapital dækker, buffer urørt", () => {
    const s = negativeCashflowScenario();
    s.inputs.free.balance = 2000000; // fri kapital kan dække underskuddet
    s.inputs.free.cashBuffer = 300000; // buffer findes, men er ikke tilladt til shortfall
    s.inputs.free.bufferUsableForShortfall = false;

    const y0 = project(s, zeroReturnAssumptions)[0];
    const deficit = -y0.flows.cashflowBridge!.cashflowBeforeSavings;

    expect(deficit).toBeGreaterThan(0);
    // Underskuddet dækket via udtræks-rækkefølgen (fri kapital), ikke buffer.
    expect(y0.closing.free).toBeCloseTo(y0.opening.free - deficit, 1);
    expect(y0.closing.buffer).toBeCloseTo(y0.opening.buffer, 1);
    expect(y0.flows.withdrawals.buffer).toBeCloseTo(0, 1);
    expect(y0.shortfallAmount).toBeLessThanOrEqual(0.5);
  });
});
