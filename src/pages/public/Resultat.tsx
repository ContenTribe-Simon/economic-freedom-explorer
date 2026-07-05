import { useEffect, useMemo, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Minus, Share2, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/public/PublicHeader";
import { HorizonChart } from "@/components/public/HorizonChart";
import { usePublicStore } from "@/store/publicStore";
import { computePublicResult, type PublicDriver, type PublicResult, type StatusColorToken } from "@/lib/finance/public";
import { formatKr } from "@/lib/publicFormat";
import { decodeShareInputs } from "@/lib/publicShare";
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

  const kind = result.status.kind;
  const plan = result.desiredStopAge;
  const horizonEnd = result.lifeExpectancy;
  // Never claim a "tidligst" ABOVE a plan that demonstrably holds: the engine's FI search has a
  // floor of age 40, so for an on-track plan below 40 the KPI can report an "earliest" later
  // than the working plan itself. On track means the plan holds, so the true earliest is <= plan;
  // min() keeps the headline truthful without touching the engine. (Off track uses its own path.)
  const freedom = Math.min(result.earliestSustainableStopAge ?? plan, plan);
  const capitalAtStop = formatKr(result.capitalAtStopAge);
  const hasGoal = (inputs.fiTargetMinNetWorth ?? 0) > 0;

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
        <StatCard
          label="Ved planens slutning"
          value={formatKr(result.capitalAtEndOfHorizon)}
          sub={`formue ved alder ${horizonEnd}`}
        />
      )}
    </>
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

    headline = (
      <>
        Stopper du ved {plan}, rækker pengene til <Age>alder {lastsTo}</Age>.
      </>
    );
    takeaway = `Det er ${shortYears} år for kort. Du kan lukke hullet ved at arbejde lidt længere, spare mere op eller justere dit forbrug.`;
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
        <StatCard label="Formue når du stopper" value={capitalAtStop} sub={`ved din planlagte stop-alder (${plan})`} />
        <StatCard
          label="Flaskehals"
          value={`Alder ${shortfallAge}`}
          sub={`fra alder ${shortfallAge} mangler du ${formatKr(monthlyGap)} om måneden`}
          tone="risk"
        />
        {result.earliestSustainableStopAge != null ? (
          <StatCard label="Frihedspunkt" value={`alder ${result.earliestSustainableStopAge}`} sub="hvis pengene skal nå hele vejen" />
        ) : (
          <StatCard label="Frihedspunkt" value="Ikke fundet" sub="ingen stop-alder rækker hele vejen med dine tal" />
        )}
      </>
    );
  } else if (kind === "tight") {
    const freedomOnPlan = freedom === plan;
    headline = (
      <>
        Du kan stoppe ved <Age>alder {freedom}</Age>, men det er stramt.
      </>
    );
    takeaway = hasGoal
      ? `Med dine nuværende tal rækker pengene til ${horizonEnd}, men du slutter under dit mål. Små ændringer i forbrug eller opsparing kan rykke billedet.`
      : `Med dine nuværende tal rækker pengene til ${horizonEnd}, men marginen er lille. Små ændringer i forbrug eller opsparing kan rykke billedet.`;
    chart = (
      <HorizonChart
        points={result.netWorthByAge}
        freedomAge={freedom}
        planAge={plan}
        freedomOnPlan={freedomOnPlan}
        ariaLabel={`Din formue stiger til en top på ${peakKr} ved alder ${peakPoint.age}, og rækker til ${horizonEnd}, men slutter under dit mål. ${
          freedomOnPlan
            ? `Frihedspunktet, hvor du tidligst kan stoppe, falder sammen med din plan ved alder ${freedom}.`
            : `Frihedspunktet, hvor du tidligst kan stoppe, er ved alder ${freedom}.`
        }`}
      />
    );
    cards = (
      <>
        <StatCard label="Formue når du stopper" value={capitalAtStop} sub={`ved din planlagte stop-alder (${plan})`} />
        <StatCard
          label="Ved planens slutning"
          value={formatKr(result.capitalAtEndOfHorizon)}
          sub={hasGoal ? `under dit mål på ${formatKr(inputs.fiTargetMinNetWorth ?? 0)}` : `pengene rækker knap til ${horizonEnd}`}
          tone="accent"
        />
        <StatCard label="Frihedspunkt" value={`alder ${freedom}`} sub="ikke tidligere med dine tal" />
      </>
    );
  } else {
    const yearsBefore = plan - freedom;
    const freedomOnPlan = freedom === plan;
    headline = (
      <>
        Du kan tidligst stoppe med at arbejde ved <Age>alder {freedom}</Age>.
      </>
    );
    takeaway =
      yearsBefore > 0
        ? `Med dine nuværende tal rækker pengene hele vejen til ${horizonEnd}. Du kan stoppe ${yearsBefore} år før din egen plan på ${plan}.`
        : `Med dine nuværende tal rækker pengene hele vejen til ${horizonEnd}. Det passer med din egen plan på ${plan}.`;
    chart = (
      <HorizonChart
        points={result.netWorthByAge}
        freedomAge={freedom}
        planAge={plan}
        freedomOnPlan={freedomOnPlan}
        ariaLabel={`Din formue stiger fra i dag til en top på ${peakKr} ved alder ${peakPoint.age}, og rækker hele vejen til ${horizonEnd}. Frihedspunktet, hvor du tidligst kan stoppe, er ved alder ${freedom}.`}
      />
    );
    cards = (
      <>
        <StatCard label="Formue når du stopper" value={capitalAtStop} sub={`ved din planlagte stop-alder (${plan})`} />
        <StatCard label="Flaskehals" value="Ingen fundet" sub={`pengene rækker hele vejen til ${horizonEnd}`} tone="ok" />
        <StatCard label="Frihedspunkt" value={`alder ${freedom}`} sub="tidligst muligt med dine tal" />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[920px] px-[clamp(18px,5vw,40px)]">
        <PublicHeader
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
        </div>

        <p className="mb-14 mt-4 max-w-[58em] border-t border-border pt-[18px] text-[13px] leading-[1.55] text-[color:var(--ink-soft)]">
          En forenklet beregning ud fra dine egne tal og antagelser. Tag tallene som et kvalificeret
          billede, ikke en garanti, og ikke som økonomisk rådgivning.
        </p>
      </div>
    </div>
  );
}
