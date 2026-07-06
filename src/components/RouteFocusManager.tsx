import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

/**
 * Route-level focus management (Phase 7 accessibility hardening): after every client-side
 * navigation, focus moves to the new screen's heading so keyboard and screen-reader users
 * get an explicit signal that the page changed — before this, focus silently stayed on
 * <body>. The target is the screen's `[data-route-focus]`-marked h1 (explicit marker
 * because e.g. GemOgDel renders a print-only h1 EARLIER in the DOM than its visible
 * heading), falling back to the first h1 for screens that have not opted in (the advanced
 * pages). The browser's default focus is deliberately left alone on initial page load —
 * stealing it there would skip the skip-link/address-bar conventions users expect.
 */
export function RouteFocusManager() {
  const { pathname } = useLocation();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const target =
      document.querySelector<HTMLElement>("[data-route-focus]") ??
      document.querySelector<HTMLElement>("main h1") ??
      document.querySelector<HTMLElement>("h1");
    if (!target) return;
    // Headings are not natively focusable; a programmatic-only tabindex makes them a valid
    // focus target without adding them to the tab order.
    if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
    target.focus();
  }, [pathname]);

  return null;
}
