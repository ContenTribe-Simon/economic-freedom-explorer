/**
 * Password rules for new cloud accounts, mirrored from the Supabase auth settings (set 2026-10-11:
 * at least 8 characters, letters and digits; leaked passwords are rejected server-side via HIBP).
 * Checked client-side so the user gets a Danish message instead of Supabase's English error.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_RULE_TEXT = "Mindst 8 tegn med både bogstaver og tal.";

/** A Danish explanation of what is missing, or null when the password meets the rules. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < PASSWORD_MIN_LENGTH) return `Adgangskoden skal være mindst ${PASSWORD_MIN_LENGTH} tegn.`;
  if (!/\p{L}/u.test(pw) || !/\d/.test(pw)) return "Adgangskoden skal indeholde både bogstaver og tal.";
  return null;
}
