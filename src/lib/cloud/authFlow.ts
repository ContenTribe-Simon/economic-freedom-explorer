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

/**
 * Shown after every successful signup call. Neutral on purpose: Supabase answers an existing email
 * with success but sends no mail (so nobody can probe which emails have accounts), and the message
 * must stay true in both cases without revealing which one it was.
 */
export const SIGNUP_SENT_MESSAGE = "Tjek din mail for at bekræfte kontoen. Har du allerede en konto, så log ind i stedet.";

/** Danish text for the auth errors a user can actually cause; anything else gets a calm fallback. */
export function authErrorMessage(error: { message?: string; code?: string } | null | undefined): string {
  const m = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials")) return "Forkert e-mail eller adgangskode.";
  if (m.includes("email not confirmed") || m.includes("email_not_confirmed")) return "Bekræft din e-mail først. Tjek din indbakke.";
  if (m.includes("weak") || m.includes("pwned") || m.includes("password")) return "Vælg en anden adgangskode. Den er for svag eller kendt fra et datalæk.";
  if (m.includes("rate limit") || m.includes("over_email_send_rate_limit") || m.includes("too many")) return "For mange forsøg. Vent lidt, og prøv igen.";
  return "Noget gik galt. Prøv igen om lidt.";
}
