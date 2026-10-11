/**
 * PR 5 (Phase 12 C/D): the delete-account edge function's request handling. Identity comes only
 * from the verified JWT; the body is never trusted; only exactly that user is deleted.
 */
import { describe, expect, it, vi } from "vitest";
import { handleDeleteAccount, isAllowedOrigin, type DeleteAccountDeps } from "../../../../supabase/functions/delete-account/handler";

const APP = "https://economic-freedom-explorer.lovable.app";

function deps(overrides: Partial<DeleteAccountDeps> = {}) {
  const d = {
    getUser: vi.fn(async (jwt: string) => (jwt === "good-jwt" ? { id: "user-1" } : null)),
    deleteUser: vi.fn(async () => ({})),
    ...overrides,
  };
  return d;
}

function req(init: { method?: string; auth?: string; origin?: string; body?: string } = {}) {
  const headers: Record<string, string> = {};
  if (init.auth) headers.Authorization = init.auth;
  if (init.origin) headers.Origin = init.origin;
  return new Request("https://x.supabase.co/functions/v1/delete-account", { method: init.method ?? "POST", headers, body: init.body });
}

describe("delete-account handler", () => {
  it("deletes exactly the user behind a valid JWT", async () => {
    const d = deps();
    const res = await handleDeleteAccount(req({ auth: "Bearer good-jwt", origin: APP }), d);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deleted: true });
    expect(d.getUser).toHaveBeenCalledWith("good-jwt");
    expect(d.deleteUser).toHaveBeenCalledWith("user-1");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe(APP);
  });

  it("ignores any user id in the body", async () => {
    const d = deps();
    await handleDeleteAccount(req({ auth: "Bearer good-jwt", body: JSON.stringify({ id: "someone-else", user_id: "victim" }) }), d);
    expect(d.deleteUser).toHaveBeenCalledTimes(1);
    expect(d.deleteUser).toHaveBeenCalledWith("user-1");
  });

  it.each([
    ["no header", undefined],
    ["not bearer", "Basic abc"],
    ["empty bearer", "Bearer "],
    ["invalid token", "Bearer forged"],
  ])("401 and deletes nothing: %s", async (_label, auth) => {
    const d = deps();
    const res = await handleDeleteAccount(req({ auth }), d);
    expect(res.status).toBe(401);
    expect(d.deleteUser).not.toHaveBeenCalled();
  });

  it("401 when token verification throws", async () => {
    const d = deps({ getUser: vi.fn(async () => { throw new Error("network"); }) });
    expect((await handleDeleteAccount(req({ auth: "Bearer good-jwt" }), d)).status).toBe(401);
    expect(d.deleteUser).not.toHaveBeenCalled();
  });

  it("500 with a generic error when deletion fails", async () => {
    const d = deps({ deleteUser: vi.fn(async () => ({ error: "db exploded: secret detail" })) });
    const res = await handleDeleteAccount(req({ auth: "Bearer good-jwt" }), d);
    expect(res.status).toBe(500);
    expect(await res.text()).not.toContain("secret detail");
  });

  it("only POST deletes", async () => {
    const d = deps();
    for (const method of ["GET", "PUT", "DELETE"]) {
      expect((await handleDeleteAccount(req({ method, auth: "Bearer good-jwt" }), d)).status).toBe(405);
    }
    expect(d.deleteUser).not.toHaveBeenCalled();
  });

  it("preflight: allowed origins get CORS, others none", async () => {
    const ok = await handleDeleteAccount(req({ method: "OPTIONS", origin: APP }), deps());
    expect(ok.status).toBe(204);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(APP);
    const bad = await handleDeleteAccount(req({ method: "OPTIONS", origin: "https://evil.example" }), deps());
    expect(bad.status).toBe(403);
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("origin allowlist", () => {
    expect(isAllowedOrigin(APP)).toBe(true);
    expect(isAllowedOrigin("https://id-preview--abc.lovable.app")).toBe(true);
    expect(isAllowedOrigin("https://abc.lovableproject.com")).toBe(true);
    expect(isAllowedOrigin("http://localhost:8080")).toBe(true);
    expect(isAllowedOrigin("https://frihedsmodel.dk")).toBe(false);
    expect(isAllowedOrigin("https://frihedsmodel.dk", "https://frihedsmodel.dk, https://www.frihedsmodel.dk")).toBe(true);
    expect(isAllowedOrigin("https://lovable.app.evil.example")).toBe(false);
    expect(isAllowedOrigin("http://economic-freedom-explorer.lovable.app")).toBe(false);
    expect(isAllowedOrigin(null)).toBe(false);
  });
});
