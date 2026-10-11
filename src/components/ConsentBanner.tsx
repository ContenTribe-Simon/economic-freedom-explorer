import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useConsentStore } from "@/lib/analytics/consentStore";

/**
 * Consent banner (Phase 12 C/D, PR 4). Shown while the visitor has not chosen, or when reopened
 * from "Cookie-indstillinger". Two equally weighted answers, nothing pre-selected, and the page
 * stays usable behind it (not a modal): saying nothing simply keeps the cookieless default.
 */
export function ConsentBanner() {
  const status = useConsentStore((s) => s.status);
  const settingsOpen = useConsentStore((s) => s.settingsOpen);
  const choose = useConsentStore((s) => s.choose);
  if (status !== "undecided" && !settingsOpen) return null;

  return (
    <section
      role="region"
      aria-labelledby="consent-title"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] print:hidden"
    >
      <div className="mx-auto max-w-[640px] rounded-[16px] border border-border bg-card p-5 shadow-[0_12px_40px_-16px_rgba(23,48,43,0.35)]">
        <h2 id="consent-title" className="m-0 font-display text-[19px] font-normal text-foreground">
          Må vi huske din browser?
        </h2>
        <p className="mt-2 text-[14px] leading-[1.55] text-[color:var(--ink-soft)]">
          Vi måler, hvilke sider der bliver brugt, og om noget går galt, så vi kan gøre Frihedsmodel bedre. Dine
          tal bliver aldrig sendt med. Siger du ja, gemmer vi et tilfældigt id i din browser, så vi kan se
          gentagne besøg. Siger du nej, tæller vi kun anonymt og gemmer intet på din enhed.{" "}
          <Link to="/privatliv" className="font-semibold text-[color:var(--fjord)] hover:underline">
            Læs mere
          </Link>
        </p>
        {status !== "undecided" && (
          <p className="mt-2 text-[13px] text-[color:var(--ink-soft)]">
            Dit nuværende valg: {status === "granted" ? "Ja tak" : "Nej tak"}.
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-2.5">
          <Button variant="outline" onClick={() => choose("granted")}>
            Ja tak
          </Button>
          <Button variant="outline" onClick={() => choose("denied")}>
            Nej tak
          </Button>
        </div>
      </div>
    </section>
  );
}
