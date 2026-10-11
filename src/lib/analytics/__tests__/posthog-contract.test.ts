/**
 * Contract test against the REAL posthog-js (no mock): our before_send filter must leave PostHog's
 * own ingestion fields on a real SDK event. Regression for 2026-10-11, when custom events silently
 * never arrived in PostHog because the filter stripped the unprefixed `token` property.
 * Nothing is sent: the recording before_send returns null.
 */
import { describe, expect, it } from "vitest";
import posthog from "posthog-js/dist/module.no-external";
import { scrubEvent, type CaptureEvent } from "../scrub";

describe("scrubEvent on real posthog-js events", () => {
  it("keeps token and distinct_id on custom events and page views, drops our own properties", () => {
    const seen: Array<CaptureEvent | null> = [];
    posthog.init("phc_contract_test", {
      api_host: "http://127.0.0.1:9",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_external_dependency_loading: true,
      advanced_disable_flags: true,
      persistence: "memory",
      before_send: (e) => {
        seen.push(scrubEvent(e as unknown as CaptureEvent));
        return null;
      },
    });
    posthog.capture("calculation_completed", { monthlySavings: 9876 });
    posthog.capture("$pageview", { $current_url: "https://x.dk/resultat#d=abc" });

    const [custom, pageview] = seen;
    expect(custom?.event).toBe("calculation_completed");
    expect(custom?.properties?.token).toBe("phc_contract_test");
    expect(custom?.properties?.distinct_id).toBeTruthy();
    expect(custom?.properties).not.toHaveProperty("monthlySavings");
    expect(pageview?.properties?.token).toBe("phc_contract_test");
    expect(pageview?.properties?.$current_url).toBe("https://x.dk/resultat");
  });
});
