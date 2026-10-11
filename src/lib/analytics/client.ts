import type { PostHog } from "posthog-js/dist/module.no-external";
import type { ConsentStatus } from "./consent";
import type { CustomEvent } from "./events";
import { scrubEvent, type CaptureEvent } from "./scrub";
import { APP_STORAGE_PREFIXES } from "@/lib/localData";

/**
 * PostHog client (Phase 12 C/D, PR 4). Design: docs/superpowers/specs/2026-10-10-phase12-cd-
 * privacy-golive-design.md §4 PR 4.
 *
 * - Loaded lazily (its own chunk) and only where analytics is enabled: production builds served
 *   from a real host. Dev, unit tests, e2e, local previews and Lovable's editor preview never load
 *   or send anything.
 * - Undecided and declined visitors: cookieless (`cookieless_mode: "on_reject"` with opt-out as the
 *   default), so nothing is stored on the device and the server hashes the IP. Only after "Ja tak"
 *   does PostHog persist an id, in localStorage, never a cookie.
 * - No autocapture, no session replay, no surveys, no remote scripts: the extensions we use
 *   (exception capture, web vitals) are bundled, so the CSP stays `script-src 'self'`.
 * - Every event passes `scrubEvent` (see scrub.ts) before it leaves the browser.
 */

/** Public, write-only project token (PostHog EU project 301528). Safe in browser code by design. */
export const POSTHOG_TOKEN: string = import.meta.env.VITE_POSTHOG_KEY || "phc_sssnhuGFXNvNX5oMGBWuVB59KvRbhxoW2aPhCq7L8oBR";
export const POSTHOG_HOST = "https://eu.i.posthog.com";

/** Test hook: e2e sets this before load to exercise the banner on a local preview (network stubbed). */
declare global {
  interface Window {
    __frihedsmodelAnalyticsForce?: boolean;
  }
}

const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|.*\.localhost|.*\.test)$/;
/** Lovable's editor preview runs a production build on these hosts; our own testing is not usage. */
const PREVIEW_HOST = /(^|\.)lovableproject\.com$|^id-preview--.*\.lovable\.app$|^preview--.*\.lovable\.app$/;

export function analyticsEnabled(opts: { prod: boolean; hostname: string; token: string; force?: boolean }): boolean {
  if (!opts.token.startsWith("phc_")) return false;
  if (opts.force) return true;
  return opts.prod && !LOCAL_HOST.test(opts.hostname) && !PREVIEW_HOST.test(opts.hostname);
}

export function isAnalyticsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return analyticsEnabled({
    prod: import.meta.env.PROD,
    hostname: window.location.hostname,
    token: POSTHOG_TOKEN,
    force: window.__frihedsmodelAnalyticsForce === true,
  });
}

let client: PostHog | null = null;
let loading: Promise<PostHog | null> | null = null;
/** The latest consent asked for; applied once the lazily loaded client is ready. */
let desiredConsent: ConsentStatus = "undecided";
/** Captures made while the SDK chunk loads (a deep link to /resultat tracks on mount). Bounded. */
const MAX_QUEUE = 50;
let queue: Array<(ph: PostHog) => void> = [];

function withClient(fn: (ph: PostHog) => void): void {
  if (client) return fn(client);
  if (!loading || queue.length >= MAX_QUEUE) return;
  queue.push(fn);
}

/** Drops PostHog's own browser storage (its persisted id and consent flag). */
export function clearPosthogStorage(storage: Pick<Storage, "length" | "key" | "removeItem"> = window.localStorage): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (k && APP_STORAGE_PREFIXES.some((p) => k.startsWith(p))) keys.push(k);
    }
    keys.forEach((k) => storage.removeItem(k));
  } catch {
    // Storage blocked: nothing persisted there either.
  }
}

export function initAnalytics(consent: ConsentStatus): Promise<PostHog | null> {
  if (!isAnalyticsEnabled()) return Promise.resolve(null);
  desiredConsent = consent;
  if (loading) return loading;
  loading = (async () => {
    const [{ default: posthog }] = await Promise.all([
      import("posthog-js/dist/module.no-external"),
      import("posthog-js/dist/exception-autocapture"),
      import("posthog-js/dist/web-vitals"),
    ]);
    posthog.init(POSTHOG_TOKEN, {
      api_host: POSTHOG_HOST,
      cookieless_mode: "on_reject",
      opt_out_capturing_by_default: true,
      opt_out_capturing_persistence_type: "localStorage",
      persistence: "localStorage",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      // The PostHog project has heatmaps on by default; click positions and dead clicks are not
      // part of the agreed event list (scrubEvent would drop them anyway).
      enable_heatmaps: false,
      capture_dead_clicks: false,
      disable_external_dependency_loading: true,
      capture_exceptions: true,
      capture_performance: { web_vitals: true, network_timing: false },
      person_profiles: "identified_only",
      before_send: (event) => scrubEvent(event as unknown as CaptureEvent) as unknown as typeof event,
    });
    client = posthog;
    // Whatever the visitor chose while the chunk loaded wins over the status init started with.
    applyConsent(desiredConsent);
    const pending = queue;
    queue = [];
    pending.forEach((fn) => fn(posthog));
    return posthog;
  })().catch(() => {
    queue = [];
    return null;
  });
  return loading;
}

/** Brings PostHog in line with our consent record. */
export function applyConsent(consent: ConsentStatus): void {
  desiredConsent = consent;
  if (!client) return;
  const current = client.get_explicit_consent_status();
  if (consent === "granted") {
    if (current !== "granted") client.opt_in_capturing({ captureEventName: false });
  } else if (current === "granted") {
    // Withdrawn (or our record was reset): back to cookieless and forget the stored id.
    client.opt_out_capturing();
    clearPosthogStorage();
  }
}

export function track(event: CustomEvent | "$pageview", properties?: Record<string, unknown>): void {
  withClient((ph) => ph.capture(event, properties));
}

export function trackPageview(pathname: string): void {
  track("$pageview", { $current_url: `${window.location.origin}${pathname}` });
}

export function reportError(error: unknown): void {
  withClient((ph) => ph.captureException(error));
}
