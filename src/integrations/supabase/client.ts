// Originally Lovable-generated; now repo-owned (Phase 7 hardening).
//
// Supabase is an OPTIONAL cloud overlay (see src/lib/cloud/CLOUD_MODEL.md): the app must
// work fully offline, and the public flow never touches cloud at all. This module therefore
// must never throw at load time. A deployment without the VITE_SUPABASE_* values gets
// `supabase = null` and `isSupabaseConfigured = false` — cloud save/login is simply
// disabled — instead of createClient() throwing before React has rendered anything
// (which blanked the whole app, /start included, since AuthProvider wraps every route).
import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";
// Every consumer must handle `null` (unconfigured environment).
export const supabase: SupabaseClient<Database> | null =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        auth: {
          storage: localStorage,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : null;

/** True when the browser-facing Supabase config is present and the client exists. */
export const isSupabaseConfigured = supabase !== null;
