/**
 * Phase 7 security/robustness screening, finding 1: missing optional VITE_SUPABASE_* config
 * crashed the ENTIRE app. createClient() ran at module load and threw before React rendered
 * anything, and AuthProvider (which wraps ALL routes, including the four public screens)
 * dereferenced the client unconditionally. The public flow must render regardless of whether
 * Supabase is configured — cloud is an optional overlay (CLOUD_MODEL.md), only the advanced
 * app's cloud features actually use it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.doUnmock("@/integrations/supabase/client");
});

describe("supabase client module with missing env config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("REGRESSION (P1 crash): importing the client module without env vars does not throw", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "");
    const mod = await import("@/integrations/supabase/client");
    expect(mod.supabase).toBeNull();
    expect(mod.isSupabaseConfigured).toBe(false);
  });

  it("with both env vars present the client is created (normal path unchanged)", async () => {
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "public-anon-key");
    const mod = await import("@/integrations/supabase/client");
    expect(mod.supabase).not.toBeNull();
    expect(mod.isSupabaseConfigured).toBe(true);
  });
});

describe("AuthProvider without a configured client", () => {
  it("renders its children and resolves to logged-out state instead of crashing", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: null,
      isSupabaseConfigured: false,
    }));
    const { AuthProvider, useAuth } = await import("@/hooks/useAuth");

    function Probe() {
      const { session, loading } = useAuth();
      return (
        <div data-testid="probe">
          {loading ? "loading" : session ? "logged-in" : "logged-out"}
        </div>
      );
    }

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    // The children (in production: every route, including the public flow) must render,
    // and the auth state must settle to logged-out rather than hanging on loading.
    await waitFor(() => expect(screen.getByTestId("probe").textContent).toBe("logged-out"));
  });

  it("signOut is a safe no-op without a client", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: null,
      isSupabaseConfigured: false,
    }));
    const { AuthProvider, useAuth } = await import("@/hooks/useAuth");

    let signOutFn: (() => Promise<void>) | undefined;
    function Probe() {
      const { signOut } = useAuth();
      signOutFn = signOut;
      return null;
    }
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    await expect(signOutFn!()).resolves.toBeUndefined();
  });
});
