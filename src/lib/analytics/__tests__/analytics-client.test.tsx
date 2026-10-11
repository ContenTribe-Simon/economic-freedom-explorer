/**
 * PR 4 (Phase 12 C/D): where analytics may run, how PostHog is configured, how consent maps onto
 * it, and the banner/footer behaviour. posthog-js is mocked: no network, no real SDK.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const ph = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
  get_explicit_consent_status: vi.fn(() => "pending"),
}));
vi.mock("posthog-js/dist/module.no-external", () => ({ default: ph }));
vi.mock("posthog-js/dist/exception-autocapture", () => ({}));
vi.mock("posthog-js/dist/web-vitals", () => ({}));

async function freshModules() {
  vi.resetModules();
  const client = await import("../client");
  const store = await import("../consentStore");
  return { client, store };
}

beforeEach(() => {
  Object.values(ph).forEach((f) => f.mockClear());
  ph.get_explicit_consent_status.mockReturnValue("pending");
  localStorage.clear();
  window.__frihedsmodelAnalyticsForce = true;
});
afterEach(() => {
  delete window.__frihedsmodelAnalyticsForce;
});

describe("analyticsEnabled", () => {
  it("runs only in production on a real host with a real token", async () => {
    const { client } = await freshModules();
    const t = "phc_abc";
    expect(client.analyticsEnabled({ prod: true, hostname: "frihedsmodel.dk", token: t })).toBe(true);
    expect(client.analyticsEnabled({ prod: true, hostname: "economic-freedom-explorer.lovable.app", token: t })).toBe(true);
    for (const h of ["localhost", "127.0.0.1", "[::1]", "app.localhost", "site.test"]) {
      expect(client.analyticsEnabled({ prod: true, hostname: h, token: t })).toBe(false);
    }
    expect(client.analyticsEnabled({ prod: false, hostname: "frihedsmodel.dk", token: t })).toBe(false);
    expect(client.analyticsEnabled({ prod: true, hostname: "frihedsmodel.dk", token: "" })).toBe(false);
    expect(client.analyticsEnabled({ prod: false, hostname: "localhost", token: t, force: true })).toBe(true);
  });
});

describe("initAnalytics", () => {
  it("configures PostHog privacy-first", async () => {
    const { client } = await freshModules();
    await client.initAnalytics("undecided");
    expect(ph.init).toHaveBeenCalledTimes(1);
    const [token, cfg] = ph.init.mock.calls[0];
    expect(token).toBe(client.POSTHOG_TOKEN);
    expect(cfg).toMatchObject({
      api_host: "https://eu.i.posthog.com",
      cookieless_mode: "on_reject",
      opt_out_capturing_by_default: true,
      opt_out_capturing_persistence_type: "localStorage",
      persistence: "localStorage",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      disable_external_dependency_loading: true,
    });
    // before_send is our scrubber: an autocapture event is dropped.
    expect(cfg.before_send({ event: "$autocapture", properties: {} })).toBeNull();
    // Undecided: no opt-in.
    expect(ph.opt_in_capturing).not.toHaveBeenCalled();
  });

  it("does nothing where analytics is disabled", async () => {
    delete window.__frihedsmodelAnalyticsForce;
    const { client } = await freshModules();
    expect(await client.initAnalytics("granted")).toBeNull();
    expect(ph.init).not.toHaveBeenCalled();
    client.track("calculation_saved");
    expect(ph.capture).not.toHaveBeenCalled();
  });

  it("initialises once, however often it is called", async () => {
    const { client } = await freshModules();
    await Promise.all([client.initAnalytics("undecided"), client.initAnalytics("undecided")]);
    await client.initAnalytics("undecided");
    expect(ph.init).toHaveBeenCalledTimes(1);
  });
});

describe("applyConsent", () => {
  it("opts in on yes, and on withdrawal opts out and forgets the stored id", async () => {
    const { client } = await freshModules();
    await client.initAnalytics("granted");
    expect(ph.opt_in_capturing).toHaveBeenCalledTimes(1);

    ph.get_explicit_consent_status.mockReturnValue("granted");
    localStorage.setItem("ph_phc_x_posthog", "id");
    localStorage.setItem("unrelated", "keep");
    client.applyConsent("denied");
    expect(ph.opt_out_capturing).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem("ph_phc_x_posthog")).toBeNull();
    expect(localStorage.getItem("unrelated")).toBe("keep");
  });

  it("a stale PostHog opt-in without our record is withdrawn", async () => {
    ph.get_explicit_consent_status.mockReturnValue("granted");
    const { client } = await freshModules();
    await client.initAnalytics("undecided");
    expect(ph.opt_out_capturing).toHaveBeenCalledTimes(1);
  });
});

describe("lazy initialisation races", () => {
  it("a choice made while the SDK loads wins over the status init started with", async () => {
    const { client } = await freshModules();
    const ready = client.initAnalytics("granted");
    client.applyConsent("denied"); // visitor withdraws before the chunk arrived
    await ready;
    expect(ph.opt_in_capturing).not.toHaveBeenCalled();
  });

  it("a quick opt-in during loading is applied once ready", async () => {
    const { client } = await freshModules();
    const ready = client.initAnalytics("undecided");
    client.applyConsent("granted");
    await ready;
    expect(ph.opt_in_capturing).toHaveBeenCalledTimes(1);
  });

  it("captures made during loading are queued and sent once ready", async () => {
    const { client } = await freshModules();
    const ready = client.initAnalytics("undecided");
    client.track("calculation_completed");
    client.reportError(new Error("boom"));
    expect(ph.capture).not.toHaveBeenCalled();
    await ready;
    expect(ph.capture).toHaveBeenCalledWith("calculation_completed", undefined);
    expect(ph.captureException).toHaveBeenCalledTimes(1);
  });
});

describe("page views from AnalyticsRoot", () => {
  async function renderAt(path: string) {
    await freshModules();
    const { AnalyticsRoot } = await import("@/components/AnalyticsRoot");
    render(
      <MemoryRouter initialEntries={[path]}>
        <AnalyticsRoot />
      </MemoryRouter>,
    );
    await vi.waitFor(() => expect(ph.init).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 0));
  }

  it("counts a real screen", async () => {
    await renderAt("/start");
    expect(ph.capture).toHaveBeenCalledWith("$pageview", { $current_url: `${window.location.origin}/start` });
  });

  it("does not count the redirect-only root", async () => {
    await renderAt("/");
    expect(ph.capture).not.toHaveBeenCalledWith("$pageview", expect.anything());
  });
});

describe("tracking", () => {
  it("page views carry only origin + path", async () => {
    const { client } = await freshModules();
    await client.initAnalytics("undecided");
    client.trackPageview("/resultat");
    expect(ph.capture).toHaveBeenCalledWith("$pageview", { $current_url: `${window.location.origin}/resultat` });
  });
});

describe("consent banner and footer", () => {
  async function renderApp() {
    const { store } = await freshModules();
    const { ConsentBanner } = await import("@/components/ConsentBanner");
    const { PublicFooter } = await import("@/components/public/PublicFooter");
    render(
      <MemoryRouter>
        <PublicFooter />
        <ConsentBanner />
      </MemoryRouter>,
    );
    return store;
  }

  it("asks with two equal answers, remembers the choice and hides", async () => {
    await renderApp();
    expect(screen.getByRole("region", { name: "Må vi huske din browser?" })).toBeTruthy();
    const yes = screen.getByRole("button", { name: "Ja tak" });
    const no = screen.getByRole("button", { name: "Nej tak" });
    expect(yes.className).toBe(no.className);
    fireEvent.click(no);
    expect(JSON.parse(localStorage.getItem("frihedsmodel-consent.v1")!).status).toBe("denied");
    expect(screen.queryByRole("region", { name: "Må vi huske din browser?" })).toBeNull();
  });

  it("footer 'Cookie-indstillinger' reopens it with the current choice", async () => {
    localStorage.setItem("frihedsmodel-consent.v1", JSON.stringify({ status: "granted", at: "x", version: 1 }));
    await renderApp();
    expect(screen.queryByRole("region", { name: "Må vi huske din browser?" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cookie-indstillinger" }));
    expect(screen.getByText("Dit nuværende valg: Ja tak.")).toBeTruthy();
  });

  it("the banner copy follows the public copy rules", async () => {
    await renderApp();
    const text = screen.getByRole("region", { name: "Må vi huske din browser?" }).textContent ?? "";
    expect(text).not.toContain("—");
    expect(text).toContain("Dine tal bliver aldrig sendt med.");
  });
});
