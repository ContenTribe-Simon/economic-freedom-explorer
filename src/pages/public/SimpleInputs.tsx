import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight,
  ChevronDown,
  Info,
  ShieldCheck,
  TrendingUp,
  User,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PublicHeader } from "@/components/public/PublicHeader";
import { usePublicStore } from "@/store/publicStore";
import type { SimplePublicInputs } from "@/lib/finance/public";
import "./start.css";

/**
 * Simple Inputs — screen 2 of the public Frihedsmodel flow (Phase 5).
 * Ported from design-reference/simple-inputs.html onto the app's tokens and components.
 *
 * The form reads and writes the REAL public input state (usePublicStore →
 * SimplePublicInputs); the Result screen computes from the same state via the
 * public adapter. No engine access from here.
 */

const yr = (v: number) => `${v} år`;
const pct = (v: number) => `${v.toFixed(1).replace(".", ",")} %`;

function InfoTip({ tip }: { tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`Mere info: ${tip}`}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[color:var(--ink-soft)] hover:text-[color:var(--fjord)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info aria-hidden="true" className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-[300px] text-[13px] leading-snug">{tip}</TooltipContent>
    </Tooltip>
  );
}

function FieldLabel({ htmlFor, children, tip }: { htmlFor?: string; children: ReactNode; tip?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="inline-flex items-center gap-[7px] font-sans text-[14px] font-semibold text-foreground"
    >
      {children}
      {tip && <InfoTip tip={tip} />}
    </label>
  );
}

function NumField({
  id,
  label,
  tip,
  help,
  value,
  onChange,
  className,
}: {
  id: string;
  label: string;
  tip?: string;
  help?: string;
  value: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <FieldLabel htmlFor={id} tip={tip}>
        {label}
      </FieldLabel>
      <div className="relative">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          value={value}
          onChange={(e) => {
            // Clamp in the handler itself: `min={0}` on a native number input is cosmetic
            // (marks :invalid, never blocks the value), and the CTA is a Link, so constraint
            // validation would never fire. NaN (cleared field / bad paste) becomes 0. The
            // store sanitizer re-clamps to the spec §4.1 maxima as the hard boundary.
            const n = e.target.valueAsNumber;
            onChange(Number.isFinite(n) ? Math.max(0, n) : 0);
          }}
          className="bg-white pr-12 text-[15px]"
        />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[13px] font-medium text-[color:var(--ink-soft)]">
          kr
        </span>
      </div>
      {help && <span className="text-[13px] leading-[1.45] text-[color:var(--ink-soft)]">{help}</span>}
    </div>
  );
}

function LeverField({
  id,
  label,
  tip,
  help,
  value,
  min,
  max,
  step,
  onChange,
  format,
  className,
}: {
  id: string;
  label: string;
  tip?: string;
  help?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  format: (v: number) => string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel htmlFor={id} tip={tip}>
          {label}
        </FieldLabel>
        <span className="whitespace-nowrap font-sans text-[14.5px] font-semibold text-[color:var(--fjord)] num">
          {format(value)}
        </span>
      </div>
      <Slider
        id={id}
        aria-label={label}
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
        className="py-1.5"
      />
      {help && <span className="text-[13px] leading-[1.45] text-[color:var(--ink-soft)]">{help}</span>}
    </div>
  );
}

function Group({
  icon,
  title,
  sub,
  delay,
  children,
}: {
  icon: ReactNode;
  title: string;
  sub: string;
  delay?: string;
  children: ReactNode;
}) {
  return (
    <section
      className="fm-rise rounded-[18px] border border-border bg-card p-[clamp(20px,3vw,28px)] shadow-sm"
      style={delay ? { animationDelay: delay } : undefined}
    >
      <div className="mb-5 flex items-center gap-[11px]">
        <span className="inline-flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[color:var(--fjord-soft)] text-[color:var(--fjord)]">
          {icon}
        </span>
        <div>
          <h2 className="m-0 font-display text-[20px] font-normal tracking-[-0.01em] text-foreground">{title}</h2>
          <p className="m-0 mt-px text-[13px] text-[color:var(--ink-soft)]">{sub}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-x-7 gap-y-[22px] sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function SimpleInputs() {
  const inputs = usePublicStore((s) => s.inputs);
  const setInputs = usePublicStore((s) => s.setInputs);
  const [showOptional, setShowOptional] = useState((inputs.fiTargetMinNetWorth ?? 0) > 0);

  const set = (patch: Partial<SimplePublicInputs>) => setInputs(patch);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[920px] px-[clamp(18px,5vw,40px)]">
        <PublicHeader
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/resultat">Spring til svar</Link>
            </Button>
          }
        />

        <section className="fm-rise max-w-[720px] pt-[clamp(34px,6vw,60px)]">
          <p className="mb-4 text-[12.5px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
            Dine tal
          </p>
          <h1 className="m-0 font-display text-[clamp(28px,5vw,46px)] font-light leading-[1.1] tracking-[-0.015em] text-foreground">
            Skriv dine tal ind, så regner vi dit svar ud.
          </h1>
          <p className="mt-4 max-w-[33em] text-[clamp(16px,2.2vw,18px)] leading-[1.55] text-[color:var(--ink-soft)]">
            Felterne er fyldt ud med almindelige tal, så du kan se et svar med det samme. Ret det,
            der ikke passer til dig. Alle beløb er i nutidskroner.
          </p>
        </section>

        <div className="mt-[clamp(28px,4vw,40px)] flex flex-col gap-[clamp(20px,3vw,28px)]">
          <Group icon={<User aria-hidden="true" className="h-[18px] w-[18px]" />} title="Dig" sub="Hvem planen er for, og hvor langt den skal nå." delay="0.05s">
            <LeverField
              id="lv-alder"
              label="Din alder"
              value={inputs.currentAge}
              min={18}
              max={75}
              step={1}
              onChange={(v) => set({ currentAge: v })}
              format={yr}
            />
            <LeverField
              id="lv-plan"
              label="Planlæg til alder"
              tip="Den alder planen skal nå. Vælg gerne lidt højt, så pengene rækker hele livet."
              help="Mange regner med 90."
              value={inputs.lifeExpectancy}
              // The horizon must stay beyond the current age (a shorter horizon would leave the
              // projection empty); the store sanitizer enforces the same rule on every write.
              min={Math.max(70, inputs.currentAge + 1)}
              max={105}
              step={1}
              onChange={(v) => set({ lifeExpectancy: v })}
              format={yr}
            />
          </Group>

          <Group icon={<Wallet aria-hidden="true" className="h-[18px] w-[18px]" />} title="Din økonomi i dag" sub="Det du tjener, bruger og har lagt til side." delay="0.1s">
            <NumField
              id="f-income"
              label="Årlig indkomst før skat"
              tip="Din løn før skat, om året. Tæl gerne faste tillæg med."
              help="kr om året, i nutidskroner."
              value={inputs.annualIncome}
              onChange={(v) => set({ annualIncome: v })}
            />
            <NumField
              id="f-spend"
              label="Månedligt forbrug"
              help="Det du regner med at bruge om måneden."
              value={inputs.monthlySpending}
              onChange={(v) => set({ monthlySpending: v })}
            />
            <NumField
              id="f-savings"
              label="Nuværende investeringer og opsparing"
              tip="Alt du har stående, ud over pension: aktier, fonde og frie penge."
              value={inputs.currentInvestments}
              onChange={(v) => set({ currentInvestments: v })}
            />
            <NumField
              id="f-msaving"
              label="Månedlig opsparing"
              help="Det du lægger til side hver måned."
              value={inputs.monthlySavings}
              onChange={(v) => set({ monthlySavings: v })}
            />
          </Group>

          <Group icon={<ShieldCheck aria-hidden="true" className="h-[18px] w-[18px]" />} title="Pension" sub="Det du har sparet op, og hvornår du kan bruge det." delay="0.15s">
            <NumField
              id="f-pension"
              label="Pensionssaldo"
              tip="Det samlede beløb på dine pensionsordninger i dag."
              help="Saml gerne flere ordninger til ét tal."
              value={inputs.pensionBalance}
              onChange={(v) => set({ pensionBalance: v })}
            />
            <LeverField
              id="lv-pfrom"
              label="Pension tilgængelig fra alder"
              tip="Den alder, hvor du kan begynde at hæve din pension. Ofte 67."
              value={inputs.pensionAccessAge}
              min={60}
              max={75}
              step={1}
              onChange={(v) => set({ pensionAccessAge: v })}
              format={yr}
            />
          </Group>

          <Group icon={<TrendingUp aria-hidden="true" className="h-[18px] w-[18px]" />} title="Forventninger og mål" sub="Hvad du venter af afkastet, og hvornår du gerne vil stoppe." delay="0.2s">
            <LeverField
              id="lv-return"
              label="Forventet årligt afkast"
              tip="Afkast efter inflation, altså i nutidskroner. 4 til 5 % er almindeligt på lang sigt."
              help="Efter inflation."
              value={Math.round(inputs.expectedRealReturn * 1000) / 10}
              min={0}
              max={8}
              step={0.1}
              onChange={(v) => set({ expectedRealReturn: Math.round(v * 10) / 1000 })}
              format={pct}
            />
            <LeverField
              id="lv-stop"
              label="Ønsket stop-alder"
              tip="Den alder, du gerne vil stoppe med at arbejde. Vi viser, om tallene rækker."
              value={inputs.desiredStopAge}
              // The stop age tracks the spec range currentAge–lifeExpectancy; the store
              // sanitizer enforces the same rule on every write.
              min={Math.max(40, inputs.currentAge)}
              max={75}
              step={1}
              onChange={(v) => set({ desiredStopAge: v })}
              format={yr}
            />

            <div className="col-span-full mt-0.5 border-t border-border pt-[18px]">
              <button
                type="button"
                aria-expanded={showOptional}
                onClick={() => setShowOptional((o) => !o)}
                className="inline-flex items-center gap-2 font-sans text-[14.5px] font-semibold text-[color:var(--fjord)]"
              >
                <ChevronDown
                  aria-hidden="true"
                  className={`h-4 w-4 transition-transform motion-reduce:transition-none ${showOptional ? "rotate-180" : ""}`}
                />
                Valgfrit: mål for formue ved planens slutning
              </button>
              {showOptional && (
                <div className="mt-4 sm:max-w-[calc(50%-14px)]">
                  <NumField
                    id="f-minend"
                    label="Mål for mindste formue ved planens slutning"
                    tip="Vil du efterlade noget, eller have en buffer til sidst? Lad stå på 0, hvis pengene bare skal række."
                    help="0 betyder, at pengene må nå at blive brugt op."
                    value={inputs.fiTargetMinNetWorth ?? 0}
                    onChange={(v) => set({ fiTargetMinNetWorth: v })}
                  />
                </div>
              )}
            </div>
          </Group>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-[14px] border border-border bg-card px-4 py-3.5 text-[13.5px] leading-[1.5] text-[color:var(--ink-soft)]">
          <Info aria-hidden="true" className="mt-0.5 h-[18px] w-[18px] flex-none text-[color:var(--fjord)]" />
          <p className="m-0">
            Alle beløb er i nutidskroner, så de er sammenlignelige med dagens priser. En forenklet
            beregning ud fra dine egne tal og antagelser. Tag tallene som et kvalificeret billede,
            ikke en garanti, og ikke som økonomisk rådgivning.
          </p>
        </div>

        <div className="mb-14 mt-[clamp(26px,4vw,36px)] flex flex-wrap items-center gap-[18px]">
          <Button asChild size="lg" className="h-12 px-7 text-[15px] [&_svg]:size-[18px]">
            <Link to="/resultat">
              Se mit svar
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
          <span className="text-[13.5px] text-[color:var(--ink-soft)]">Du kan altid rette tallene bagefter.</span>
        </div>
      </div>
    </div>
  );
}
