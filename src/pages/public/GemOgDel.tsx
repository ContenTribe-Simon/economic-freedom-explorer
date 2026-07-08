import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, CheckCircle2, Download, ExternalLink, Share2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PublicHeader } from "@/components/public/PublicHeader";
import { usePublicStore } from "@/store/publicStore";
import { computePublicResult, DEFAULT_SIMPLE_INPUTS } from "@/lib/finance/public";
import { formatDaLongDate, formatKr, headlineStopAge } from "@/lib/publicFormat";
import { shareUrlFor } from "@/lib/publicShare";
import "./start.css";

/**
 * Save/Share — the last screen of the public Frihedsmodel flow (Phase 5/11 local scope).
 * Ported from design-reference/gem-og-del.html. Saving is local-only (usePublicStore persist,
 * "Gemmes kun på din egen enhed"); the share link carries the inputs in the URL itself, so no
 * backend or account is involved. Computation goes through the public adapter only.
 */

export default function GemOgDel() {
  const navigate = useNavigate();
  const inputs = usePublicStore((s) => s.inputs);
  const saved = usePublicStore((s) => s.saved);
  const saveCalculation = usePublicStore((s) => s.saveCalculation);
  const removeCalculation = usePublicStore((s) => s.removeCalculation);
  const loadCalculation = usePublicStore((s) => s.loadCalculation);
  const replaceInputs = usePublicStore((s) => s.replaceInputs);

  const result = useMemo(() => computePublicResult(inputs), [inputs]);
  const shareUrl = useMemo(() => shareUrlFor(inputs), [inputs]);

  const [name, setName] = useState("Min plan");
  const [justSaved, setJustSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const savedTimer = useRef<number | undefined>(undefined);
  const copyTimer = useRef<number | undefined>(undefined);
  const shareFieldRef = useRef<HTMLInputElement>(null);

  // Clear both confirmation timers on unmount. The same-handler clears in onSave/onCopy
  // only debounce re-clicks; without this, a pending setJustSaved/setCopied outlives the
  // component — dead work in the app, and in the test suite it can outlive the file's
  // jsdom teardown and fire with `window` gone (unhandled ReferenceError, non-zero exit
  // with all assertions green). Cleanup-only: the visible 2600/2200 ms confirmation
  // timings are unchanged.
  useEffect(() => {
    return () => {
      window.clearTimeout(savedTimer.current);
      window.clearTimeout(copyTimer.current);
    };
  }, []);

  const onSave = () => {
    saveCalculation(name);
    setJustSaved(true);
    window.clearTimeout(savedTimer.current);
    savedTimer.current = window.setTimeout(() => setJustSaved(false), 2600);
  };

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Clipboard unavailable or denied: never claim success. Select the link field instead
      // so the user can copy manually.
      shareFieldRef.current?.focus();
      shareFieldRef.current?.select();
      return;
    }
    setCopied(true);
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 2200);
  };

  const onOpen = (id: string) => {
    if (loadCalculation(id)) navigate("/resultat");
  };

  // Summary-preview copy from the real result (exact figures).
  const onOrTight = result.status.kind !== "off_track";
  // Same "Du kan stoppe ved" age as the Result headline — the shared status-aware helper (the
  // plan on tight, the corrected earliest on track), so the saved/printed summary can never
  // disagree with the result page the user just read. A status-blind min() here once diverged:
  // a tight plan whose goal-reaching age lay BELOW the plan printed that lower age while the
  // Result page said the plan (CI counterexample, earliest 40 vs plan 51).
  const previewHeadline = onOrTight ? (
    <>
      Du kan stoppe ved{" "}
      <span className="italic text-[color:var(--fjord)]">
        alder {headlineStopAge(result.status.kind, result.earliestSustainableStopAge, result.desiredStopAge)}
      </span>
      .
    </>
  ) : (
    <>
      Pengene rækker til <span className="italic text-[color:var(--fjord)]">alder {result.moneyLastsToAge}</span>.
    </>
  );
  const previewNumbers = `Formue ved stop ${formatKr(result.capitalAtStopAge)} · pengene rækker til ${result.moneyLastsToAge}`;

  // The percent shown in the printed summary (comma decimal, no hedging).
  const returnPct = `${(inputs.expectedRealReturn * 100).toFixed(1).replace(".", ",")} %`;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Printed summary — what "Hent som PDF" actually delivers: the answer plus the numbers
          the user typed in, nothing else. Screen-only chrome is print-hidden below. */}
      <section className="hidden print:block">
        <div className="mb-6 flex items-baseline justify-between border-b border-border pb-3">
          <span className="font-display text-[21px] font-medium">Frihedsmodel</span>
          <span className="text-[12px] text-[color:var(--ink-soft)]">{formatDaLongDate(Date.now())}</span>
        </div>
        <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
          Dit svar · {result.status.label}
        </p>
        <h1 className="mb-1 mt-2 font-display text-[26px] font-light leading-tight">{previewHeadline}</h1>
        <p className="m-0 text-[13px] text-[color:var(--ink-soft)]">{previewNumbers}</p>

        <h2 className="mb-2 mt-6 font-display text-[17px] font-normal">Nøgletal</h2>
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            <tr>
              <td className="py-1 pr-4 text-[color:var(--ink-soft)]">Formue når du stopper (alder {result.desiredStopAge})</td>
              <td className="py-1 text-right num">{formatKr(result.capitalAtStopAge)}</td>
            </tr>
            {result.capitalAtPensionAccessAge != null && (
              <tr>
                <td className="py-1 pr-4 text-[color:var(--ink-soft)]">Når pensionen bliver tilgængelig (alder {inputs.pensionAccessAge})</td>
                <td className="py-1 text-right num">{formatKr(result.capitalAtPensionAccessAge)}</td>
              </tr>
            )}
            <tr>
              <td className="py-1 pr-4 text-[color:var(--ink-soft)]">Ved planens slutning (alder {result.lifeExpectancy})</td>
              <td className="py-1 text-right num">{formatKr(result.capitalAtEndOfHorizon)}</td>
            </tr>
            <tr>
              <td className="py-1 pr-4 text-[color:var(--ink-soft)]">Pengene rækker til</td>
              <td className="py-1 text-right num">alder {result.moneyLastsToAge}</td>
            </tr>
            {result.bottleneck.kind === "shortfall" && (
              <tr>
                <td className="py-1 pr-4 text-[color:var(--ink-soft)]">Flaskehals fra alder {result.bottleneck.firstShortfallAge}</td>
                <td className="py-1 text-right num">{formatKr(result.bottleneck.monthlyGap)} om måneden mangler</td>
              </tr>
            )}
          </tbody>
        </table>

        <h2 className="mb-2 mt-6 font-display text-[17px] font-normal">Dine tal</h2>
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            {(
              [
                ["Din alder", `${inputs.currentAge} år`],
                ["Planlæg til alder", `${inputs.lifeExpectancy} år`],
                ["Årlig indkomst før skat", formatKr(inputs.annualIncome)],
                ["Månedligt forbrug", formatKr(inputs.monthlySpending)],
                ["Investeringer og opsparing", formatKr(inputs.currentInvestments)],
                ["Månedlig opsparing", formatKr(inputs.monthlySavings)],
                ["Pensionssaldo", formatKr(inputs.pensionBalance)],
                ["Pension tilgængelig fra alder", `${inputs.pensionAccessAge} år`],
                ["Forventet årligt afkast", returnPct],
                ["Ønsket stop-alder", `${inputs.desiredStopAge} år`],
                ...((inputs.fiTargetMinNetWorth ?? 0) > 0
                  ? [["Mål for mindste formue ved planens slutning", formatKr(inputs.fiTargetMinNetWorth ?? 0)] as [string, string]]
                  : []),
              ] as [string, string][]
            ).map(([label, value]) => (
              <tr key={label}>
                <td className="py-1 pr-4 text-[color:var(--ink-soft)]">{label}</td>
                <td className="py-1 text-right num">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <p className="mt-6 border-t border-border pt-3 text-[11.5px] leading-[1.5] text-[color:var(--ink-soft)]">
          Alle beløb er i nutidskroner. En forenklet beregning ud fra dine egne tal og antagelser.
          Tag tallene som et kvalificeret billede, ikke en garanti, og ikke som økonomisk rådgivning.
        </p>
      </section>

      <div className="mx-auto max-w-[720px] px-[clamp(18px,5vw,40px)] print:hidden">
        <PublicHeader
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/resultat">
                <ArrowLeft aria-hidden="true" />
                Tilbage til svaret
              </Link>
            </Button>
          }
        />

        <section className="fm-rise pt-[clamp(34px,6vw,58px)]">
          <p className="mb-4 text-[12.5px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
            Behold dit svar
          </p>
          {/* data-route-focus, NOT plain "first h1": the print-summary h1 above comes first
              in the DOM and must never be the route-change focus target. */}
          <h1 data-route-focus tabIndex={-1} className="m-0 font-display text-[clamp(30px,5vw,46px)] font-light leading-[1.08] tracking-[-0.015em] text-foreground focus:outline-none">
            Behold dit svar.
          </h1>
          <p className="mt-4 max-w-[32em] text-[clamp(16px,2.2vw,19px)] leading-[1.55] text-[color:var(--ink-soft)]">
            Gem din beregning, så du kan vende tilbage til den, eller tag et resumé med dig.
          </p>
        </section>

        <div className="mt-[clamp(28px,4vw,40px)] flex flex-col gap-[18px]">
          {/* 1. Gem beregning */}
          <section
            aria-labelledby="b-save"
            className="fm-rise rounded-[18px] border border-border bg-card p-[clamp(20px,3vw,26px)] shadow-sm"
            style={{ animationDelay: "0.05s" }}
          >
            <div className="mb-1 flex items-center gap-[11px]">
              <span className="inline-flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[color:var(--fjord-soft)] text-[color:var(--fjord)]">
                <Download aria-hidden="true" className="h-[18px] w-[18px]" />
              </span>
              <h2 id="b-save" className="m-0 font-display text-[19px] font-normal tracking-[-0.01em] text-foreground">
                Gem beregning
              </h2>
            </div>
            <p className="m-0 mt-2 text-[13.5px] leading-[1.5] text-[color:var(--ink-soft)]">
              Gemmes kun på din egen enhed. Vi sender ikke dine tal nogen steder.
            </p>
            <div className="mt-4 flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <Label htmlFor="save-name" className="text-[13px] font-semibold text-foreground">
                  Navn på beregningen
                </Label>
                <Input id="save-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 bg-white" />
              </div>
              <Button onClick={onSave} className="[&_svg]:size-[18px]">
                <Check aria-hidden="true" />
                Gem
              </Button>
            </div>
            <div className="mt-2.5 min-h-[20px]">
              <span
                role="status"
                aria-live="polite"
                className={`inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-success transition-opacity motion-reduce:transition-none ${justSaved ? "opacity-100" : "opacity-0"}`}
              >
                {justSaved && (
                  <>
                    <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> Gemt
                  </>
                )}
              </span>
            </div>

            {saved.length > 0 && (
              <>
                <p className="mb-2 mt-[22px] text-[12px] font-semibold uppercase tracking-[0.08em] text-[color:var(--ink-soft)]">
                  Gemte beregninger
                </p>
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                  {saved.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-3 rounded-[11px] border border-border bg-[color:var(--paper-sunk)] px-3.5 py-3"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-[14.5px] font-medium text-foreground">{s.name}</div>
                        <div className="mt-px text-[12.5px] text-[color:var(--ink-soft)]">{formatDaLongDate(s.savedAt)}</div>
                      </div>
                      <div className="flex flex-none items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onOpen(s.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 font-sans text-[14px] font-semibold text-[color:var(--fjord)] hover:bg-[color:var(--fjord-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          Åbn
                        </button>
                        <button
                          type="button"
                          aria-label={`Fjern ${s.name}`}
                          onClick={() => removeCalculation(s.id)}
                          className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-lg text-[color:var(--ink-soft)] hover:bg-white hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Trash2 aria-hidden="true" className="h-[17px] w-[17px]" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* 2. Tag et resumé med */}
          <section
            aria-labelledby="b-summary"
            className="fm-rise rounded-[18px] border border-border bg-card p-[clamp(20px,3vw,26px)] shadow-sm"
            style={{ animationDelay: "0.1s" }}
          >
            <div className="mb-1 flex items-center gap-[11px]">
              <span className="inline-flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[color:var(--fjord-soft)] text-[color:var(--fjord)]">
                <Share2 aria-hidden="true" className="h-[18px] w-[18px]" />
              </span>
              <h2 id="b-summary" className="m-0 font-display text-[19px] font-normal tracking-[-0.01em] text-foreground">
                Tag et resumé med
              </h2>
            </div>
            <p className="m-0 mt-2 text-[13.5px] leading-[1.5] text-[color:var(--ink-soft)]">
              Et resumé med dit svar og de tal, du har tastet ind.
            </p>
            <div className="mt-4 flex flex-wrap gap-2.5">
              <Button variant="outline" className="bg-card [&_svg]:size-[18px]" onClick={() => window.print()}>
                <Download aria-hidden="true" />
                Hent som PDF
              </Button>
            </div>
            <div
              aria-hidden="true"
              className="mt-4 flex items-center gap-4 rounded-[14px] border border-border bg-[color:var(--paper-sunk)] px-4 py-3.5"
            >
              <div className="relative h-20 w-16 flex-none overflow-hidden rounded-lg border border-border bg-card shadow-sm">
                <span className="absolute left-2 top-2 h-[7px] w-[7px] rounded-full bg-[color:var(--dawn)] shadow-[0_0_0_3px_var(--dawn-soft)]" />
                <svg className="absolute inset-x-0 bottom-0" viewBox="0 0 64 36" preserveAspectRatio="none" width="64" height="36">
                  <path d="M0,30 C14,26 22,10 32,8 C42,10 50,22 64,28 L64,36 L0,36 Z" fill="var(--fjord)" fillOpacity="0.1" />
                  <path d="M0,30 C14,26 22,10 32,8 C42,10 50,22 64,28" fill="none" stroke="var(--fjord)" strokeOpacity="0.5" strokeWidth="1.5" />
                </svg>
              </div>
              <div>
                <p className="m-0 font-display text-[15px] leading-[1.25] text-foreground">{previewHeadline}</p>
                <p className="m-0 mt-1.5 text-[12.5px] text-[color:var(--ink-soft)] num">{previewNumbers}</p>
              </div>
            </div>
          </section>

          {/* 3. Del */}
          <section
            aria-labelledby="b-share"
            className="fm-rise rounded-[18px] border border-[color:var(--brand-border)] p-[clamp(20px,3vw,26px)]"
            style={{ animationDelay: "0.15s" }}
          >
            <div className="mb-1 flex items-center gap-[11px]">
              <span className="inline-flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full bg-[color:var(--paper-sunk)] text-[color:var(--ink-soft)]">
                <ExternalLink aria-hidden="true" className="h-[17px] w-[17px]" />
              </span>
              <h2 id="b-share" className="m-0 font-display text-[19px] font-normal tracking-[-0.01em] text-foreground">
                Del
              </h2>
            </div>
            <p className="m-0 mt-2 text-[13.5px] leading-[1.5] text-[color:var(--ink-soft)]">
              Linket indeholder dine tal, så den, du deler med, ser samme beregning.
            </p>
            <div className="mt-4 flex flex-col items-stretch gap-2.5 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <Label htmlFor="share-url" className="text-[13px] font-semibold text-foreground">
                  Link til beregningen
                </Label>
                <Input
                  id="share-url"
                  ref={shareFieldRef}
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.target.select()}
                  className="mt-1.5 bg-white text-[13px]"
                />
              </div>
              <Button variant="outline" className="bg-card [&_svg]:size-[17px]" onClick={onCopy}>
                {copied ? <Check aria-hidden="true" /> : <Share2 aria-hidden="true" />}
                {copied ? "Kopieret" : "Kopiér link"}
              </Button>
            </div>
            <span
              role="status"
              aria-live="polite"
              className={`mt-2.5 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-success transition-opacity motion-reduce:transition-none ${copied ? "opacity-100" : "opacity-0"}`}
            >
              {copied && (
                <>
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" /> Linket er kopieret
                </>
              )}
            </span>
          </section>
        </div>

        <nav
          aria-label="Videre"
          className="fm-rise mb-14 mt-[clamp(26px,4vw,36px)] flex flex-wrap gap-[22px] border-t border-border pt-5"
          style={{ animationDelay: "0.2s" }}
        >
          <Link
            to="/resultat"
            className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-lg px-0.5 py-1 font-sans text-[14.5px] font-semibold text-[color:var(--fjord)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft aria-hidden="true" className="h-4 w-4" /> Tilbage til svaret
          </Link>
          <Link
            to="/start"
            // "Ny beregning" must mean a fresh plan: reset the active inputs to the defaults
            // before navigating, or the intro's "Kom i gang" would reopen the previous numbers.
            // Saved calculations are untouched (that is what "Gem" is for).
            onClick={() => replaceInputs({ ...DEFAULT_SIMPLE_INPUTS })}
            className="inline-flex items-center gap-[7px] whitespace-nowrap rounded-lg px-0.5 py-1 font-sans text-[14.5px] font-semibold text-[color:var(--fjord)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Start en ny beregning <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </nav>

        {/* The advanced access point moved to the shared corner button in PublicHeader
            (product decision 2026-07-05: one consistent treatment on every public screen, no
            special case here). PublicHeader also carries the no-carry-over reminder next to
            that button — a returning user with the door already open never sees DoorPage's
            clarification, so the reminder cannot live only there. */}
      </div>
    </div>
  );
}
