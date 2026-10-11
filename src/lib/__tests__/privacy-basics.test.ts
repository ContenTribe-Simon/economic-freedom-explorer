/**
 * PR 3 (Phase 12 C/D): the shared disclaimer, the data-controller details and the local wipe.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { PUBLIC_DISCLAIMER, REAL_TERMS_NOTE } from "@/lib/publicCopy";
import { FEEDBACK_MAILTO, LEGAL_ENTITY } from "@/lib/legalEntity";
import { APP_STORAGE_KEYS, clearLocalAppData } from "@/lib/localData";

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

describe("clearLocalAppData", () => {
  beforeEach(() => localStorage.clear());

  it("removes every app-owned key and reports what was there", () => {
    localStorage.setItem("frihedsmodel-public.v1", "{}");
    localStorage.setItem("finance-tool.v1", "{}");
    localStorage.setItem("frihedsmodel-advanced-door.v1", "open");
    expect(clearLocalAppData().sort()).toEqual([...APP_STORAGE_KEYS].sort());
    for (const k of APP_STORAGE_KEYS) expect(localStorage.getItem(k)).toBeNull();
  });

  it("leaves keys it does not own, including a cloud session", () => {
    localStorage.setItem("frihedsmodel-public.v1", "{}");
    localStorage.setItem("sb-project-auth-token", "session");
    localStorage.setItem("unrelated", "x");
    expect(clearLocalAppData()).toEqual(["frihedsmodel-public.v1"]);
    expect(localStorage.getItem("sb-project-auth-token")).toBe("session");
    expect(localStorage.getItem("unrelated")).toBe("x");
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
