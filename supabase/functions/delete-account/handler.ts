/**
 * Self-service account deletion (Phase 12 C/D, PR 5). Pure request handling, no Deno or Supabase
 * imports, so it is unit-tested in Vitest; index.ts wires in the real clients.
 *
 * Identity comes ONLY from the caller's JWT (Authorization: Bearer ...), verified by Supabase Auth.
 * The request body is never read, so nobody can name another user's id. Deleting the auth user
 * cascades to profiles, finance_models and finance_snapshots (ON DELETE CASCADE, see
 * supabase/migrations/20260510163521_*.sql).
 */
export interface DeleteAccountDeps {
  /** Resolve the user behind a JWT; null when the token is missing, expired or invalid. */
  getUser(jwt: string): Promise<{ id: string } | null>;
  /** Delete exactly this auth user with the service role. */
  deleteUser(id: string): Promise<{ error?: string }>;
  /** Extra allowed browser origins, comma-separated (e.g. a custom domain). */
  extraOrigins?: string;
}

const DEFAULT_ORIGINS = [
  /^https:\/\/([a-z0-9-]+\.)*lovable\.app$/,
  /^https:\/\/([a-z0-9-]+\.)*lovableproject\.com$/,
  /^http:\/\/localhost:8080$/,
];

export function isAllowedOrigin(origin: string | null, extraOrigins = ""): boolean {
  if (!origin) return false;
  const extra = extraOrigins.split(",").map((s) => s.trim()).filter(Boolean);
  return extra.includes(origin) || DEFAULT_ORIGINS.some((re) => re.test(origin));
}

function cors(origin: string | null, extraOrigins?: string): Record<string, string> {
  if (!isAllowedOrigin(origin, extraOrigins)) return {};
  return {
    "Access-Control-Allow-Origin": origin as string,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    Vary: "Origin",
  };
}

function json(status: number, body: unknown, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...headers, "Content-Type": "application/json" } });
}

export async function handleDeleteAccount(req: Request, deps: DeleteAccountDeps): Promise<Response> {
  const origin = req.headers.get("Origin");
  const headers = cors(origin, deps.extraOrigins);

  if (req.method === "OPTIONS") return new Response(null, { status: isAllowedOrigin(origin, deps.extraOrigins) ? 204 : 403, headers });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" }, headers);

  const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("Authorization") ?? "");
  if (!match) return json(401, { error: "unauthorized" }, headers);

  const user = await deps.getUser(match[1].trim()).catch(() => null);
  if (!user) return json(401, { error: "unauthorized" }, headers);

  const { error } = await deps.deleteUser(user.id).catch((e: unknown) => ({ error: String(e) }));
  if (error) return json(500, { error: "delete_failed" }, headers);

  return json(200, { deleted: true }, headers);
}
