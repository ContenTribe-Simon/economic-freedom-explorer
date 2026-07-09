import { supabase } from "@/integrations/supabase/client";
import { useFinanceStore } from "@/store/financeStore";
import { MODEL_RELEASE, MODEL_VERSION } from "@/lib/finance/types";

/**
 * The client is null in an unconfigured environment (optional cloud overlay). These
 * functions are only reachable from the cloud UI, which requires a session — impossible
 * without a client — so a clear thrown error (surfaced by the callers' normal error
 * handling) is the graceful path, never a null deref.
 */
function requireSupabase(): NonNullable<typeof supabase> {
  if (!supabase) throw new Error("Cloud er ikke sat op i dette miljø.");
  return supabase;
}

export interface CloudModelRow {
  id: string;
  name: string;
  description: string | null;
  model_version: string | null;
  model_release: string | null;
  created_at: string;
  updated_at: string;
  last_opened_at: string | null;
}

/** Snapshot af nuværende store-state, bruges som data_json. */
export function serializeStoreState(): string {
  return useFinanceStore.getState().exportJson();
}

/** Indlæs en JSON-streng tilbage i store. Genberegner ikke snapshots. */
export function applyStateToStore(json: string) {
  useFinanceStore.getState().importJson(json);
}

/** Stabil hash af nuværende state — bruges til dirty-tracking. */
export async function hashCurrentState(): Promise<string> {
  const json = serializeStoreState();
  // Strip volatile timestamps for stabil sammenligning
  const stripped = json.replace(/"(updatedAt|createdAt)":\s*\d+/g, "");
  if (typeof crypto !== "undefined" && crypto.subtle) {
    const buf = new TextEncoder().encode(stripped);
    const digest = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  // Fallback simple hash
  let h = 0;
  for (let i = 0; i < stripped.length; i++) h = (h * 31 + stripped.charCodeAt(i)) | 0;
  return String(h);
}

export async function listModels(): Promise<CloudModelRow[]> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("finance_models")
    .select("id,name,description,model_version,model_release,created_at,updated_at,last_opened_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function saveAsNewModel(name: string, description?: string): Promise<string> {
  const sb = requireSupabase();
  const { data: u } = await sb.auth.getUser();
  if (!u.user) throw new Error("Ikke logget ind");
  const data_json = JSON.parse(serializeStoreState());
  const { data, error } = await sb
    .from("finance_models")
    .insert({
      user_id: u.user.id,
      name,
      description: description ?? null,
      model_version: String(MODEL_VERSION),
      model_release: MODEL_RELEASE,
      data_json,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

/**
 * Overwrite a cloud model with the current local state. `expectedUpdatedAt` is an optional
 * optimistic-concurrency token (the `updated_at` the caller last SAW, from listModels): when
 * passed, the update only matches if no other session has written the row since. PostgREST
 * reports a non-matching update as SUCCESS with 0 rows — before Phase 12 that meant
 * overwriting a model deleted or changed in another tab/device toasted "Opdateret" while
 * writing nothing — so the row count is checked explicitly here.
 */
export async function overwriteModel(id: string, expectedUpdatedAt?: string): Promise<void> {
  const sb = requireSupabase();
  const data_json = JSON.parse(serializeStoreState());
  // updated_at is deliberately NOT sent: since migration 20260709090000 the column is
  // server-owned — the finance_models trigger bumps it exactly when data_json changes and
  // preserves it otherwise, so it works as a reliable concurrency token.
  let query = sb
    .from("finance_models")
    .update({
      data_json,
      model_version: String(MODEL_VERSION),
      model_release: MODEL_RELEASE,
    })
    .eq("id", id);
  if (expectedUpdatedAt) query = query.eq("updated_at", expectedUpdatedAt);
  const { data, error } = await query.select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      expectedUpdatedAt
        ? "Modellen er ændret fra en anden enhed eller fane, siden listen blev hentet. Opdatér listen, og prøv igen."
        : "Modellen findes ikke længere i cloud. Opdatér listen.",
    );
  }
}

export async function loadModel(id: string): Promise<void> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from("finance_models")
    .select("data_json")
    .eq("id", id)
    .single();
  if (error) throw error;
  applyStateToStore(JSON.stringify(data.data_json));
  // last_opened_at is bookkeeping only, and the model is ALREADY in the local store at this
  // point. A failure here (typically the connection dropping mid-session) must not bubble up
  // as "load failed" — that would tell the user a load that succeeded went wrong.
  try {
    await sb.from("finance_models").update({ last_opened_at: new Date().toISOString() }).eq("id", id);
  } catch {
    // Non-fatal by design; see comment above.
  }
}

export async function renameModel(id: string, name: string): Promise<void> {
  const sb = requireSupabase();
  const { data, error } = await sb.from("finance_models").update({ name }).eq("id", id).select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("Modellen findes ikke længere i cloud. Opdatér listen.");
  }
}

export async function deleteModel(id: string): Promise<void> {
  const sb = requireSupabase();
  const { error } = await sb.from("finance_models").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Danish, offline-aware error copy for the cloud UI (Phase 12 "backend downtime" hardening).
 * Network-level failures (fetch rejections, PostgrestError objects wrapping them — note those
 * are plain objects, NOT instanceof Error) become one calm message that says the important
 * thing: local data is safe on this device. Other errors keep their own message (our own
 * Danish throws above arrive here); unknown shapes get the caller's fallback.
 */
export function cloudErrorMessage(e: unknown, fallback: string): string {
  const message =
    e instanceof Error ? e.message : typeof (e as { message?: unknown })?.message === "string" ? (e as { message: string }).message : null;
  if (message && /failed to fetch|networkerror|network request failed|fetch failed|load failed/i.test(message)) {
    return "Ingen forbindelse til cloud lige nu. Dine data ligger stadig lokalt på denne enhed. Prøv igen, når du er online.";
  }
  return message || fallback;
}
