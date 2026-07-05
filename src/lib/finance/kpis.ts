import {
  Assumptions,
  ConfidenceFactor,
  ConfidenceKey,
  ConfidenceLevel,
  KPIs,
  Scenario,
  ScenarioConfidence,
  ScoreFactor,
  YearRow,
} from "./types";
import { findEarliestSustainableStopAge, mergeAssumptions } from "./projection";
import { defaultAssumptions } from "./defaults";

// ---- Confidence helpers (pure, no projection effect) ----
const LEVEL_VALUE: Record<ConfidenceLevel, number> = {
  very_high: 90,
  high: 70,
  low: 45,
  speculative: 20,
};

export const DEFAULT_CONFIDENCE: Required<ScenarioConfidence> = {
  salary: "very_high",
  partTime: "high",
  familyFund: "low",
  statePension: "high",
  ratePension: "very_high",
  lifeAnnuity: "very_high",
  holdingExit: "speculative",
  returns: "high",
  spending: "high",
};

export const CONFIDENCE_LABELS: Record<ConfidenceKey, string> = {
  salary: "Løn / arbejdsindkomst",
  partTime: "Deltidsindtægt",
  familyFund: "Familiefond",
  statePension: "Folkepension",
  ratePension: "Ratepension",
  lifeAnnuity: "Livsvarig pension/livrente",
  holdingExit: "Holding-exit / udlodning",
  returns: "Realafkast",
  spending: "Forbrug",
};

export const LEVEL_LABELS: Record<ConfidenceLevel, string> = {
  very_high: "Meget sikker",
  high: "Rimelig sikker",
  low: "Usikker",
  speculative: "Spekulativ",
};

export function getConfidence(scenario: Scenario): Required<ScenarioConfidence> {
  return { ...DEFAULT_CONFIDENCE, ...(scenario.inputs.confidence ?? {}) };
}

export function deriveKPIs(scenario: Scenario, years: YearRow[], assumptions: Assumptions = defaultAssumptions): KPIs {
  const stopAge = scenario.inputs.stopAge;
  const yAtStop = years.find((y) => y.age === stopAge);
  const yAt65 = years.find((y) => y.age === 65);
  // End-of-horizon anchor: the LAST projected YearRow, i.e. age === lifeExpectancy. This was
  // previously `find(age === 95) ?? last`, which silently anchored every end-horizon figure
  // (end margin, target check, holding share, capitalAt95) at the INTERIOR age 95 whenever
  // lifeExpectancy > 95 — contradicting the real horizon the target is defined against
  // ("Mindste nettoformue ved alder {lifeExpectancy}"). For lifeExpectancy <= 95 the old
  // fallback already returned the last row, so those horizons are unchanged by this fix.
  const yEnd = years[years.length - 1];

  const firstShort = years.find((y) => y.shortfall);
  const afterStopYears = years.filter((y) => y.age >= stopAge);
  const avgGap =
    afterStopYears.length > 0
      ? afterStopYears.reduce((s, y) => s + y.monthlyGap, 0) / afterStopYears.length
      : 0;

  const earliest = findEarliestSustainableStopAge(scenario, assumptions);
  const minRequired = scenario.inputs.target?.minNetWorthAtEnd ?? 0;
  const annualSpend = Math.max(1, scenario.inputs.spending.desiredMonthlyNet * 12);
  const inp = scenario.inputs;
  const a = mergeAssumptions(assumptions, scenario.assumptionsOverride);

  // ===== Financial robustness — failure-driven =====
  const breakdown: ScoreFactor[] = [];
  const criticalFactors: ScoreFactor[] = [];

  // ---- Kritiske fejl ----
  const hasShortfall = !!firstShort;
  const yearsAfterStop = firstShort ? firstShort.age - stopAge : null;

  // 1) Cashflow (35)
  let cashflowScore = 100;
  if (firstShort) {
    if (yearsAfterStop! < 0) cashflowScore = 0;
    else cashflowScore = Math.max(0, Math.min(100, yearsAfterStop! * 4));
    criticalFactors.push({
      label: `Cashflow-shortfall ved alder ${firstShort.age}`,
      detail: `Manglende dækning ${yearsAfterStop! < 0 ? `${-yearsAfterStop!} år før` : `${yearsAfterStop!} år efter`} planlagt stop (${stopAge}). Kritisk negativ effekt.`,
      impact: "negative",
      magnitude: "critical",
    });
  } else {
    breakdown.push({
      label: "Ingen cashflow-shortfall",
      detail: "Planlagt forbrug dækkes igennem hele perioden.",
      impact: "positive",
      magnitude: "high",
    });
  }
  if (avgGap > 0 && !firstShort) {
    cashflowScore -= Math.min(40, (avgGap / 5000) * 25);
    breakdown.push({
      label: `Månedligt hul efter stop: ${Math.round(avgGap).toLocaleString("da-DK")} kr`,
      detail: "Gennemsnitligt manglende månedligt nettobeløb efter planlagt stop.",
      impact: "negative",
      magnitude: avgGap > 10000 ? "high" : avgGap > 3000 ? "medium" : "low",
    });
  }
  cashflowScore = Math.max(0, cashflowScore);

  // 2) End margin vs minimum (25)
  const endMargin = (yEnd.netWorth - minRequired) / Math.max(1, annualSpend * 5);
  const targetMissedRatio = minRequired > 0 ? Math.max(0, minRequired - yEnd.netWorth) / minRequired : 0;
  const targetMissed = yEnd.netWorth + 0.5 < minRequired;
  let endScore: number;
  if (targetMissed) {
    endScore = 0;
    const missing = Math.max(0, minRequired - yEnd.netWorth);
    criticalFactors.push({
      label: `Minimumsmål ikke opfyldt – mangler ${Math.round(missing).toLocaleString("da-DK")} kr`,
      detail: `Slutformue ved alder ${yEnd.age} ligger ${Math.round(targetMissedRatio * 100)} % under minimumsmålet. Kritisk negativ effekt.`,
      impact: "negative",
      magnitude: "critical",
    });
  } else if (endMargin < 1) {
    endScore = Math.round(endMargin * 70);
    breakdown.push({
      label: "Lav margin til minimumsmål",
      detail: `Slutformue er kun ${Math.round(endMargin * 100)} % over minimumsmålet (mål: 5× årsforbrug i buffer).`,
      impact: "negative",
      magnitude: endMargin < 0.4 ? "high" : "medium",
    });
  } else {
    endScore = Math.min(100, 70 + endMargin * 10);
    breakdown.push({
      label: "Komfortabel slutmargin",
      detail: `Slutformue er ${endMargin.toFixed(1)}× over 5-års forbrugsmargin.`,
      impact: "positive",
      magnitude: "medium",
    });
  }

  // 3) Stress / sårbarhed (20)
  const totalEnd = Math.max(1, yEnd.closing.free + yEnd.closing.pension + yEnd.closing.holding);
  const holdingShare = yEnd.closing.holding / totalEnd;
  let stressScore = 100 - holdingShare * 60;
  const stressLabel = holdingShare > 0.4
    ? "Høj afhængighed af holdingværdi"
    : holdingShare > 0.2
      ? "Moderat afhængighed af holding"
      : "Lav afhængighed af holding";
  breakdown.push({
    label: stressLabel,
    detail: `Holding udgør ${Math.round(holdingShare * 100)} % af slutaktiverne.`,
    impact: holdingShare > 0.3 ? "negative" : "neutral",
    magnitude: holdingShare > 0.4 ? "high" : holdingShare > 0.2 ? "medium" : "low",
  });
  stressScore = Math.max(0, Math.min(100, stressScore));

  // 4) Likviditet/buffer (10)
  const bufferMonths = (inp.free.cashBuffer ?? 0) / Math.max(1, inp.spending.desiredMonthlyNet);
  let liqScore = Math.min(100, bufferMonths * 12);
  breakdown.push({
    label: bufferMonths >= 6 ? "Solid kontant buffer" : bufferMonths >= 3 ? "OK kontant buffer" : "Lav kontant buffer",
    detail: `Buffer svarer til ca. ${bufferMonths.toFixed(1)} måneders forbrug.`,
    impact: bufferMonths >= 3 ? "positive" : "negative",
    magnitude: bufferMonths >= 6 ? "low" : bufferMonths >= 3 ? "low" : "medium",
  });
  liqScore = Math.max(0, Math.min(100, liqScore));

  // 5) Få store kilder (10)
  const ptYearsAll = years.filter((y) => y.flows.partTimeNet > 0);
  const avgPt = ptYearsAll.length ? ptYearsAll.reduce((s, y) => s + y.flows.partTimeNet, 0) / ptYearsAll.length : 0;
  const ptShare = avgPt / annualSpend;
  let concentrationScore = 100 - Math.min(50, ptShare * 50) - Math.min(40, holdingShare * 40);
  concentrationScore = Math.max(0, Math.min(100, concentrationScore));

  let financial = Math.round(
    cashflowScore * 0.35 +
      endScore * 0.25 +
      stressScore * 0.20 +
      liqScore * 0.10 +
      concentrationScore * 0.10,
  );

  // ---- Failure caps ----
  if (hasShortfall) {
    // Jo tidligere shortfall, jo hårdere cap
    let cap = 25;
    if (yearsAfterStop !== null) {
      if (yearsAfterStop < 0) cap = 5;
      else if (yearsAfterStop <= 2) cap = 10;
      else if (yearsAfterStop <= 5) cap = 15;
      else if (yearsAfterStop <= 10) cap = 20;
      else cap = 25;
    }
    financial = Math.min(financial, cap);
  }
  if (targetMissed) {
    let cap = 40;
    if (targetMissedRatio > 0.5) cap = 30;
    if (targetMissedRatio > 0.25) cap = Math.min(cap, 35);
    financial = Math.min(financial, cap);
  }
  if (hasShortfall && targetMissed) {
    financial = Math.min(financial, 25);
  }
  financial = Math.max(0, Math.min(100, financial));

  // Sorter: kritiske altid øverst, derefter negative > neutral > positive efter magnitude
  const magOrder = { critical: 4, high: 3, medium: 2, low: 1 } as const;
  const ord = { negative: 0, neutral: 1, positive: 2 };
  const merged = [...criticalFactors, ...breakdown];
  const sortedBreakdown = merged.sort((x, y) => {
    const xCrit = x.magnitude === "critical" ? 0 : 1;
    const yCrit = y.magnitude === "critical" ? 0 : 1;
    if (xCrit !== yCrit) return xCrit - yCrit;
    if (x.impact !== y.impact) return ord[x.impact] - ord[y.impact];
    return magOrder[y.magnitude] - magOrder[x.magnitude];
  }).slice(0, 5);

  const robustnessSummary = (() => {
    const top = sortedBreakdown.find((b) => b.impact === "negative");
    if (top) return `Trækkes især ned af: ${top.label.toLowerCase()}.`;
    return "Scenariet hænger godt sammen — ingen større svagheder.";
  })();

  // ===== Antagelsessikkerhed (vægtet) =====
  const confidence = getConfidence(scenario);

  // Effekt-vægte pr. antagelse — udledt af hvor meget den faktisk indgår
  const sumPt = years.reduce((s, y) => s + y.flows.partTimeNet, 0);
  const sumSp = years.reduce((s, y) => s + y.flows.statePensionNet, 0);
  const sumFf = years.reduce((s, y) => s + y.flows.familyFundNet, 0);
  const sumRate = years.reduce((s, y) => s + (y.flows.ratePension?.net ?? 0), 0);
  const sumLife = years.reduce((s, y) => s + (y.flows.lifeAnnuity?.net ?? 0), 0);
  const sumSalary = years.reduce((s, y) => s + y.flows.salaryNet, 0);
  const sumHoldingValue = inp.holding.expectedExitValue + inp.holding.balance;
  const sumNeed = annualSpend * years.length;

  const rawWeight: Record<ConfidenceKey, number> = {
    salary: sumSalary / sumNeed,
    partTime: sumPt / sumNeed,
    familyFund: sumFf / sumNeed,
    statePension: inp.income.statePension.mode === "none" ? 0 : sumSp / sumNeed,
    ratePension: inp.pension.ratePensionEnabled ? sumRate / sumNeed : 0,
    lifeAnnuity: inp.pension.lifeAnnuity.enabled ? sumLife / sumNeed : 0,
    holdingExit: sumHoldingValue / Math.max(1, sumNeed),
    returns: 1, // afkast påvirker altid
    spending: 1, // forbrug påvirker altid
  };

  // Klassificer effekt-størrelse for visning
  function classifyEffect(w: number): "low" | "medium" | "high" {
    if (w >= 0.4) return "high";
    if (w >= 0.15) return "medium";
    return "low";
  }

  const factors: ConfidenceFactor[] = (Object.keys(CONFIDENCE_LABELS) as ConfidenceKey[]).map((key) => {
    const level = confidence[key];
    const w = Math.min(1.5, Math.max(0, rawWeight[key]));
    const effect = classifyEffect(w);
    // Bidrag = level-værdi × vægt (vægtning normaliseres bagefter)
    const contribution = LEVEL_VALUE[level] * w;
    return {
      key,
      label: CONFIDENCE_LABELS[key],
      level,
      effect,
      contribution,
      note: w < 0.05 ? "Bruges ikke i scenariet" : undefined,
    };
  });

  const totalWeight = factors.reduce((s, f) => s + Math.min(1.5, Math.max(0, rawWeight[f.key])), 0);
  const assumptionConfidenceScore = totalWeight > 0
    ? Math.round(factors.reduce((s, f) => s + f.contribution, 0) / totalWeight)
    : 70;
  const assumptionConfidence = Math.max(0, Math.min(100, assumptionConfidenceScore));
  const assumptionRisk = 100 - assumptionConfidence;

  const sortedFactors = [...factors]
    .filter((f) => !f.note)
    .sort((x, y) => {
      // Mest "trækkende ned" først: lav level + høj vægt
      const xPull = (100 - LEVEL_VALUE[x.level]) * Math.min(1.5, rawWeight[x.key]);
      const yPull = (100 - LEVEL_VALUE[y.level]) * Math.min(1.5, rawWeight[y.key]);
      return yPull - xPull;
    });

  const confidenceSummary = (() => {
    const worst = sortedFactors[0];
    if (!worst) return "Ingen vigtige antagelser i scenariet.";
    if (LEVEL_VALUE[worst.level] >= 70) return "Scenariet bygger primært på rimeligt sikre antagelser.";
    return `Scenariet afhænger især af ${worst.label.toLowerCase()} (${LEVEL_LABELS[worst.level].toLowerCase()}).`;
  })();

  const endShortfallVsTarget = Math.max(0, minRequired - yEnd.netWorth);

  // Holding finansiering
  let unfinancedHoldingDebt = 0;
  let unfinancedHoldingYears = 0;
  let firstFinancingIssueAge: number | null = null;
  let firstFinancingIssueKind: string | null = null;
  let firstFinancingIssueAmount = 0;
  for (const y of years) {
    const s = y.flows.holdingFinancingShortfall ?? 0;
    if (s > 0.5) {
      unfinancedHoldingDebt += s;
      unfinancedHoldingYears++;
      if (firstFinancingIssueAge === null) {
        firstFinancingIssueAge = y.age;
        firstFinancingIssueKind = "Ufinansieret holdingbetaling";
        firstFinancingIssueAmount = s;
      }
    }
  }

  // Modelstatus
  let modelStatus: "valid" | "target_missed" | "invalid" = "valid";
  let modelStatusReason = "Scenariet er validt — ingen shortfall, ingen ufinansierede afdrag, mål opfyldt.";
  const isInvalid = unfinancedHoldingDebt > 0.5 || !!firstShort;
  if (isInvalid) {
    modelStatus = "invalid";
    const reasons: string[] = [];
    if (firstShort) {
      const amt = Math.round(firstShort.shortfallAmount).toLocaleString("da-DK");
      reasons.push(`privat cashflow-shortfall fra alder ${firstShort.age} (≈ ${amt} kr)`);
    }
    if (unfinancedHoldingDebt > 0.5 && firstFinancingIssueAge !== null) {
      const amt = Math.round(firstFinancingIssueAmount).toLocaleString("da-DK");
      reasons.push(`ufinansieret holdinggæld fra alder ${firstFinancingIssueAge} (≈ ${amt} kr i første år, i alt ${Math.round(unfinancedHoldingDebt).toLocaleString("da-DK")} kr over ${unfinancedHoldingYears} år)`);
    }
    modelStatusReason = `Scenariet er ugyldigt: ${reasons.join("; ")}.`;
  } else if (endShortfallVsTarget > 0.5) {
    modelStatus = "target_missed";
    modelStatusReason = `Scenariet er gyldigt, men minimumsmålet er ikke opfyldt — mangler ${Math.round(endShortfallVsTarget).toLocaleString("da-DK")} kr ved slutalder.`;
  }

  // Failure cap: hvis modellen er ugyldig (cashflow-shortfall eller ufinansieret holdinggæld),
  // må finansiel robusthed aldrig fremstå høj.
  if (isInvalid) {
    financial = Math.min(financial, 25);
  }


  return {
    plannedStopAge: stopAge,
    earliestSustainableStopAge: earliest,
    capitalAtStopAge: yAtStop?.netWorth ?? 0,
    capitalAt65: yAt65?.netWorth ?? 0,
    // Historical field name kept for persisted-snapshot compatibility; the VALUE is the net
    // worth at the end of the projected horizon (the last YearRow), which for
    // lifeExpectancy <= 95 is exactly what the old fallback produced.
    capitalAt95: yEnd.netWorth,
    firstShortfallAge: firstShort?.age ?? null,
    monthlyGapAfterStop: avgGap,
    financialRobustness: financial,
    assumptionRisk,
    assumptionConfidence,
    robustnessScore: financial,
    minNetWorthAtEnd: minRequired,
    endShortfallVsTarget,
    unfinancedHoldingDebt,
    unfinancedHoldingYears,
    firstFinancingIssueAge,
    firstFinancingIssueKind,
    firstFinancingIssueAmount,
    modelStatus,
    modelStatusReason,
    robustnessBreakdown: sortedBreakdown,
    robustnessSummary,
    confidenceBreakdown: sortedFactors.slice(0, 5),
    confidenceSummary,
  };
}

export function scoreVerdict(score: number): "Meget lav" | "Lav" | "Middel" | "Høj" | "Meget høj" {
  if (score >= 85) return "Meget høj";
  if (score >= 70) return "Høj";
  if (score >= 50) return "Middel";
  if (score >= 25) return "Lav";
  return "Meget lav";
}
