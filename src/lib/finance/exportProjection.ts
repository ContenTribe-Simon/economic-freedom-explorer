import type { Scenario, Assumptions, YearRow } from "./types";
import type { FireAnalysis } from "./fire";

export interface ProjectionExport {
  exportedAt: string;
  modelVersion: number;
  scenario: {
    id: string;
    name: string;
    type?: string;
    baseScenarioId?: string;
    baseScenarioName?: string;
    modifiers?: Record<string, boolean | undefined>;
    manuallyEdited?: boolean;
  };
  inputs: unknown;
  assumptions: unknown;
  years: YearRow[];
  fire?: FireAnalysis;
}

/**
 * Build the full JSON export of a projection. Pure function — no side effects.
 * Safe to JSON.stringify (no circular refs; YearRow only contains numbers/objects).
 */
export function buildProjectionExport(
  scenario: Scenario,
  assumptions: Assumptions,
  years: YearRow[],
  fire?: FireAnalysis,
): ProjectionExport {
  return {
    exportedAt: new Date().toISOString(),
    modelVersion: 1,
    scenario: {
      id: scenario.id,
      name: scenario.name,
      type: scenario.type,
      baseScenarioId: scenario.baseScenarioId,
      baseScenarioName: scenario.baseScenarioName,
      modifiers: scenario.modifiers,
      manuallyEdited: scenario.manuallyEdited,
    },
    inputs: scenario.inputs,
    assumptions,
    years,
    fire,
  };
}

/** Build one full audit JSON for a single year (used by "Kopiér audit JSON"-knappen). */
export function buildYearAuditJson(scenario: Scenario, year: YearRow): string {
  const payload = {
    exportedAt: new Date().toISOString(),
    scenario: { id: scenario.id, name: scenario.name },
    age: year.age,
    yearIndex: year.yearIndex,
    opening: year.opening,
    closing: year.closing,
    totalIncomeNet: year.totalIncomeNet,
    netWorth: year.netWorth,
    shortfall: year.shortfall,
    shortfallAmount: year.shortfallAmount,
    monthlyGap: year.monthlyGap,
    flows: year.flows,
  };
  return JSON.stringify(payload, null, 2);
}

const CSV_COLUMNS = [
  "age",
  "incomeTotal",
  "spending",
  "cashflowBeforeSavings",
  "plannedInvestment",
  "actualInvestment",
  "surplusToBuffer",
  "surplusInvested",
  "surplusOutOfModel",
  "freeStart",
  "askStart",
  "depotStart",
  "askEnd",
  "depotEnd",
  "freeEnd",
  "bufferEnd",
  "pensionEnd",
  "holdingEnd",
  "debtEnd",
  "netWorth",
  "shareIncomeTax",
  "askTax",
  "shortfall",
  "plannedSavingsShortfall",
  "fireBaseCapital",
  "standardFiGap",
] as const;

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(Math.round(v)) : "") : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildProjectionCsv(years: YearRow[], fire?: FireAnalysis): string {
  const fireByAge = new Map<number, { fireBaseCapital: number; gapToStandardFi: number }>();
  if (fire) {
    for (const ys of fire.yearStatus) {
      fireByAge.set(ys.age, { fireBaseCapital: ys.fireBaseCapital, gapToStandardFi: ys.gapToStandardFi });
    }
  }
  const lines: string[] = [];
  lines.push(CSV_COLUMNS.join(","));
  for (const y of years) {
    const f = y.flows;
    const sa = f.surplusAllocation;
    const ps = f.plannedSavingsShortfall;
    const fr = fireByAge.get(y.age);
    const askStart = f.ask?.opening ?? 0;
    const depotStart = f.depot?.opening ?? 0;
    const askEnd = f.ask?.closing ?? 0;
    const depotEnd = f.depot?.closing ?? 0;
    const row: Record<(typeof CSV_COLUMNS)[number], number | string> = {
      age: y.age,
      incomeTotal: y.totalIncomeNet,
      spending: f.spending,
      cashflowBeforeSavings: f.cashflowBridge?.cashflowBeforeSavings ?? 0,
      plannedInvestment: f.plannedFreeContribution,
      actualInvestment: f.investedAmount,
      surplusToBuffer: sa?.toBuffer ?? 0,
      surplusInvested: sa?.toFreeInvestment ?? 0,
      surplusOutOfModel: sa?.outOfModel ?? 0,
      freeStart: y.opening.free,
      askStart,
      depotStart,
      askEnd,
      depotEnd,
      freeEnd: y.closing.free,
      bufferEnd: y.closing.buffer,
      pensionEnd: y.closing.pension,
      holdingEnd: y.closing.holding,
      debtEnd: y.closing.debt,
      netWorth: y.netWorth,
      shareIncomeTax: f.shareIncome?.taxTotal ?? 0,
      askTax: f.ask?.tax ?? 0,
      shortfall: y.shortfallAmount,
      plannedSavingsShortfall: ps?.unmetPlannedInvestment ?? 0,
      fireBaseCapital: fr?.fireBaseCapital ?? 0,
      standardFiGap: fr?.gapToStandardFi ?? 0,
    };
    lines.push(CSV_COLUMNS.map((c) => csvEscape(row[c])).join(","));
  }
  return lines.join("\n");
}

export const PROJECTION_CSV_COLUMNS = CSV_COLUMNS;
