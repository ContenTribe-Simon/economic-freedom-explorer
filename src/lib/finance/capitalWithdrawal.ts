import type {
  CapitalSource,
  CapitalWithdrawalInputs,
  CapitalWithdrawalStrategy,
  PlannedWithdrawalPolicy,
  ScenarioInputs,
} from "./types";

const DEFAULT_ORDERS: Record<Exclude<CapitalWithdrawalStrategy, "custom" | "proRata">, CapitalSource[]> = {
  depotFirst: ["depot", "holding", "ask", "pension"],
  holdingFirst: ["holding", "depot", "ask", "pension"],
  askFirst: ["ask", "depot", "holding", "pension"],
  pensionFirst: ["pension", "depot", "holding", "ask"],
  pensionThenHolding: ["pension", "holding", "depot", "ask"],
};

/** Resolve den rækkefølge kilderne forsøges i for en given strategi. */
export function resolveOrder(
  strategy: CapitalWithdrawalStrategy,
  customOrder: CapitalSource[] | undefined,
): CapitalSource[] {
  if (strategy === "custom") {
    const seen = new Set<CapitalSource>();
    const out: CapitalSource[] = [];
    for (const s of customOrder ?? []) {
      if (!seen.has(s)) { seen.add(s); out.push(s); }
    }
    for (const s of ["depot", "holding", "ask", "pension"] as CapitalSource[]) {
      if (!seen.has(s)) out.push(s);
    }
    return out;
  }
  if (strategy === "proRata") return ["depot", "holding", "ask", "pension"];
  return DEFAULT_ORDERS[strategy];
}

/**
 * Migrér eksisterende scenarie-inputs (uden capitalWithdrawal-felt) til en
 * inferred CapitalWithdrawalInputs ud fra legacy felter. Bruges som UI-default
 * og af tests — projection-motoren falder selv tilbage til legacy code path,
 * når inputs.capitalWithdrawal er undefined.
 */
export function resolveCapitalWithdrawal(inp: ScenarioInputs): CapitalWithdrawalInputs {
  if (inp.capitalWithdrawal) return inp.capitalWithdrawal;

  const holdingStrategy = inp.holding?.withdrawalStrategy ?? "planned_only";
  const askStrategy = inp.free?.ask?.withdrawalStrategy;
  const fundingStrategy = inp.free?.depotTax?.shareIncomeFundingStrategy;

  // 1) Bestem strategi (prioritet: pension-before-extra > funding/holding > ASK > default)
  let strategy: CapitalWithdrawalStrategy;
  if (holdingStrategy === "pension_before_extra_holding") {
    strategy = "pensionFirst";
  } else if (fundingStrategy === "depotFirst") {
    strategy = "depotFirst";
  } else if (fundingStrategy === "proRata") {
    strategy = "proRata";
  } else if (
    holdingStrategy === "up_to_low_threshold" ||
    holdingStrategy === "allow_extra_on_shortfall" ||
    (fundingStrategy === "holdingFirst")
  ) {
    strategy = "holdingFirst";
  } else if (askStrategy === "askFirst") {
    strategy = "askFirst";
  } else if (askStrategy === "proRata") {
    strategy = "proRata";
  } else {
    // Default: depot først (matcher legacy withdrawOrder ["free","holding","pension"])
    strategy = "depotFirst";
  }

  // 2) Bestem planlagt politik
  let plannedPolicy: PlannedWithdrawalPolicy;
  if (holdingStrategy === "up_to_low_threshold") {
    plannedPolicy = "fillLowShareIncomeBracket";
  } else if ((inp.holding?.annualDistribution ?? 0) > 0) {
    plannedPolicy = "fixedAnnual";
  } else {
    plannedPolicy = "none";
  }

  return {
    strategy,
    plannedWithdrawalPolicy: plannedPolicy,
    plannedWithdrawalAmount: inp.holding?.annualDistribution ?? 0,
    startAge: inp.holding?.distributionFromAge ?? null,
    startAtStopAge: inp.holding?.startDistributionAtStopAge ?? false,
  };
}

export function defaultCapitalWithdrawal(): CapitalWithdrawalInputs {
  return {
    strategy: "depotFirst",
    plannedWithdrawalPolicy: "none",
    plannedWithdrawalAmount: 0,
    startAge: null,
    startAtStopAge: true,
  };
}
