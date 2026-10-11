/**
 * PR 5 (Phase 12 C/D): password rules mirrored from Supabase, the client call to the
 * delete-account function, and the confirm-by-email dialog on /cloud.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const sb = vi.hoisted(() => ({
  invoke: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: sb.invoke }, auth: { signOut: sb.signOut } },
  isSupabaseConfigured: true,
}));

import { PASSWORD_RULE_TEXT, passwordProblem } from "../passwordPolicy";
import { deleteAccount } from "../deleteAccount";
import { DeleteAccountSection } from "@/components/cloud/DeleteAccountSection";

beforeEach(() => {
  sb.invoke.mockReset();
  sb.signOut.mockClear();
});

describe("passwordProblem", () => {
  it.each([
    ["kort1", "Adgangskoden skal være mindst 8 tegn."],
    ["kunbogstaver", "Adgangskoden skal indeholde både bogstaver og tal."],
    ["12345678", "Adgangskoden skal indeholde både bogstaver og tal."],
  ])("rejects %s in Danish", (pw, msg) => {
    expect(passwordProblem(pw)).toBe(msg);
  });

  it.each(["frihed2026", "Æblegrød42", "a1b2c3d4"])("accepts %s", (pw) => {
    expect(passwordProblem(pw)).toBeNull();
  });

  it("rule text has no em dash", () => {
    expect(PASSWORD_RULE_TEXT).not.toContain("—");
  });
});

describe("deleteAccount", () => {
  it("calls the function with POST, then signs out locally", async () => {
    sb.invoke.mockResolvedValue({ data: { deleted: true }, error: null });
    await deleteAccount();
    expect(sb.invoke).toHaveBeenCalledWith("delete-account", { method: "POST" });
    expect(sb.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("throws a Danish error and keeps the session when the server fails", async () => {
    sb.invoke.mockResolvedValue({ data: null, error: new Error("500") });
    await expect(deleteAccount()).rejects.toThrow("Kontoen kunne ikke slettes. Prøv igen, eller skriv til os.");
    expect(sb.signOut).not.toHaveBeenCalled();
  });
});

describe("DeleteAccountSection", () => {
  const open = () => fireEvent.click(screen.getByRole("button", { name: "Slet min konto" }));
  const confirmBtn = () => screen.getByRole("button", { name: "Slet kontoen" }) as HTMLButtonElement;

  it("only enables deletion once the user's own email is typed", () => {
    render(<DeleteAccountSection email="sga@contentribe.dk" onDeleted={vi.fn()} />);
    open();
    expect(confirmBtn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Din e-mail"), { target: { value: "someone@else.dk" } });
    expect(confirmBtn().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Din e-mail"), { target: { value: "  SGA@contentribe.dk " } });
    expect(confirmBtn().disabled).toBe(false);
  });

  it("deletes and reports success only after the server confirms", async () => {
    sb.invoke.mockResolvedValue({ data: { deleted: true }, error: null });
    const onDeleted = vi.fn();
    render(<DeleteAccountSection email="sga@contentribe.dk" onDeleted={onDeleted} />);
    open();
    fireEvent.change(screen.getByLabelText("Din e-mail"), { target: { value: "sga@contentribe.dk" } });
    fireEvent.click(confirmBtn());
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it("shows the error and stays open when deletion fails", async () => {
    sb.invoke.mockResolvedValue({ data: null, error: new Error("500") });
    const onDeleted = vi.fn();
    render(<DeleteAccountSection email="sga@contentribe.dk" onDeleted={onDeleted} />);
    open();
    fireEvent.change(screen.getByLabelText("Din e-mail"), { target: { value: "sga@contentribe.dk" } });
    fireEvent.click(confirmBtn());
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Kontoen kunne ikke slettes. Prøv igen, eller skriv til os.");
    expect(onDeleted).not.toHaveBeenCalled();
  });
});
