/**
 * Auth flow fix (2026-10-11): confirmation links never point at Lovable's preview, the signup
 * message is true whether or not the email already has an account, errors are Danish.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const sb = vi.hoisted(() => ({
  signUp: vi.fn(async () => ({ data: { user: { identities: [] } }, error: null })),
  signInWithPassword: vi.fn(async () => ({ error: { message: "Invalid login credentials" } })),
  resend: vi.fn(async () => ({ error: null })),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signUp: sb.signUp, signInWithPassword: sb.signInWithPassword, resend: sb.resend } },
  isSupabaseConfigured: true,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("sonner", () => ({ toast }));

import { SIGNUP_SENT_MESSAGE, authErrorMessage, isLovablePreviewHost, signupRedirectTo } from "../authFlow";
import AuthPage from "@/pages/Auth";

beforeEach(() => {
  Object.values(sb).forEach((f) => f.mockClear());
  toast.success.mockClear();
  toast.error.mockClear();
});

describe("signupRedirectTo", () => {
  it("lands on /cloud of the site the user is on", () => {
    expect(signupRedirectTo("https://economic-freedom-explorer.lovable.app", "economic-freedom-explorer.lovable.app"))
      .toBe("https://economic-freedom-explorer.lovable.app/cloud");
    expect(signupRedirectTo("https://frihedsmodel.dk", "frihedsmodel.dk")).toBe("https://frihedsmodel.dk/cloud");
  });

  it.each([
    "id-preview--5903b716-1633-4900-a047-694f55cb68ed.lovable.app",
    "preview--economic-freedom-explorer.lovable.app",
    "5903b716-1633-4900-a047-694f55cb68ed.lovableproject.com",
  ])("never points at Lovable's preview (%s): falls back to the Site URL", (host) => {
    expect(isLovablePreviewHost(host)).toBe(true);
    expect(signupRedirectTo(`https://${host}`, host)).toBeUndefined();
  });
});

describe("authErrorMessage", () => {
  it.each([
    [{ message: "Invalid login credentials" }, "Forkert e-mail eller adgangskode."],
    [{ message: "Email not confirmed" }, "Bekræft din e-mail først. Tjek din indbakke."],
    [{ code: "weak_password", message: "Password is known to be weak and easy to guess" }, "Vælg en anden adgangskode. Den er for svag eller kendt fra et datalæk."],
    [{ code: "over_email_send_rate_limit", message: "email rate limit exceeded" }, "For mange forsøg. Vent lidt, og prøv igen."],
    [{ message: "Something unexpected" }, "Noget gik galt. Prøv igen om lidt."],
    [null, "Noget gik galt. Prøv igen om lidt."],
  ])("%j", (err, msg) => {
    expect(authErrorMessage(err)).toBe(msg);
  });

  it("no message contains an em dash", () => {
    expect(SIGNUP_SENT_MESSAGE).not.toContain("—");
  });
});

describe("Auth page", () => {
  function renderAuth() {
    render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>,
    );
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Opret konto" }));
    fireEvent.click(screen.getByRole("tab", { name: "Opret konto" }));
  }

  it("an already registered email gets the same neutral message (Supabase sends no mail then)", async () => {
    renderAuth();
    const panel = await screen.findByRole("tabpanel");
    fireEvent.change(panel.querySelector('input[type="email"]')!, { target: { value: "x@example.dk" } });
    fireEvent.change(panel.querySelector('input[type="password"]')!, { target: { value: "frihed2026" } });
    fireEvent.submit(panel.querySelector("form")!);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(SIGNUP_SENT_MESSAGE));
    expect(sb.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "x@example.dk", options: { emailRedirectTo: `${window.location.origin}/cloud` } }),
    );
  });

  it("can resend the confirmation, with the same neutral answer", async () => {
    renderAuth();
    const panel = await screen.findByRole("tabpanel");
    fireEvent.change(panel.querySelector('input[type="email"]')!, { target: { value: "x@example.dk" } });
    fireEvent.click(screen.getByRole("button", { name: "Fik du ikke mailen? Send den igen" }));
    await waitFor(() => expect(sb.resend).toHaveBeenCalledWith(expect.objectContaining({ type: "signup", email: "x@example.dk" })));
    expect(toast.success).toHaveBeenCalledWith(SIGNUP_SENT_MESSAGE);
  });

  it("login errors are Danish", async () => {
    render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>,
    );
    const panel = screen.getByRole("tabpanel");
    fireEvent.change(panel.querySelector('input[type="email"]')!, { target: { value: "x@example.dk" } });
    fireEvent.change(panel.querySelector('input[type="password"]')!, { target: { value: "forkert1" } });
    fireEvent.submit(panel.querySelector("form")!);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Forkert e-mail eller adgangskode."));
  });
});
