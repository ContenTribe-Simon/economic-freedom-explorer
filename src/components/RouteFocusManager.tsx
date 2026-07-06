import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { focusRouteHeading } from "@/lib/routeFocus";

/**
 * Route-level focus management (Phase 7 accessibility hardening): after every client-side
 * navigation, focus moves to the new screen's heading (see lib/routeFocus.ts for the
 * target rules) so keyboard and screen-reader users get an explicit signal that the page
 * changed — before this, focus silently stayed on <body>.
 *
 * Initial page load NEVER steals focus — the browser and screen reader own initial-load
 * orientation; we only manage transitions the user made inside the app. That covers two
 * cases (Codex round 2): the very first effect run (no previous pathname), AND the app's
 * root redirect: "/" renders only <Navigate to="/start">, a user cannot act on it, so a
 * transition OUT of "/" is still the initial load, just spelled as two pathnames. Landing
 * via "/" must behave exactly like landing on /start directly.
 *
 * The Advanced door -> app swap happens WITHOUT a pathname change (AdvancedGate swaps
 * children by state); AdvancedGate triggers focusRouteHeading itself for that transition.
 */
export function RouteFocusManager() {
  const { pathname } = useLocation();
  const prevPathname = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevPathname.current;
    prevPathname.current = pathname;
    if (prev === null || prev === "/") return;
    focusRouteHeading();
  }, [pathname]);

  return null;
}
