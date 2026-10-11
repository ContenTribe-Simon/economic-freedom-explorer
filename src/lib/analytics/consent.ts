/**
 * Analytics consent (Phase 12 C/D, PR 4). Our own record of the visitor's choice, independent of
 * PostHog's internals, so the banner, the footer link, the privacy page and the local wipe all
 * read one place. `undecided` and `denied` both mean: no identifier stored on the device
 * (PostHog runs cookieless); only `granted` lets PostHog persist an id in localStorage.
 */
export const CONSENT_KEY = "frihedsmodel-consent.v1";

/** Bump when the privacy text changes materially, so everyone is asked again. */
export const CONSENT_VERSION = 1;

export type ConsentStatus = "undecided" | "granted" | "denied";

export interface ConsentRecord {
  status: "granted" | "denied";
  at: string;
  version: number;
}

export function readConsent(storage: Pick<Storage, "getItem"> = window.localStorage): ConsentStatus {
  try {
    const raw = storage.getItem(CONSENT_KEY);
    if (!raw) return "undecided";
    const rec = JSON.parse(raw) as Partial<ConsentRecord>;
    if (rec.version !== CONSENT_VERSION) return "undecided";
    return rec.status === "granted" || rec.status === "denied" ? rec.status : "undecided";
  } catch {
    return "undecided";
  }
}

export function writeConsent(
  status: "granted" | "denied",
  storage: Pick<Storage, "setItem"> = window.localStorage,
  now: Date = new Date(),
): void {
  const rec: ConsentRecord = { status, at: now.toISOString(), version: CONSENT_VERSION };
  try {
    storage.setItem(CONSENT_KEY, JSON.stringify(rec));
  } catch {
    // Storage blocked: the choice holds for this page load only, and the banner returns next time.
  }
}
