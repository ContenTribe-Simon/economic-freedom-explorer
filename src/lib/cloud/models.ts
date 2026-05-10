import { supabase } from "@/integrations/supabase/client";
import { useFinanceStore } from "@/store/financeStore";
import { MODEL_RELEASE, MODEL_VERSION } from "@/lib/finance/types";

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
  const { data, error } = await supabase
    .from("finance_models")
    .select("id,name,description,model_version,model_release,created_at,updated_at,last_opened_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function saveAsNewModel(name: string, description?: string): Promise<string> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error("Ikke logget ind");
  const data_json = JSON.parse(serializeStoreState());
  const { data, error } = await supabase
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

export async function overwriteModel(id: string): Promise<void> {
  const data_json = JSON.parse(serializeStoreState());
  const { error } = await supabase
    .from("finance_models")
    .update({
      data_json,
      model_version: String(MODEL_VERSION),
      model_release: MODEL_RELEASE,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function loadModel(id: string): Promise<void> {
  const { data, error } = await supabase
    .from("finance_models")
    .select("data_json")
    .eq("id", id)
    .single();
  if (error) throw error;
  applyStateToStore(JSON.stringify(data.data_json));
  await supabase.from("finance_models").update({ last_opened_at: new Date().toISOString() }).eq("id", id);
}

export async function renameModel(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("finance_models").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteModel(id: string): Promise<void> {
  const { error } = await supabase.from("finance_models").delete().eq("id", id);
  if (error) throw error;
}
