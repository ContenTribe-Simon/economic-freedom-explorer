/**
 * PR 3 (Phase 12 C/D): the shared disclaimer, the data-controller details and the local wipe.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PUBLIC_DISCLAIMER, REAL_TERMS_NOTE } from "@/lib/publicCopy";
import { FEEDBACK_MAILTO, LEGAL_ENTITY } from "@/lib/legalEntity";
import { APP_SESSION_KEYS, APP_STORAGE_KEYS, clearLocalAppData, clearSessionAppData, isSessionKey, isWipeSignal } from "@/lib/localData";
import { SHARE_STASH_KEY, takeStashedSharePayload } from "@/lib/publicShare";

describe("PUBLIC_DISCLAIMER", () => {
  it("is the canonical text from the public data contract, verbatim", () => {
    const contract = readFileSync(path.resolve(__dirname, "../../../docs/public-mvp-spec-and-data-contract-v1.md"), "utf8");
    expect(contract.replace(/\s+/g, " ")).toContain(PUBLIC_DISCLAIMER);
    expect(PUBLIC_DISCLAIMER).not.toContain("—");
    expect(REAL_TERMS_NOTE).toBe("Alle beløb er i nutidskroner.");
  });
});

describe("LEGAL_ENTITY", () => {
  it("names ContenTribe with a real CVR and contact address", () => {
    expect(LEGAL_ENTITY.name).toBe("ContenTribe");
    expect(LEGAL_ENTITY.cvr).toMatch(/^\d{8}$/);
    expect(LEGAL_ENTITY.email).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/);
  });

  it("feedback link opens a mail to that address with a subject and no body", () => {
    const url = new URL(FEEDBACK_MAILTO);
    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe(LEGAL_ENTITY.email);
    expect(url.searchParams.get("subject")).toBe("Feedback på Frihedsmodel");
    expect(url.searchParams.has("body")).toBe(false);
  });
});

describe("share stash in sessionStorage (public/share-guard.js)", () => {
  it("the guard, the app and the wipe agree on the key name", () => {
    const guard = readFileSync(path.resolve(__dirname, "../../../public/share-guard.js"), "utf8");
    expect(guard).toContain(`"${SHARE_STASH_KEY}"`);
    expect(APP_SESSION_KEYS).toContain(SHARE_STASH_KEY);
  });

  it("the wipe removes it", () => {
    sessionStorage.setItem(SHARE_STASH_KEY, "payload");
    clearSessionAppData();
    expect(sessionStorage.getItem(SHARE_STASH_KEY)).toBeNull();
    expect(() => clearSessionAppData({ removeItem: () => { throw new Error("denied"); } })).not.toThrow();
  });

  it("reading the stash never throws where sessionStorage is denied", () => {
    const desc = Object.getOwnPropertyDescriptor(window, "sessionStorage")!;
    Object.defineProperty(window, "sessionStorage", { configurable: true, get: () => { throw new DOMException("denied", "SecurityError"); } });
    try {
      expect(takeStashedSharePayload()).toBeNull();
      expect(() => clearSessionAppData()).not.toThrow();
    } finally {
      Object.defineProperty(window, "sessionStorage", desc);
    }
  });
});

describe("isWipeSignal (other tabs reload after a wipe)", () => {
  it("fires on removal of an app key or a full clear, nothing else", () => {
    expect(isWipeSignal({ key: "frihedsmodel-public.v1", newValue: null })).toBe(true);
    expect(isWipeSignal({ key: "finance-tool.v1", newValue: null })).toBe(true);
    expect(isWipeSignal({ key: null, newValue: null })).toBe(true);
    expect(isWipeSignal({ key: "frihedsmodel-public.v1", newValue: "{}" })).toBe(false);
    expect(isWipeSignal({ key: "unrelated", newValue: null })).toBe(false);
  });
});

describe("clearLocalAppData", () => {
  beforeEach(() => localStorage.clear());

  it("removes every app-owned key and reports what was there", () => {
    localStorage.setItem("frihedsmodel-public.v1", "{}");
    localStorage.setItem("finance-tool.v1", "{}");
    localStorage.setItem("frihedsmodel-advanced-door.v1", "open");
    localStorage.setItem("frihedsmodel-consent.v1", "{}");
    localStorage.setItem("ph_phc_x_posthog", "{\"distinct_id\":\"abc\"}");
    localStorage.setItem("__ph_opt_in_out_phc_x", "1");
    expect(clearLocalAppData().sort()).toEqual([...APP_STORAGE_KEYS, "__ph_opt_in_out_phc_x", "ph_phc_x_posthog"].sort());
    for (const k of APP_STORAGE_KEYS) expect(localStorage.getItem(k)).toBeNull();
    expect(localStorage.getItem("ph_phc_x_posthog")).toBeNull();
  });

  it("also removes a signed-in cloud session, so the next person cannot reopen the account", () => {
    localStorage.setItem("sb-nixcnzzourbxflxxmjdu-auth-token", "session");
    expect(clearLocalAppData()).toEqual(["sb-nixcnzzourbxflxxmjdu-auth-token"]);
    expect(localStorage.getItem("sb-nixcnzzourbxflxxmjdu-auth-token")).toBeNull();
    expect(isSessionKey("sb-x-auth-token")).toBe(true);
    expect(isSessionKey("sb-x-auth-token-code-verifier")).toBe(false);
  });

  it("leaves keys it does not own", () => {
    localStorage.setItem("frihedsmodel-public.v1", "{}");
    localStorage.setItem("unrelated", "x");
    localStorage.setItem("sb-settings", "x");
    expect(clearLocalAppData()).toEqual(["frihedsmodel-public.v1"]);
    expect(localStorage.getItem("unrelated")).toBe("x");
    expect(localStorage.getItem("sb-settings")).toBe("x");
  });

  it("never throws when storage is blocked", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, removeItem: () => { throw new Error("blocked"); } };
    expect(clearLocalAppData(blocked)).toEqual([]);
  });

  it("covers every persisted store key in the codebase", () => {
    const src = (f: string) => readFileSync(path.resolve(__dirname, "..", f), "utf8");
    const keys = [
      src("../store/publicStore.ts").match(/name: "([^"]+\.v\d+)"/)![1],
      src("../store/financeStore.ts").match(/name: "(finance-tool\.v\d+)"/)![1],
      src("advancedDoor.ts").match(/ADVANCED_DOOR_KEY = "([^"]+)"/)![1],
    ];
    for (const k of keys) expect(APP_STORAGE_KEYS).toContain(k);
  });
});
