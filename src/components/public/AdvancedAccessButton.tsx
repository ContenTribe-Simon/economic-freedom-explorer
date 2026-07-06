import { Link } from "react-router-dom";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The persistent, low-key access point to the advanced app — the same small corner button on
 * every public screen (product decision 2026-07-05, superseding the earlier single-link
 * placement on Save/Share; see the spec doc's Advanced-door section). It links to /dashboard
 * and therefore goes through the AdvancedGate door like any other advanced URL: on a fresh
 * device it lands ON the door page, never past it. Discoverability changed, gating didn't.
 */
export function AdvancedAccessButton() {
  return (
    <Button
      asChild
      variant="ghost"
      size="sm"
      className="text-[13px] font-medium text-[color:var(--ink-soft)] hover:text-foreground [&_svg]:size-[15px]"
    >
      <Link to="/dashboard">
        <Layers aria-hidden="true" />
        {/* Icon-only on narrow phones (the header's tightest case); sr-only keeps the
            accessible name "Avanceret" identical across breakpoints. */}
        <span className="max-sm:sr-only">Avanceret</span>
      </Link>
    </Button>
  );
}

export const ADVANCED_NO_CARRY_OVER_NOTE =
  "Den avancerede model har sine egne tal. Tallene fra beregningen her følger ikke med.";

/**
 * The no-carry-over reminder that accompanies EVERY advanced access point (Codex round 2):
 * a returning user whose door is already open never sees DoorPage's clarification again, so
 * this note is the only thing telling them the public numbers do not carry over. Rendered
 * unconditionally next to the corner button (via PublicHeader / Start's header) and next to
 * Resultat's action-row CTA — one component, one string, so the surfaces cannot drift apart.
 */
export function AdvancedNoCarryOverNote({ className }: { className?: string }) {
  return (
    <p
      className={cn("m-0 text-[13px] leading-[1.5] text-[color:var(--ink-soft)]", className)}
      data-testid="advanced-no-carryover-note"
    >
      {ADVANCED_NO_CARRY_OVER_NOTE}
    </p>
  );
}
