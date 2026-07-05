import type { ReactNode } from "react";

/**
 * Shared header for the public Frihedsmodel screens: brand mark + wordmark on the left,
 * an optional action (ghost link/button) on the right. Ported from the design references'
 * `.top` / `.brand` header.
 */
export function PublicHeader({ action }: { action?: ReactNode }) {
  return (
    <header className="flex items-center justify-between pt-[26px]">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,var(--dawn-glow),var(--dawn))] shadow-[0_0_0_4px_var(--dawn-soft)]"
        />
        <span className="font-display text-[21px] font-medium tracking-[-0.01em] text-foreground">
          Frihedsmodel
        </span>
      </div>
      {action}
    </header>
  );
}
