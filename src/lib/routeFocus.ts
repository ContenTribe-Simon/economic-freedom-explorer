/**
 * Screen-transition focus target (Phase 7 accessibility hardening): the current screen's
 * `[data-route-focus]`-marked h1, falling back to the first main/h1 for screens without
 * the marker. Shared by RouteFocusManager (pathname changes) and AdvancedGate (the
 * door -> app swap, which replaces the whole screen WITHOUT a pathname change) so both
 * kinds of transition land focus by the same rules.
 */
export function focusRouteHeading(): void {
  const target =
    document.querySelector<HTMLElement>("[data-route-focus]") ??
    document.querySelector<HTMLElement>("main h1") ??
    document.querySelector<HTMLElement>("h1");
  if (!target) return;
  // Headings are not natively focusable; a programmatic-only tabindex makes them a valid
  // focus target without adding them to the tab order.
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus();
}
