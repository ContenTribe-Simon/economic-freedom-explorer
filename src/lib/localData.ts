/**
 * "Slet alle mine data i denne browser" (Phase 12 C/D, PR 3/4): the browser keys the app itself
 * writes, PostHog's own keys, and a signed-in cloud session, which is removed so the next person
 * at this browser cannot reopen the account. The cloud account itself (server side) is NOT deleted
 * here, and keys written by anything else in the same origin are left alone.
 */
export const APP_STORAGE_KEYS = [
  "frihedsmodel-public.v1", // public inputs + saved calculations (src/store/publicStore.ts)
  "finance-tool.v1", // advanced model (src/store/financeStore.ts)
  "frihedsmodel-advanced-door.v1", // advanced-door opt-in flag (src/lib/advancedDoor.ts)
  "frihedsmodel-consent.v1", // analytics consent choice (src/lib/analytics/consent.ts)
] as const;

/** PostHog's own keys (persisted id after "Ja tak", its consent flag). */
export const APP_STORAGE_PREFIXES = ["ph_", "__ph_"] as const;

/** Supabase's persisted session (`sb-<project-ref>-auth-token`, src/integrations/supabase/client.ts). */
export function isSessionKey(key: string): boolean {
  return /^sb-.+-auth-token$/.test(key);
}

type WipeableStorage = Pick<Storage, "getItem" | "removeItem"> & Partial<Pick<Storage, "length" | "key">>;

/** Removes every app-owned key, PostHog's keys and any cloud session; returns those present. Never throws. */
export function clearLocalAppData(storage: WipeableStorage = window.localStorage): string[] {
  const extra: string[] = [];
  try {
    for (let i = 0; i < (storage.length ?? 0); i++) {
      const k = storage.key?.(i);
      if (k && (isSessionKey(k) || APP_STORAGE_PREFIXES.some((p) => k.startsWith(p)))) extra.push(k);
    }
  } catch {
    // Storage blocked: nothing to enumerate.
  }
  const removed: string[] = [];
  for (const key of [...APP_STORAGE_KEYS, ...extra]) {
    try {
      if (storage.getItem(key) !== null) removed.push(key);
      storage.removeItem(key);
    } catch {
      // Storage blocked (private mode, policy): nothing to remove from it.
    }
  }
  return removed;
}

/**
 * Another tab wiped the data (its removals arrive here as `storage` events): this tab must reload,
 * or its in-memory stores would write the deleted data straight back. Only the wipe ever removes
 * these keys, so a removal is an unambiguous signal.
 */
export function isWipeSignal(e: Pick<StorageEvent, "key" | "newValue">): boolean {
  if (e.key === null) return true; // localStorage.clear()
  return e.newValue === null && (APP_STORAGE_KEYS as readonly string[]).includes(e.key);
}
