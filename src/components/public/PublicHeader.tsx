import type { ReactNode } from "react";
import { AdvancedAccessButton, AdvancedNoCarryOverNote } from "./AdvancedAccessButton";

/**
 * Shared header for the public Frihedsmodel screens: brand mark + wordmark on the left,
 * an optional action (ghost link/button) plus the persistent small "Avanceret" corner button
 * on the right (product decision 2026-07-05: the advanced access point lives in the same
 * corner on every public screen). Ported from the design references' `.top` / `.brand` header.
 * The header carries the no-carry-over reminder under the corner button, so every screen
 * states that the public numbers do not follow along. A screen that owns a closer placement
 * for the reminder (Resultat, next to its "Avanceret model" row CTA) passes
 * `withNoCarryOverNote={false}` — each screen shows the sentence exactly once, never twice.
 */
export function PublicHeader({
  action,
  withNoCarryOverNote = true,
}: {
  action?: ReactNode;
  withNoCarryOverNote?: boolean;
}) {
  return (
    <header className="pt-[26px]">
      {/* flex-wrap + shrinkable right group: on narrow phones the action row wraps under the
          brand instead of overflowing/clipping (the corner button also drops to icon-only there). */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden="true"
            className="h-3.5 w-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,var(--dawn-glow),var(--dawn))] shadow-[0_0_0_4px_var(--dawn-soft)]"
          />
          <span className="font-display text-[21px] font-medium tracking-[-0.01em] text-foreground">
            Frihedsmodel
          </span>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
          {action}
          <AdvancedAccessButton />
        </div>
      </div>
      {withNoCarryOverNote && <AdvancedNoCarryOverNote className="mt-1 text-right text-[12px]" />}
    </header>
  );
}
