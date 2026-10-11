/**
 * Signup/login helpers for the optional cloud account (fix, 2026-10-11).
 *
 * Found in the auth logs: a signup started in Lovable's editor preview sent the confirmation link
 * back to the preview host, which requires a Lovable login, so a confirmed user landed on Lovable's
 * sign-in page. On preview hosts we therefore omit `emailRedirectTo`; Supabase then uses the
 * project's Site URL (the published site).
 */
const PREVIEW_HOST = /(^|\.)lovableproject\.com$|^id-preview--.*\.lovable\.app$|^preview--.*\.lovable\.app$/;

export function isLovablePreviewHost(hostname: string): boolean {
  return PREVIEW_HOST.test(hostname);
}

/** Where the confirmation link should land, or undefined to fall back to the Site URL. */
export function signupRedirectTo(origin: string, hostname: string): string | undefined {
  return isLovablePreviewHost(hostname) ? undefined : `${origin}/cloud`;
}

/** Shown after a signup that created a new, unconfirmed account (a confirmation mail was sent). */
export const SIGNUP_SENT_MESSAGE = "Vi har sendt dig en mail. Klik på linket i den for at bekræfte kontoen.";

/**
 * Supabase answers a signup for an email that already has an account with "success" but sends no
 * mail, and marks it with an empty `identities` list. Telling the user plainly beats a "check your
 * mail" that never arrives. Hiding it would protect nothing: the same signal is in the public API
 * response for anyone who calls it directly.
 */
export const SIGNUP_EXISTS_MESSAGE = "Der findes allerede en konto med den e-mail. Log ind i stedet.";

export function isExistingAccountSignup(data: { user?: { identities?: unknown[] | null } | null } | null | undefined): boolean {
  return Array.isArray(data?.user?.identities) && data!.user!.identities!.length === 0;
}

/** After "send again": true whether or not a mail went out (Supabase does not say). */
export const RESEND_MESSAGE = "Hvis kontoen venter på bekræftelse, har vi sendt mailen igen. Tjek også spam.";

/** Danish text for the auth errors a user can actually cause; anything else gets a calm fallback. */
export function authErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  const m = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials")) return "Forkert e-mail eller adgangskode.";
  if (m.includes("email not confirmed") || m.includes("email_not_confirmed")) return "Bekræft din e-mail først. Tjek din indbakke.";
  if (m.includes("validate email") || m.includes("email_address_invalid") || m.includes("invalid format")) return "Tjek, at e-mailen er skrevet rigtigt.";
  if (m.includes("weak") || m.includes("pwned") || m.includes("password")) return "Vælg en anden adgangskode. Den er for svag eller kendt fra et datalæk.";
  if (m.includes("rate limit") || m.includes("over_email_send_rate_limit") || m.includes("too many")) return "For mange forsøg. Vent lidt, og prøv igen.";
  return "Noget gik galt. Prøv igen om lidt.";
}
