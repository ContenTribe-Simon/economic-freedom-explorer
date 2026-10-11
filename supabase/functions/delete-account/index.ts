// supabase function: delete-account (Phase 12 C/D, PR 5). Logic and tests: ./handler.ts.
// SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided to every function by
// the platform; ALLOWED_ORIGINS (optional, comma-separated) adds a custom domain.
import { createClient } from "npm:@supabase/supabase-js@2.107.0";
import { handleDeleteAccount } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

Deno.serve((req) =>
  handleDeleteAccount(req, {
    getUser: async (jwt) => {
      const { data, error } = await createClient(url, anonKey, noSession).auth.getUser(jwt);
      return error || !data.user ? null : { id: data.user.id };
    },
    deleteUser: async (id) => {
      const { error } = await createClient(url, serviceKey, noSession).auth.admin.deleteUser(id);
      return { error: error?.message };
    },
    extraOrigins: Deno.env.get("ALLOWED_ORIGINS") ?? "",
  }),
);
