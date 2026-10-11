/**
 * "Slet alle mine data i denne browser" (Phase 12 C/D, PR 3): the browser keys the app itself
 * writes. A cloud account is NOT touched here (that lives on the server; see /cloud), and keys
 * written by anything else in the same origin are left alone.
 */
export const APP_STORAGE_KEYS = [
  "frihedsmodel-public.v1", // public inputs + saved calculations (src/store/publicStore.ts)
  "finance-tool.v1", // advanced model (src/store/financeStore.ts)
  "frihedsmodel-advanced-door.v1", // advanced-door opt-in flag (src/lib/advancedDoor.ts)
] as const;

/** Removes every app-owned key; returns the keys that were present. Never throws. */
export function clearLocalAppData(storage: Pick<Storage, "getItem" | "removeItem"> = window.localStorage): string[] {
  const removed: string[] = [];
  for (const key of APP_STORAGE_KEYS) {
    try {
      if (storage.getItem(key) !== null) removed.push(key);
      storage.removeItem(key);
    } catch {
      // Storage blocked (private mode, policy): nothing to remove from it.
    }
  }
  return removed;
}
