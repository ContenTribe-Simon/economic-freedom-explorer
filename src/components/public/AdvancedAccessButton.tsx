import { Link } from "react-router-dom";
import { Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

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
        Avanceret
      </Link>
    </Button>
  );
}
