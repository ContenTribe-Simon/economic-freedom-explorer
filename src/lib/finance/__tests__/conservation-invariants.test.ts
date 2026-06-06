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
