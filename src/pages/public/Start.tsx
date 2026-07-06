import { Link } from "react-router-dom";
import { ArrowRight, Compass, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdvancedAccessButton, AdvancedNoCarryOverNote } from "@/components/public/AdvancedAccessButton";
import "./start.css";

/**
 * Start — the first screen of the public Frihedsmodel onboarding flow
 * (Phase 5). Ported from design-reference/start.html onto the app's own
 * design tokens, self-hosted fonts and shadcn components. Renders outside
 * the advanced AppShell (see the public routes in App.tsx).
 */

const POINTS = [
  {
    icon: Wallet,
    title: "Dine egne tal",
    help: "Bygget på de tal, du selv taster ind.",
  },
  {
    icon: Compass,
    title: "Et klart svar",
    help: "Du får svaret i ét blik, ikke en rapport.",
  },
  {
    icon: ShieldCheck,
    title: "Ikke rådgivning",
    // No paraphrase of the canonical disclaimer here: the trust strip below carries the exact
    // global text (spec Screen A), and near-variants of it are what the copy rule forbids.
    help: "Værktøjet regner på dine tal. Beslutningerne er dine.",
  },
] as const;

/** Decorative horizon motif: faint single curve with a small sunrise marker. */
function Motif() {
  const W = 1200;
  const H = 300;
  const base = 250;
  const d =
    `M0,${base} C150,${base - 30} 280,${base - 120} 460,${base - 150} ` +
    `C620,${base - 176} 760,${base - 150} 900,${base - 96} ` +
    `C1030,${base - 46} 1110,${base - 18} 1200,${base - 8}`;
  const fx = 560;
  const fy = base - 173;
  return (
    <svg
      className="fm-motif pointer-events-none absolute inset-x-0 bottom-0 z-[1] h-[clamp(180px,32vh,300px)] w-full"
      viewBox={`0 0 ${W} ${H}`}
      // The reference file says "xMidYEnd slice", but YEnd is not a valid SVG
      // keyword (browsers ignore it, fall back to xMidYMid meet, and log a
      // console error). xMidYMax is the valid spelling of the evident intent:
      // full-bleed width, curve anchored to the bottom edge.
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="fm-motif-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--fjord)" stopOpacity="0.07" />
          <stop offset="1" stopColor="var(--fjord)" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="fm-motif-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="var(--dawn)" stopOpacity="0.32" />
          <stop offset="1" stopColor="var(--dawn)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path className="fm-motif-fill-path" d={`${d} L${W},${H} L0,${H} Z`} fill="url(#fm-motif-fill)" />
      <path
        className="fm-motif-line"
        d={d}
        fill="none"
        stroke="var(--fjord)"
        strokeOpacity="0.28"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle className="fm-motif-glow" cx={fx} cy={fy} r="26" fill="url(#fm-motif-glow)" />
      <circle className="fm-motif-dot" cx={fx} cy={fy} r="5.5" fill="var(--dawn)" opacity="0.7" />
    </svg>
  );
}

export default function Start() {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-background text-foreground">
      <Motif />

      <header className="relative z-[2] px-[clamp(18px,5vw,40px)] pt-[26px]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden="true"
              className="h-3.5 w-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,var(--dawn-glow),var(--dawn))] shadow-[0_0_0_4px_var(--dawn-soft)]"
            />
            <span className="font-display text-[21px] font-medium tracking-[-0.01em] text-foreground">
              Frihedsmodel
            </span>
          </div>
          {/* Same corner button as PublicHeader renders on the other three public screens. */}
          <AdvancedAccessButton />
        </div>
        {/* Same reminder as PublicHeader: every advanced entry point carries it. */}
        <AdvancedNoCarryOverNote className="mt-1 text-right text-[12px]" />
      </header>

      <main className="relative z-[2] flex flex-1 flex-col items-center justify-center px-[clamp(18px,5vw,40px)] pb-[clamp(48px,9vh,110px)] pt-[clamp(40px,8vh,96px)] text-center">
        <div className="w-full max-w-[660px]">
          <p className="fm-rise mb-[22px] text-[12.5px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
            Frihedsmodel
          </p>
          <h1
            className="fm-rise m-0 font-display text-[clamp(34px,6.4vw,60px)] font-light leading-[1.06] tracking-[-0.018em] text-foreground"
            style={{ animationDelay: "0.04s" }}
          >
            Se hvornår du kan stoppe med at arbejde.
          </h1>
          <p
            className="fm-rise mx-auto mt-6 max-w-[33em] text-[clamp(17px,2.4vw,20px)] leading-[1.6] text-[color:var(--ink-soft)]"
            style={{ animationDelay: "0.1s" }}
          >
            Svar på nogle få spørgsmål om din økonomi, så viser vi dig, hvornår dine penge kan bære
            dig resten af livet. Det tager et par minutter, og du kan altid justere undervejs.
          </p>

          <div
            className="fm-rise mt-[clamp(36px,5vw,52px)] grid grid-cols-1 gap-5 text-left max-sm:mx-auto max-sm:max-w-[22em] sm:grid-cols-3 sm:gap-[18px]"
            style={{ animationDelay: "0.16s" }}
          >
            {POINTS.map((p) => (
              <div className="flex flex-col gap-[9px]" key={p.title}>
                <span className="inline-flex h-[38px] w-[38px] flex-none items-center justify-center rounded-full bg-[color:var(--fjord-soft)] text-[color:var(--fjord)]">
                  <p.icon aria-hidden="true" className="h-[19px] w-[19px]" />
                </span>
                <h2 className="m-0 font-sans text-[15px] font-semibold text-foreground">{p.title}</h2>
                <p className="m-0 text-[13.5px] leading-[1.5] text-[color:var(--ink-soft)]">{p.help}</p>
              </div>
            ))}
          </div>

          <div
            className="fm-rise mt-[clamp(36px,5vw,52px)] flex flex-col items-center gap-3.5"
            style={{ animationDelay: "0.22s" }}
          >
            <Button asChild size="lg" className="h-12 px-7 text-[15px] [&_svg]:size-[18px]">
              <Link to="/simple-inputs">
                Kom i gang
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
            <span className="text-[13.5px] text-[color:var(--ink-soft)]">
              Gratis og uforpligtende. Du taster selv dine tal ind.
            </span>
          </div>
        </div>
      </main>

      {/* Trust strip (persistent, spec Screen A): the single global disclaimer VERBATIM plus
          the real-terms note — same canonical text as Simple Inputs, Resultat and GemOgDel,
          never a paraphrase, and never buried in a tooltip. */}
      <footer className="relative z-[2] px-[clamp(18px,5vw,40px)] pb-6">
        <p className="mx-auto m-0 max-w-[58em] border-t border-border pt-[14px] text-center text-[13px] leading-[1.55] text-[color:var(--ink-soft)]">
          En forenklet beregning ud fra dine egne tal og antagelser. Tag tallene som et
          kvalificeret billede, ikke en garanti, og ikke som økonomisk rådgivning. Alle beløb er
          i nutidskroner.
        </p>
      </footer>
    </div>
  );
}
