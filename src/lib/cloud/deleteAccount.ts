import { supabase } from "@/integrations/supabase/client";

/**
 * Deletes the signed-in user's cloud account (Phase 12 C/D, PR 5) via the delete-account edge
 * function, which deletes exactly the user behind the session's JWT (and, by cascade, their
 * profile and saved models), then drops the now-invalid session locally. Browser data is untouched.
 */
export async function deleteAccount(): Promise<void> {
  if (!supabase) throw new Error("Cloud er ikke sat op i dette miljø.");
  const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });
  if (error) throw new Error("Kontoen kunne ikke slettes. Prøv igen, eller skriv til os.");
  await supabase.auth.signOut({ scope: "local" });
}
