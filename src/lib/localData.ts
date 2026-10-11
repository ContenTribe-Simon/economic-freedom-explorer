/**
 * "Slet alle mine data i denne browser" (Phase 12 C/D, PR 3): the browser keys the app itself
 * writes, plus a signed-in cloud session, which is removed so the next person at this browser
 * cannot reopen the account. The cloud account itself (server side) is NOT deleted here, and keys
 * written by anything else in the same origin are left alone.
 */
export const APP_STORAGE_KEYS = [
  "frihedsmodel-public.v1", // public inputs + saved calculations (src/store/publicStore.ts)
  "finance-tool.v1", // advanced model (src/store/financeStore.ts)
  "frihedsmodel-advanced-door.v1", // advanced-door opt-in flag (src/lib/advancedDoor.ts)
] as const;

/** Supabase's persisted session (`sb-<project-ref>-auth-token`, src/integrations/supabase/client.ts). */
export function isSessionKey(key: string): boolean {
  return /^sb-.+-auth-token$/.test(key);
}

type WipeableStorage = Pick<Storage, "getItem" | "removeItem"> & Partial<Pick<Storage, "length" | "key">>;

/** Removes every app-owned key and any cloud session; returns the keys that were present. Never throws. */
export function clearLocalAppData(storage: WipeableStorage = window.localStorage): string[] {
  const sessionKeys: string[] = [];
  try {
    for (let i = 0; i < (storage.length ?? 0); i++) {
      const k = storage.key?.(i);
      if (k && isSessionKey(k)) sessionKeys.push(k);
    }
  } catch {
    // Storage blocked: nothing to enumerate.
  }
  const removed: string[] = [];
  for (const key of [...APP_STORAGE_KEYS, ...sessionKeys]) {
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
