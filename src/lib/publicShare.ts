import type { SimplePublicInputs } from "@/lib/finance/public";
import { sanitizeSimpleInputs } from "@/lib/publicInputs";

/**
 * Share-link encoding for the public flow: the link CONTAINS the inputs ("Linket indeholder
 * dine tal"), so no backend, no accounts and no server-side state are involved — consistent
 * with the roadmap deferring share-infrastructure (Phase 11: "share link / accounts later").
 *
 * Format: base64url of the SimplePublicInputs JSON in a `d` param in the URL FRAGMENT on
 * /resultat (`/resultat#d=…`). The fragment is never sent to the server, so the host never sees
 * the inputs. Legacy links put `d` in the query string (`/resultat?d=…`); they still decode, and
 * the fragment wins if both are present.
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

/** Encode inputs for the share link's `d` fragment param. */
export function encodeShareInputs(inputs: SimplePublicInputs): string {
  return b64urlEncode(JSON.stringify(inputs));
}

/** Decode + sanitize a share param. Returns null for anything unparsable. */
export function decodeShareInputs(param: string): SimplePublicInputs | null {
  try {
    const raw: unknown = JSON.parse(b64urlDecode(param));
    // Only a JSON object (a record) is a valid inputs payload. Reject primitives, null AND
    // arrays: `typeof [] === "object"` would otherwise slip an array through to be coerced to
    // all-defaults, silently REPLACING a recipient's entered plan — while unparsable garbage
    // correctly leaves it untouched. Any non-record decodes to null so the recipient's inputs
    // are preserved, consistently.
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    return sanitizeSimpleInputs(raw as Record<string, unknown>);
  } catch {
    return null;
  }
}

/**
 * The raw encoded payload from a location's search + hash, or null. Fragment first, then the
 * legacy query param. Returns the value undecoded; `decodeShareInputs` is the trust boundary.
 */
export function readSharePayload(search: string, hash: string): string | null {
  const fromHash = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("d");
  if (fromHash != null) return fromHash;
  return new URLSearchParams(search).get("d");
}

export const SHARE_STASH_KEY = "frihedsmodel-share-payload";

/**
 * The payload public/share-guard.js moved out of the URL before any analytics could read it. Read
 * once and removed, so a later visit to /resultat does not re-apply an old share link.
 */
export function takeStashedSharePayload(storage?: Pick<Storage, "getItem" | "removeItem">): string | null {
  try {
    // Resolved inside the try: merely reading window.sessionStorage throws where storage is denied.
    const s = storage ?? window.sessionStorage;
    const v = s.getItem(SHARE_STASH_KEY);
    if (v !== null) s.removeItem(SHARE_STASH_KEY);
    return v;
  } catch {
    return null;
  }
}

/** The absolute share URL for the current inputs. */
export function shareUrlFor(inputs: SimplePublicInputs): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/resultat#d=${encodeShareInputs(inputs)}`;
}
