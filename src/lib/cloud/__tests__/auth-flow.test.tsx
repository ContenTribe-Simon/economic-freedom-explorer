/**
 * Auth flow fix (2026-10-11): confirmation links never point at Lovable's preview, an email that
 * already has an account gets told so (and lands on the login tab), errors are Danish.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const sb = vi.hoisted(() => ({
  signUp: vi.fn(async () => ({ data: { user: { identities: [] } }, error: null })),
  signInWithPassword: vi.fn(async () => ({ error: { message: "Invalid login credentials" } })),
  resend: vi.fn(async () => ({ error: null })),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signUp: sb.signUp, signInWithPassword: sb.signInWithPassword, resend: sb.resend } },
  isSupabaseConfigured: true,
}));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ session: null }) }));
vi.mock("sonner", () => ({ toast }));

import {
  RESEND_MESSAGE,
  SIGNUP_EXISTS_MESSAGE,
  SIGNUP_SENT_MESSAGE,
  authErrorMessage,
  isExistingAccountSignup,
  isLovablePreviewHost,
  signupRedirectTo,
} from "../authFlow";
import AuthPage from "@/pages/Auth";

beforeEach(() => {
  Object.values(sb).forEach((f) => f.mockClear());
  toast.success.mockClear();
  toast.error.mockClear();
  toast.info.mockClear();
});

describe("isExistingAccountSignup", () => {
  it("reads Supabase's empty-identities marker", () => {
    expect(isExistingAccountSignup({ user: { identities: [] } })).toBe(true);
    expect(isExistingAccountSignup({ user: { identities: [{ id: "1" }] } })).toBe(false);
    expect(isExistingAccountSignup({ user: null })).toBe(false);
    expect(isExistingAccountSignup(null)).toBe(false);
  });
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
    [{ code: "email_address_invalid", message: "Email address is invalid" }, "Tjek, at e-mailen er skrevet rigtigt."],
    [{ message: "Something unexpected" }, "Noget gik galt. Prøv igen om lidt."],
    [null, "Noget gik galt. Prøv igen om lidt."],
  ])("%j", (err, msg) => {
    expect(authErrorMessage(err)).toBe(msg);
  });

  it("no message contains an em dash", () => {
    for (const m of [SIGNUP_SENT_MESSAGE, SIGNUP_EXISTS_MESSAGE, RESEND_MESSAGE]) expect(m).not.toContain("—");
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

  async function submitSignup() {
    renderAuth();
    const panel = await screen.findByRole("tabpanel");
    fireEvent.change(panel.querySelector('input[type="email"]')!, { target: { value: "x@example.dk" } });
    fireEvent.change(panel.querySelector('input[type="password"]')!, { target: { value: "frihed2026" } });
    fireEvent.submit(panel.querySelector("form")!);
  }

  it("an email that already has an account is told so and lands on the login tab", async () => {
    sb.signUp.mockResolvedValueOnce({ data: { user: { identities: [] } }, error: null });
    await submitSignup();
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith(SIGNUP_EXISTS_MESSAGE));
    expect(toast.success).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("tab", { name: "Log ind" }).getAttribute("aria-selected")).toBe("true"));
    expect(sb.signUp).toHaveBeenCalledWith(
      expect.objectContaining({ email: "x@example.dk", options: { emailRedirectTo: `${window.location.origin}/cloud` } }),
    );
  });

  it("a new account is told a confirmation mail was sent", async () => {
    sb.signUp.mockResolvedValueOnce({ data: { user: { identities: [{ id: "i1" }] } }, error: null });
    await submitSignup();
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(SIGNUP_SENT_MESSAGE));
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("can resend the confirmation", async () => {
    renderAuth();
    const panel = await screen.findByRole("tabpanel");
    fireEvent.change(panel.querySelector('input[type="email"]')!, { target: { value: "x@example.dk" } });
    fireEvent.click(screen.getByRole("button", { name: "Fik du ikke mailen? Send den igen" }));
    await waitFor(() => expect(sb.resend).toHaveBeenCalledWith(expect.objectContaining({ type: "signup", email: "x@example.dk" })));
    expect(toast.success).toHaveBeenCalledWith(RESEND_MESSAGE);
  });

  it("a failed resend says so instead of claiming the mail was sent", async () => {
    sb.resend.mockResolvedValueOnce({ error: { message: "Unable to validate email address: invalid format" } });
    renderAuth();
    const panel = await screen.findByRole("tabpanel");
    fireEvent.change(panel.querySelector('input[type="email"]')!, { target: { value: "x@example.dk" } });
    fireEvent.click(screen.getByRole("button", { name: "Fik du ikke mailen? Send den igen" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Tjek, at e-mailen er skrevet rigtigt."));
    expect(toast.success).not.toHaveBeenCalled();
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
