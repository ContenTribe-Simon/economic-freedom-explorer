import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { initAnalytics, isAnalyticsEnabled, trackPageview } from "@/lib/analytics/client";
import { useConsentStore } from "@/lib/analytics/consentStore";
import { ConsentBanner } from "./ConsentBanner";

/**
 * Mounts analytics once per page load (Phase 12 C/D, PR 4): starts PostHog in line with the
 * stored consent, records a page view per route (path only, never query or fragment) and shows
 * the consent banner. Renders nothing where analytics is disabled (dev, tests, local previews).
 */
export function AnalyticsRoot() {
  const { pathname } = useLocation();
  const enabled = isAnalyticsEnabled();

  useEffect(() => {
    if (enabled) void initAnalytics(useConsentStore.getState().status);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void initAnalytics(useConsentStore.getState().status).then(() => trackPageview(pathname));
  }, [enabled, pathname]);

  return enabled ? <ConsentBanner /> : null;
}
