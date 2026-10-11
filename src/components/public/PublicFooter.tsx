import { Link } from "react-router-dom";
import { PUBLIC_DISCLAIMER, REAL_TERMS_NOTE } from "@/lib/publicCopy";
import { FEEDBACK_MAILTO, LEGAL_ENTITY } from "@/lib/legalEntity";
import { isAnalyticsEnabled } from "@/lib/analytics/client";
import { useConsentStore } from "@/lib/analytics/consentStore";

/**
 * Shared footer for the public Frihedsmodel screens (Phase 12 C/D, PR 3): the single global
 * disclaimer plus the real-terms note, and the links every public screen needs (privacy page,
 * feedback mail, and "Cookie-indstillinger" where analytics runs). A screen that already shows the
 * disclaimer in its own context (Simple Inputs' info box) passes `withDisclaimer={false}` so the sentence appears exactly once per screen.
 * The feedback address is also shown as text: a mailto link may do nothing without a mail app.
 */
export function PublicFooter({ withDisclaimer = true, className = "" }: { withDisclaimer?: boolean; className?: string }) {
  const openSettings = useConsentStore((s) => s.openSettings);
  return (
    <footer className={`border-t border-border pt-[14px] text-[13px] leading-[1.55] text-[color:var(--ink-soft)] ${className}`}>
      {withDisclaimer && (
        <p className="m-0 max-w-[58em]">
          {PUBLIC_DISCLAIMER} {REAL_TERMS_NOTE}
        </p>
      )}
      <nav aria-label="Om siden" className={`flex flex-wrap items-center gap-x-5 gap-y-1.5 ${withDisclaimer ? "mt-3" : ""}`}>
        <Link
          to="/privatliv"
          className="font-semibold text-[color:var(--fjord)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Privatliv
        </Link>
        <a
          href={FEEDBACK_MAILTO}
          className="font-semibold text-[color:var(--fjord)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Giv feedback
        </a>
        {/* Only where analytics runs: there is no choice to change anywhere else. */}
        {isAnalyticsEnabled() && (
          <button
            type="button"
            onClick={openSettings}
            className="font-semibold text-[color:var(--fjord)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Cookie-indstillinger
          </button>
        )}
        <span>{LEGAL_ENTITY.email}</span>
      </nav>
    </footer>
  );
}
