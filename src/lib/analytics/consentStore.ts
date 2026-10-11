import { create } from "zustand";
import { readConsent, writeConsent, type ConsentStatus } from "./consent";
import { applyConsent } from "./client";

/**
 * UI state for the consent banner (Phase 12 C/D, PR 4): the current choice and whether the banner
 * was reopened from the footer's "Cookie-indstillinger". The record itself lives in consent.ts.
 */
interface ConsentState {
  status: ConsentStatus;
  settingsOpen: boolean;
  choose: (status: "granted" | "denied") => void;
  openSettings: () => void;
}

export const useConsentStore = create<ConsentState>((set) => ({
  status: typeof window === "undefined" ? "undecided" : readConsent(),
  settingsOpen: false,
  choose: (status) => {
    writeConsent(status);
    applyConsent(status);
    set({ status, settingsOpen: false });
  },
  openSettings: () => set({ settingsOpen: true }),
}));
