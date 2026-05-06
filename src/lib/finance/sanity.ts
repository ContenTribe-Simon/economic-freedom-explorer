import { Scenario, SanityCheck, YearRow } from "./types";

export function sanityChecks(scenario: Scenario, years: YearRow[]): SanityCheck[] {
  const out: SanityCheck[] = [];
  const inp = scenario.inputs;
  const thisYear = new Date().getFullYear();

  // Folkepension manuelt netto virker højt vs. grundbeløb
  const sp = inp.income.statePension;
  if (sp.mode === "manualNet" && sp.manualNetAnnual > 80000) {
    out.push({
      id: "sp-manual-high",
      severity: "warn",
      title: "Folkepension netto virker høj",
      detail: `Du bruger manuelt nettobeløb på ${sp.manualNetAnnual.toLocaleString("da-DK")} kr/år. Grundbeløbet 2026 er ca. 90.528 kr brutto/år — netto vil typisk ligge på 55-65.000 kr afhængigt af effektiv skat.`,
    });
  }

  // Exit-år langt ude
  if (inp.holding.expectedExitValue > 0) {
    const yrsToExit = inp.holding.exitYear - thisYear;
    if (yrsToExit > 7) {
      out.push({
        id: "exit-far",
        severity: "warn",
        title: `Holding-exit ligger ${yrsToExit} år ude`,
        detail: "Forventet exit længere ude end 3-7 år har stor usikkerhed. Overvej at stress-teste uden exit.",
      });
    }
    // Overlap mellem nuværende holdingkapital og exit-værdi
    if (inp.holding.balance > 500000 && inp.holding.expectedExitValue > 0) {
      out.push({
        id: "holding-overlap",
        severity: "info",
        title: "Holdingkapital og exitværdi kan overlappe",
        detail: `Du har både ${(inp.holding.balance / 1000).toFixed(0)}k kr i holdingkapital og forventer ${(inp.holding.expectedExitValue / 1000).toFixed(0)}k kr ved exit. Tjek at exitværdien ikke allerede er regnet med i nuværende saldo.`,
      });
    }
  }

  // Planlagt opsparing > cashflow i nogle år
  const negCashflow = years.filter(
    (y) => y.age < inp.stopAge && y.flows.cashflowSurplus < 0,
  );
  if (negCashflow.length > 0 && inp.savingsLogic === "planned") {
    out.push({
      id: "planned-over-cashflow",
      severity: "warn",
      title: `Planlagt opsparing overstiger cashflow i ${negCashflow.length} år`,
      detail: "Med 'Planlagt' logik investeres kun det cashflow tillader. Skift til 'Hybrid' for at se underskud tydeligt.",
    });
  }

  // Robusthed afhænger af holding/exit
  const yEnd = years[years.length - 1];
  const totalEnd = Math.max(1, yEnd.closing.free + yEnd.closing.pension + yEnd.closing.holding);
  if (yEnd.closing.holding / totalEnd > 0.5) {
    out.push({
      id: "holding-dependency",
      severity: "warn",
      title: "Slutformue afhænger kraftigt af holding",
      detail: `${Math.round((yEnd.closing.holding / totalEnd) * 100)} % af din slutformue ligger i holding. Stress-test 'No Barma' for at se konsekvensen.`,
    });
  }

  // Deltid i brutto/år men lille beløb (måske netto/md ved en fejl)
  const pt = inp.income.partTime;
  if (pt.mode === "gross_annual" && pt.grossAnnual > 0 && pt.grossAnnual < 50000) {
    out.push({
      id: "parttime-low-gross",
      severity: "warn",
      title: "Deltidsindtægt virker lav som brutto/år",
      detail: `${pt.grossAnnual.toLocaleString("da-DK")} kr/år ligner måske et netto/md-beløb. Skift evt. til 'Netto/md'.`,
    });
  }

  // Deltid starter senere end stopalder
  if (pt.fromAge > inp.stopAge) {
    const gap = pt.fromAge - inp.stopAge;
    out.push({
      id: "parttime-late-start",
      severity: "warn",
      title: `Deltidsindtægt starter først ${gap} år efter fuldtidsstop`,
      detail: `Stopalder er ${inp.stopAge}, men deltid starter ved ${pt.fromAge}. Tjek om dette er bevidst — i mellemtiden er der ingen aktiv indkomst ud over evt. familiefond.`,
    });
  }

  // Personlig hæftelse vs holdinggæld — mulig dobbeltregning
  const liabilities = inp.debts.filter((d) => d.kind === "personal_liability" && d.balance > 0);
  const holdingDebts = inp.debts.filter((d) => d.kind === "holding" && d.balance > 0);
  for (const liab of liabilities) {
    const match = holdingDebts.find((h) => Math.abs(h.balance - liab.balance) < 1000);
    if (match && liab.linkedDebtId !== match.id) {
      out.push({
        id: `liab-double-${liab.id}`,
        severity: "warn",
        title: "Personlig hæftelse kan være knyttet til holdinggælden",
        detail: `"${liab.name}" (${liab.balance.toLocaleString("da-DK")} kr) har samme beløb som "${match.name}". Tjek at beløbet ikke dobbeltregnes — koble evt. hæftelsen til den underliggende gældspost via "Knyttet til gældspost".`,
      });
    }
  }

  // Holdinggæld finansieret af holdingkapital — men holdingkapitalen er tom
  const hsYears = years.filter((y) => y.flows.holdingFinancingShortfall > 0);
  if (hsYears.length > 0) {
    const total = hsYears.reduce((s, y) => s + y.flows.holdingFinancingShortfall, 0);
    out.push({
      id: "holding-financing-short",
      severity: "error",
      title: "Holdinggæld kan ikke betales af holdingkapital",
      detail: `I ${hsYears.length} år forsøges afdrag på holdinggæld via holdingkapital uden tilstrækkelig dækning (i alt ${total.toLocaleString("da-DK")} kr). Modellen lader gælden stå indtil der er dækning. Scenariet er ikke fuldt validt, før finansiering af holdinggæld er afklaret — vælg fx "Privat cashflow", "Ekstern selskabscashflow" eller "Afdrages ved exit".`,
    });
  }

  // Privat pension info
  const la = inp.pension.lifeAnnuity;
  const rateOn = inp.pension.ratePensionEnabled ?? true;
  out.push({
    id: "private-pension-note",
    severity: "info",
    title: "Pensionsspor: ratepension + livsvarig pension",
    detail: `Ratepension ${rateOn ? "AKTIV" : "deaktiveret"}${rateOn ? ` — udbetales over ${inp.pension.ratePensionPayoutYears ?? 15} år fra alder ${inp.pension.payoutFromAge}` : ""}. Livsvarig pension ${la?.enabled ? `AKTIV — ${la.mode === "gross" ? `${(la.annualGross || 0).toLocaleString("da-DK")} kr brutto/år` : `${(la.annualNet || 0).toLocaleString("da-DK")} kr netto/år`} fra alder ${la.fromAge}, fortsætter til levealder ${inp.person.lifeExpectancy}` : "deaktiveret"}.`,
  });

  return out;
}
