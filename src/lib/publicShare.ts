import type { SimplePublicInputs } from "@/lib/finance/public";
import { sanitizeSimpleInputs } from "@/lib/publicInputs";

/**
 * Share-link encoding for the public flow: the link CONTAINS the inputs ("Linket indeholder
 * dine tal"), so no backend, no accounts and no server-side state are involved — consistent
 * with the roadmap deferring share-infrastructure (Phase 11: "share link / accounts later").
 *
 * Format: base64url of the SimplePublicInputs JSON in a `d` query param on /resultat.
 * Decoding is defensive: unknown/garbage input returns null, and everything else goes through
 * the shared `sanitizeSimpleInputs` (spec §4.1 ranges + cross-field rules) — a hostile link can
 * only ever produce a valid input set.
 */

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Encode inputs for the share link's `d` param. */
export function encodeShareInputs(inputs: SimplePublicInputs): string {
  return b64urlEncode(JSON.stringify(inputs));
}

/** Decode + sanitize a share param. Returns null for anything unparsable. */
export function decodeShareInputs(param: string): SimplePublicInputs | null {
  try {
    const raw: unknown = JSON.parse(b64urlDecode(param));
    if (typeof raw !== "object" || raw === null) return null;
    return sanitizeSimpleInputs(raw as Record<string, unknown>);
  } catch {
    return null;
  }
}

/** The absolute share URL for the current inputs. */
export function shareUrlFor(inputs: SimplePublicInputs): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/resultat?d=${encodeShareInputs(inputs)}`;
}
