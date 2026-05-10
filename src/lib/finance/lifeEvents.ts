import {
  LifeEvent,
  LifeEventYearEffect,
  LifeEventYearItem,
} from "./types";

const id = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

/** Default-shape for et nyt event. Bruges af UI-templates. */
export function makeLifeEvent(partial: Partial<LifeEvent> = {}): LifeEvent {
  return {
    id: id(),
    name: "Ny livsfase",
    enabled: true,
    category: "custom",
    startAge: 40,
    endAge: undefined,
    amount: 0,
    frequency: "monthly",
    amountMode: "net",
    effectTarget: "privateSpending",
    effectDirection: "increase",
    growthRate: 0,
    confidenceKey: null,
    notes: undefined,
    ...partial,
  };
}

/** Er eventet aktivt for det givne år (alder)? */
export function isEventActiveAtAge(event: LifeEvent, age: number, lifeExpectancy: number): boolean {
  if (!event.enabled) return false;
  if (event.frequency === "one_time") return age === event.startAge;
  if (age < event.startAge) return false;
  const end = event.endAge ?? lifeExpectancy;
  return age <= end;
}

/** Beregn signed årligt beløb (i nutidskroner) for eventet i det givne år. */
export function signedYearlyAmount(event: LifeEvent, age: number): number {
  const sign = event.effectDirection === "decrease" ? -1 : 1;
  const base = Math.max(0, event.amount);
  let perYear = base;
  if (event.frequency === "monthly") perYear = base * 12;
  // 'annual' og 'one_time' bruger amount direkte
  const yearsSinceStart = Math.max(0, age - event.startAge);
  const growth = event.growthRate ?? 0;
  const grown = perYear * Math.pow(1 + growth, yearsSinceStart);
  return sign * grown;
}

/** Aggregeret effekt af alle aktive events i et givent år. Returnerer null hvis ingen aktive. */
export function computeLifeEventEffects(
  events: LifeEvent[] | undefined,
  age: number,
  lifeExpectancy: number,
): LifeEventYearEffect | null {
  if (!events || events.length === 0) return null;
  const items: LifeEventYearItem[] = [];
  let incomeDelta = 0;
  let spendingDelta = 0;
  let freeCapitalDelta = 0;
  let debtDelta = 0;

  for (const ev of events) {
    if (!isEventActiveAtAge(ev, age, lifeExpectancy)) continue;
    const signed = signedYearlyAmount(ev, age);
    switch (ev.effectTarget) {
      case "privateIncome":
        incomeDelta += signed;
        break;
      case "privateSpending":
        // increase=mere forbrug = positivt spendingDelta. spending øges.
        spendingDelta += signed;
        break;
      case "freeCapital":
        // Kun one_time har effekt v1; andre frekvenser ignoreres for fri kapital direkte.
        if (ev.frequency === "one_time") freeCapitalDelta += signed;
        break;
      case "privateDebt":
        if (ev.frequency === "one_time") debtDelta += signed;
        break;
      default:
        // holdingCapital/holdingCashflow/pensionCapital/netWorthOnly:
        // datamodellen accepterer dem, men v1 har ingen beregningseffekt.
        break;
    }
    items.push({
      id: ev.id,
      name: ev.name,
      category: ev.category,
      effectTarget: ev.effectTarget,
      effectDirection: ev.effectDirection,
      signedAmount: signed,
      frequency: ev.frequency,
      notes: ev.notes,
    });
  }

  if (items.length === 0) return null;
  return { incomeDelta, spendingDelta, freeCapitalDelta, debtDelta, items };
}

/** Templates til UI — udfylder kun standardfelter. */
export const LIFE_EVENT_TEMPLATES: { key: string; label: string; build: () => LifeEvent }[] = [
  {
    key: "extra_income",
    label: "Ekstra indkomst",
    build: () => makeLifeEvent({ name: "Ekstra indkomst", category: "income_change", effectTarget: "privateIncome", effectDirection: "increase", frequency: "monthly", amount: 5000 }),
  },
  {
    key: "lower_income",
    label: "Lavere indkomst",
    build: () => makeLifeEvent({ name: "Lavere indkomst", category: "income_change", effectTarget: "privateIncome", effectDirection: "decrease", frequency: "monthly", amount: 5000 }),
  },
  {
    key: "higher_spending",
    label: "Højere forbrug",
    build: () => makeLifeEvent({ name: "Højere forbrug", category: "expense_change", effectTarget: "privateSpending", effectDirection: "increase", frequency: "monthly", amount: 4000 }),
  },
  {
    key: "lower_spending",
    label: "Lavere forbrug",
    build: () => makeLifeEvent({ name: "Lavere forbrug", category: "expense_change", effectTarget: "privateSpending", effectDirection: "decrease", frequency: "monthly", amount: 5000 }),
  },
  {
    key: "one_time_expense",
    label: "Engangsudgift",
    build: () => makeLifeEvent({ name: "Engangsudgift", category: "one_time_capital", effectTarget: "freeCapital", effectDirection: "decrease", frequency: "one_time", amount: 100000, startAge: 45 }),
  },
  {
    key: "one_time_inflow",
    label: "Engangsindbetaling",
    build: () => makeLifeEvent({ name: "Engangsindbetaling", category: "one_time_capital", effectTarget: "freeCapital", effectDirection: "increase", frequency: "one_time", amount: 100000, startAge: 45 }),
  },
  {
    key: "work_pause",
    label: "Arbejdspause",
    build: () => makeLifeEvent({ name: "Arbejdspause", category: "work_pause", effectTarget: "privateIncome", effectDirection: "decrease", frequency: "monthly", amount: 35000, startAge: 45, endAge: 46 }),
  },
  {
    key: "child",
    label: "Barn / familieudgift",
    build: () => makeLifeEvent({ name: "Barn", category: "children", effectTarget: "privateSpending", effectDirection: "increase", frequency: "monthly", amount: 4000, startAge: 36, endAge: 54 }),
  },
  {
    key: "housing",
    label: "Boligændring",
    build: () => makeLifeEvent({ name: "Boligændring", category: "housing", effectTarget: "privateSpending", effectDirection: "increase", frequency: "monthly", amount: 3000 }),
  },
  {
    key: "relocation",
    label: "Flytning / relocation",
    build: () => makeLifeEvent({ name: "Flytning", category: "relocation", effectTarget: "freeCapital", effectDirection: "decrease", frequency: "one_time", amount: 50000, startAge: 45 }),
  },
  {
    key: "custom",
    label: "Custom",
    build: () => makeLifeEvent({ name: "Custom livsfase" }),
  },
];

/** Normalisér et legacy-event (fra v0 placeholder) til den nye shape — disabled by default. */
export function normalizeLegacyLifeEvent(raw: any): LifeEvent {
  if (!raw || typeof raw !== "object") {
    return makeLifeEvent({ enabled: false, name: "Ukendt event" });
  }
  // Allerede ny shape?
  if (typeof raw.enabled === "boolean" && typeof raw.category === "string" && typeof raw.frequency === "string") {
    return raw as LifeEvent;
  }
  const isExpense = raw.type === "expense";
  return makeLifeEvent({
    id: raw.id ?? id(),
    name: raw.label ?? raw.name ?? "Legacy event",
    enabled: false, // legacy events deaktiveres så projektion ikke ændres
    category: isExpense ? "expense_change" : "custom",
    startAge: typeof raw.startAge === "number" ? raw.startAge : 40,
    endAge: typeof raw.endAge === "number" ? raw.endAge : undefined,
    amount: typeof raw.amount === "number" ? raw.amount : 0,
    frequency: raw.type === "oneTime" ? "one_time" : "annual",
    amountMode: "net",
    effectTarget: isExpense ? "privateSpending" : "privateIncome",
    effectDirection: isExpense ? "increase" : "increase",
    growthRate: typeof raw.growthRate === "number" ? raw.growthRate : 0,
    notes: raw.notes,
  });
}
