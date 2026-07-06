import { useEffect, useMemo, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Layers, Minus, Share2, SlidersHorizontal, TrendingUp, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/public/PublicHeader";
import { AdvancedNoCarryOverNote } from "@/components/public/AdvancedAccessButton";
import { HorizonChart } from "@/components/public/HorizonChart";
import { usePublicStore } from "@/store/publicStore";
import { computePublicResult, type PublicDriver, type PublicResult, type StatusColorToken } from "@/lib/finance/public";
import { formatKr, headlineStopAge } from "@/lib/publicFormat";
import { decodeShareInputs } from "@/lib/publicShare";
import { deriveSavingsSensitivity } from "@/lib/publicSensitivity";
import "./start.css";
import "./resultat.css";

/**
 * Result — the answer-first screen of the public Frihedsmodel flow (Phase 5/6).
 * Ported from design-reference/resultat.html (på sporet), resultat-stramt.html (stramt) and
 * resultat-ikke-paa-sporet.html (ikke på sporet) as ONE screen whose state follows
 * `PublicResult.status.kind`.
 *
 * Architectural boundary: this screen consumes ONLY the public adapter's typed `PublicResult`
 * (src/lib/finance/public) computed from the shared public input state. It never imports the raw
 * engine, and it derives no new thresholds — status, bottleneck, scores and drivers all come from
 * the adapter as-is (display-level filtering only, documented below).
 */

const BADGE_STYLE: Record<StatusColorToken, { pill: string; dot: string }> = {
  sage: {
    pill: "border-[color:var(--sage-line)] bg-[color:var(--sage-soft)] text-success",
    dot: "bg-[color:var(--sage)]",
  },
  dawn: {
    pill: "border-[color:var(--amber-line)] bg-[color:var(--dawn-soft)] text-warning",
    dot: "bg-[color:var(--dawn)]",
  },
  clay: {
    pill: "border-[color:var(--clay-line)] bg-[color:var(--clay-soft)] text-destructive",
    dot: "bg-[color:var(--clay)]",
  },
};

function StatusBadge({ result }: { result: PublicResult }) {
  const s = BADGE_STYLE[result.status.colorToken];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1 text-[12.5px] font-semibold ${s.pill}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {result.status.label}
    </span>
  );
}

function Age({ children }: { children: ReactNode }) {
  return <span className="font-medium italic text-[color:var(--fjord)]">{children}</span>;
}

type Tone = "ok" | "accent" | "risk" | undefined;

function StatCard({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: Tone }) {
  const valueColor =
    tone === "ok" ? "text-success" : tone === "accent" ? "text-warning" : tone === "risk" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-[18px] border border-border bg-card p-5 shadow-sm">
      <div className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-soft)]">{label}</div>
      <div className={`mt-1.5 font-display text-[22px] font-medium leading-tight ${valueColor} num`}>{value}</div>
      <div className="mt-1 text-[13px] leading-[1.45] text-[color:var(--ink-soft)]">{sub}</div>
    </div>
  );
}

/** Band tone shares the adapter's own band thresholds (label bands), used for color only. */
function scoreTone(score: number, strongMin: number, midMin: number): { text: string; bar: string } {
  if (score >= strongMin) return { text: "text-success", bar: "bg-[color:var(--sage)]" };
  if (score >= midMin) return { text: "text-warning", bar: "bg-[color:var(--dawn)]" };
  return { text: "text-destructive", bar: "bg-[color:var(--clay)]" };
}

function ScoreCard({ title, score, label, strongMin, midMin }: { title: string; score: number; label: string; strongMin: number; midMin: number }) {
  const tone = scoreTone(score, strongMin, midMin);
  return (
    <div className="rounded-[18px] border border-border bg-card p-5 shadow-sm">
      <h3 className="m-0 font-sans text-[14px] font-semibold text-foreground">{title}</h3>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--paper-sunk)]">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${score}%` }} />
      </div>
      <div className={`mt-2.5 text-[15px] font-semibold ${tone.text}`}>{label}</div>
      <div className="mt-0.5 text-[13px] text-[color:var(--ink-soft)] num">{score} af 100</div>
    </div>
  );
}

function DriverRow({ driver }: { driver: PublicDriver }) {
  const helps = driver.direction === "helps";
  return (
    <li className="flex items-start gap-2.5">
      <span
        aria-hidden="true"
        className={`mt-px inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full ${
          helps ? "bg-[color:var(--sage-soft)] text-success" : "bg-[color:var(--clay-soft)] text-destructive"
        }`}
      >
        {helps ? <Check className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
      </span>
      <span className="text-[14px] leading-[1.5] text-[color:var(--ink-soft)]">{driver.text}</span>
    </li>
  );
}

export default function Resultat() {
  const inputs = usePublicStore((s) => s.inputs);
  const replaceInputs = usePublicStore((s) => s.replaceInputs);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Share-link hydration: /resultat?d=<encoded inputs> loads the sender's numbers into the
  // local state ("Linket indeholder dine tal"), then cleans the URL. Decoding is defensive —
  // a malformed param is simply ignored.
  useEffect(() => {
    const d = searchParams.get("d");
    if (d == null) return;
    const decoded = decodeShareInputs(d);
    if (decoded) replaceInputs(decoded);
    navigate("/resultat", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount/param change
  }, [searchParams]);

  const result = useMemo(() => computePublicResult(inputs), [inputs]);
  // The 1-lever sensitivity helper: a second REAL pipeline run with monthlySavings + 1.000
  // (never an approximation). Null means "nothing truthful to claim" and the line is hidden
  // (see publicSensitivity.ts for the exact rules).
  const sensitivity = useMemo(() => deriveSavingsSensitivity(inputs, result), [inputs, result]);

  const kind = result.status.kind;
  const plan = result.desiredStopAge;
  const horizonEnd = result.lifeExpectancy;
  // The "Du kan stoppe ved" headline age (status-aware: the plan on tight, the corrected
  // earliest on track) — the SAME helper the save/PDF summary uses, so the two surfaces can
  // never disagree. Frihedspunkt cards/markers never use this: they show the raw earliest,
  // wherever it lies relative to the plan.
  const freedom = headlineStopAge(kind, result.earliestSustainableStopAge, plan);
  // Every adapter value that feeds MORE than one rendered location (headline, card, chart
  // marker, aria) is computed and formatted exactly once here, and every consumer reads the
  // same constant. Re-deriving or re-formatting the same figure per location is what let the
  // chart and a card drift out of sync in past review rounds.
  const capitalAtStop = formatKr(result.capitalAtStopAge);
  const capitalAtEnd = formatKr(result.capitalAtEndOfHorizon);
  const goal = inputs.fiTargetMinNetWorth ?? 0;
  const hasGoal = goal > 0;
  const goalKr = formatKr(goal);

  const peakPoint = result.netWorthByAge.reduce(
    (a, b) => (b.netWorth > a.netWorth ? b : a),
    result.netWorthByAge[0] ?? { age: plan, netWorth: 0 },
  );
  const peakKr = formatKr(peakPoint.netWorth);

  // Display decision (documented in the PR): on an off-track result, only the "hurts" drivers are
  // shown — a positive "helps" line under an off-track verdict reads as contradictory. The
  // adapter's driver list itself is unchanged.
  const visibleDrivers = kind === "off_track" ? result.drivers.filter((d) => d.direction === "hurts") : result.drivers;

  // Required horizon-relative capital anchors (data contract §4.2): capital when the pension
  // becomes accessible (rendered only when the adapter says the age is in-horizon — null means
  // omit, which also covers the "already accessible" fallback) and capital at the end of the
  // horizon (the LAST YearRow). The tight state's goal card IS the end-of-horizon anchor, so it
  // is not duplicated there. These extend the references' three-card set because the spec marks
  // them as required public outputs.
  const anchorCards: ReactNode = (
    <>
      {result.capitalAtPensionAccessAge != null && (
        <StatCard
          label="Når pensionen bliver tilgængelig"
          value={formatKr(result.capitalAtPensionAccessAge)}
          sub={`ved alder ${inputs.pensionAccessAge}`}
        />
      )}
      {kind !== "tight" && (
        <StatCard label="Ved planens slutning" value={capitalAtEnd} sub={`formue ved alder ${horizonEnd}`} />
      )}
    </>
  );

  // The "Formue når du stopper" card is identical in all three states — one element, not three
  // copies that could drift apart.
  const stopCapitalCard = (
    <StatCard label="Formue når du stopper" value={capitalAtStop} sub={`ved din planlagte stop-alder (${plan})`} />
  );

  // --- Per-state copy (ported from the three reference screens, parameterized) ---
  let headline: ReactNode;
  let takeaway: string;
  let chart: ReactNode;
  let cards: ReactNode;

  if (kind === "off_track") {
    const lastsTo = result.moneyLastsToAge;
    const shortYears = Math.max(1, horizonEnd - lastsTo);
    const bn = result.bottleneck;
    const shortfallAge = bn.kind === "shortfall" ? bn.firstShortfallAge : lastsTo;
    const monthlyGap = bn.kind === "shortfall" ? bn.monthlyGap : 0;

    // A shortfall BEFORE the planned stop age is a current-budget problem (spending exceeds
    // what income and savings cover while still working), not a retirement-date problem —
    // framing it as "Stopper du ved {plan}" and suggesting to work longer would point at the
    // wrong lever. Branch the copy on where the failure actually happens.
    const failsBeforeStop = lastsTo < plan;
    headline = failsBeforeStop ? (
      <>
        Allerede ved <Age>alder {lastsTo}</Age> slipper pengene op.
      </>
    ) : (
      <>
        Stopper du ved {plan}, rækker pengene til <Age>alder {lastsTo}</Age>.
      </>
    );
    takeaway = failsBeforeStop
      ? `Det sker før din planlagte stop-alder på ${plan}, så det er ikke stop-alderen, der er problemet. Justér dit forbrug eller din opsparing, så tallene hænger sammen.`
      : `Det er ${shortYears} år for kort. Du kan lukke hullet ved at arbejde lidt længere, spare mere op eller justere dit forbrug.`;
    // Off track can still have a real freedom point (a later stop age that WOULD hold — the
    // Frihedspunkt card shows it). The chart and the aria text follow the adapter: marker and
    // "Frihedspunktet …" sentence when earliestSustainableStopAge exists, and the reference's
    // "no sustainable freedom point" sentence only when it is genuinely null. (The reference
    // fixture hardcoded freedomAge={null}, which contradicted the card for fixable plans.)
    const offTrackFreedom = result.earliestSustainableStopAge;
    chart = (
      <HorizonChart
        points={result.netWorthByAge}
        freedomAge={offTrackFreedom}
        planAge={plan}
        freedomOnPlan={offTrackFreedom === plan}
        depletion={{ age: shortfallAge, label: `Pengene slipper op, ${shortfallAge}` }}
        ariaLabel={`Din formue stiger til en top på ${peakKr} ved alder ${peakPoint.age} og falder derefter. Pengene slipper op ved alder ${shortfallAge}, altså ${shortYears} år før de skulle række til ${horizonEnd}. ${
          offTrackFreedom != null
            ? `Frihedspunktet, hvor pengene rækker hele vejen, er ved alder ${offTrackFreedom}.`
            : "Der er ikke et bæredygtigt tidligt frihedspunkt i dette scenarie."
        }`}
      />
    );
    cards = (
      <>
        {stopCapitalCard}
        <StatCard
          label="Flaskehals"
          value={`Alder ${shortfallAge}`}
          sub={`fra alder ${shortfallAge} mangler du ${formatKr(monthlyGap)} om måneden`}
          tone="risk"
        />
        {offTrackFreedom != null ? (
          <StatCard label="Frihedspunkt" value={`alder ${offTrackFreedom}`} sub="hvis pengene skal nå hele vejen" />
        ) : (
          <StatCard label="Frihedspunkt" value="Ikke fundet" sub="ingen stop-alder rækker hele vejen med dine tal" />
        )}
      </>
    );
  } else if (kind === "tight") {
    // Tight means the plan itself HOLDS (money lasts the whole horizon) but ends under the
    // goal. A non-null earliestSustainableStopAge is then the age at which the goal IS reached
    // — usually later than the plan, but forced taxed pension payouts make end wealth
    // path-dependent, so it can genuinely be EARLIER too (CI counterexample: earliest 40, plan
    // 51). Either way it is shown raw, never clamped toward the plan. The headline claims the
    // plan (the stop age the user chose, which holds); the Frihedspunkt card and marker show
    // the raw age. When the search (capped at 75) finds no goal-reaching age, the freedom
    // point is unknowable and no claim is made — the card names the user's own chosen age.
    const goalAge = result.earliestSustainableStopAge;
    const markerAge = goalAge ?? plan;
    headline = (
      <>
        Du kan stoppe ved <Age>alder {plan}</Age>, men det er stramt.
      </>
    );
    takeaway = hasGoal
      ? `Med dine nuværende tal rækker pengene til ${horizonEnd}, men du slutter under dit mål. Små ændringer i forbrug eller opsparing kan rykke billedet.`
      : `Med dine nuværende tal rækker pengene til ${horizonEnd}, men marginen er lille. Små ændringer i forbrug eller opsparing kan rykke billedet.`;
    chart = (
      <HorizonChart
        points={result.netWorthByAge}
        freedomAge={markerAge}
        planAge={plan}
        freedomOnPlan={markerAge === plan}
        ariaLabel={`Din formue stiger til en top på ${peakKr} ved alder ${peakPoint.age}, og rækker til ${horizonEnd}, men slutter under dit mål. ${
          goalAge != null
            ? `Frihedspunktet, hvor du også når dit mål, er ved alder ${goalAge}.`
            : `Din plan holder ved alder ${plan}.`
        }`}
      />
    );
    cards = (
      <>
        {stopCapitalCard}
        <StatCard
          label="Ved planens slutning"
          value={capitalAtEnd}
          sub={hasGoal ? `under dit mål på ${goalKr}` : `pengene rækker knap til ${horizonEnd}`}
          tone="accent"
        />
        {goalAge != null ? (
          <StatCard label="Frihedspunkt" value={`alder ${goalAge}`} sub="hvis du også skal nå dit mål" />
        ) : (
          <StatCard label="Frihedspunkt" value={`alder ${plan}`} sub="din valgte stop-alder" />
        )}
      </>
    );
  } else {
    const yearsBefore = plan - freedom;
    const freedomOnPlan = freedom === plan;
    // The engine's earliest-FI search only covers stop ages up to min(lifeExpectancy, 75). For
    // an on-track plan later than that (e.g. stop at 80), earliest comes back null even though
    // the plan itself holds — the "tidligst" claim is then unknowable and must not be made.
    // The plan is never restricted; only the headline wording changes. Phase 7 may extend the
    // engine's search window, after which this branch disappears naturally.
    const earliestKnown = result.earliestSustainableStopAge != null;
    headline = earliestKnown ? (
      <>
        Du kan tidligst stoppe med at arbejde ved <Age>alder {freedom}</Age>.
      </>
    ) : (
      <>
        Du kan stoppe med at arbejde ved <Age>alder {plan}</Age>.
      </>
    );
    takeaway = !earliestKnown
      ? `Med dine nuværende tal rækker pengene hele vejen til ${horizonEnd} med din plan på ${plan}.`
      : yearsBefore > 0
        ? `Med dine nuværende tal rækker pengene hele vejen til ${horizonEnd}. Du kan stoppe ${yearsBefore} år før din egen plan på ${plan}.`
        : `Med dine nuværende tal rækker pengene hele vejen til ${horizonEnd}. Det passer med din egen plan på ${plan}.`;
    chart = (
      <HorizonChart
        points={result.netWorthByAge}
        freedomAge={freedom}
        planAge={plan}
        freedomOnPlan={freedomOnPlan}
        ariaLabel={`Din formue stiger fra i dag til en top på ${peakKr} ved alder ${peakPoint.age}, og rækker hele vejen til ${horizonEnd}. ${
          earliestKnown
            ? `Frihedspunktet, hvor du tidligst kan stoppe, er ved alder ${freedom}.`
            : `Din plan holder ved alder ${plan}.`
        }`}
      />
    );
    cards = (
      <>
        {stopCapitalCard}
        <StatCard label="Flaskehals" value="Ingen fundet" sub={`pengene rækker hele vejen til ${horizonEnd}`} tone="ok" />
        {earliestKnown ? (
          <StatCard label="Frihedspunkt" value={`alder ${freedom}`} sub="tidligst muligt med dine tal" />
        ) : (
          <StatCard label="Frihedspunkt" value={`alder ${plan}`} sub="din plan holder hele vejen" />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[920px] px-[clamp(18px,5vw,40px)]">
        {/* withNoCarryOverNote={false}: this screen's reminder lives by the "Avanceret model"
            row CTA below, so the header copy is suppressed — the sentence renders exactly
            once per screen (self-review round 3). */}
        <PublicHeader
          withNoCarryOverNote={false}
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/simple-inputs">
                <SlidersHorizontal aria-hidden="true" />
                Justér dine tal
              </Link>
            </Button>
          }
        />

        <section className="fm-rise max-w-[720px] pt-[clamp(40px,7vw,72px)]">
          <div className="mb-[22px] inline-flex flex-wrap items-center gap-3">
            <p className="m-0 whitespace-nowrap text-[12.5px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
              Dit svar
            </p>
            <StatusBadge result={result} />
          </div>
          <h1 className="m-0 font-display text-[clamp(34px,6vw,56px)] font-light leading-[1.08] tracking-[-0.015em] text-foreground">
            {headline}
          </h1>
          <p className="mt-5 max-w-[34em] text-[clamp(17px,2.4vw,20px)] leading-[1.55] text-[color:var(--ink-soft)]">
            {takeaway}
          </p>
        </section>

        <section className="fm-rise fm-hz-draw mt-[clamp(26px,4.5vw,46px)]" style={{ animationDelay: "0.08s" }}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="m-0 font-display text-[19px] font-normal text-foreground">Din horisont</h2>
            <span className="text-[13px] text-[color:var(--ink-soft)]">
              Formue over tid, fra i dag til {horizonEnd} år.
            </span>
          </div>
          <div className="rounded-[18px] border border-border bg-card px-[clamp(10px,2vw,24px)] pb-3.5 pt-5 shadow-sm">
            {chart}
          </div>
        </section>

        <section className="fm-rise mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-3" style={{ animationDelay: "0.14s" }}>
          {cards}
          {anchorCards}
        </section>

        <section className="fm-rise mt-[clamp(26px,4.5vw,46px)]" style={{ animationDelay: "0.18s" }}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="m-0 font-display text-[19px] font-normal text-foreground">Hvor solidt er svaret?</h2>
          </div>
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            <ScoreCard
              title="Hvor solid er planen?"
              score={result.robustness.score}
              label={result.robustness.label}
              strongMin={70}
              midMin={40}
            />
            <ScoreCard
              title="Dine antagelser"
              score={result.assumptionConfidence.score}
              label={result.assumptionConfidence.label}
              strongMin={80}
              midMin={50}
            />
          </div>
          {visibleDrivers.length > 0 && (
            <ul className="m-0 mt-4 flex list-none flex-col gap-2.5 p-0">
              {visibleDrivers.map((d) => (
                <DriverRow key={d.text} driver={d} />
              ))}
            </ul>
          )}
          {sensitivity && (
            <div className="mt-4 flex items-start gap-2.5" data-testid="sensitivity-helper">
              <span
                aria-hidden="true"
                className="mt-px inline-flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[color:var(--paper-sunk)] text-[color:var(--fjord)]"
              >
                <TrendingUp className="h-3.5 w-3.5" />
              </span>
              <p className="m-0 text-[14px] leading-[1.5] text-[color:var(--ink-soft)]">{sensitivity.text}</p>
            </div>
          )}
          {result.warnings.length > 0 && (
            <div className="mt-4 flex items-start gap-3 rounded-[14px] border border-[color:var(--amber-line)] bg-[color:var(--dawn-soft)] px-4 py-3.5">
              <TriangleAlert aria-hidden="true" className="mt-0.5 h-[18px] w-[18px] flex-none text-warning" />
              <div className="flex flex-col gap-1.5">
                {result.warnings.map((w) => (
                  <p key={w.id} className="m-0 text-[13.5px] leading-[1.5] text-foreground">
                    {w.text}
                  </p>
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="fm-rise mt-[clamp(26px,4vw,38px)] flex flex-wrap items-center gap-[18px]" style={{ animationDelay: "0.22s" }}>
          <Button asChild size="lg" className="h-12 px-7 text-[15px] [&_svg]:size-[18px]">
            <Link to="/simple-inputs">
              <SlidersHorizontal aria-hidden="true" />
              Justér dine tal
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 bg-card px-7 text-[15px] [&_svg]:size-[18px]">
            <Link to="/gem-og-del">
              <Share2 aria-hidden="true" />
              Gem eller del
            </Link>
          </Button>
          {/* Third action (product decision 2026-07-05): the advanced app surfaced in the
              action row itself, alongside the corner button the header already carries.
              Goes through the AdvancedGate door like every advanced URL. */}
          <Button asChild variant="outline" size="lg" className="h-12 bg-card px-7 text-[15px] [&_svg]:size-[18px]">
            <Link to="/dashboard">
              <Layers aria-hidden="true" />
              Avanceret model
            </Link>
          </Button>
        </div>

        {/* THE no-carry-over reminder of this screen (the header's copy is suppressed above),
            shown UNCONDITIONALLY: a returning user whose door is already open never sees
            DoorPage's clarification again, and the continuity expectation is highest right
            here, after adjusting a public plan. */}
        <AdvancedNoCarryOverNote className="mt-2.5" />

        {/* Share-link recipients land HERE first (never Start/Simple Inputs), so the footer
            carries the real-terms note alongside the canonical disclaimer, same combined
            pattern as GemOgDel's. */}
        <p className="mb-14 mt-4 max-w-[58em] border-t border-border pt-[18px] text-[13px] leading-[1.55] text-[color:var(--ink-soft)]">
          En forenklet beregning ud fra dine egne tal og antagelser. Tag tallene som et kvalificeret
          billede, ikke en garanti, og ikke som økonomisk rådgivning. Alle beløb er i nutidskroner.
        </p>
      </div>
    </div>
  );
}
