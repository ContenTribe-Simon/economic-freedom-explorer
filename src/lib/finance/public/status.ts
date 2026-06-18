/**
 * Public-safe status adapter (data contract §4.4(a)).
 *
 * The public status has two components, both horizon-correct:
 *  - off_track is the engine's shortfall-based verdict (`modelStatus === "invalid"`, which reads
 *    YearRow.shortfall across the whole horizon). Kept exactly as-is.
 *  - the target-met component (on_track vs tight) is derived from the SAME end-of-horizon margin
 *    verdict the end-margin driver uses (last YearRow vs fiTargetMinNetWorth), NOT from the engine's
 *    age-95 `target_missed`. This keeps status and driver from ever disagreeing for lifeExpectancy > 95.
 *
 * No new thresholds — the target verdict reuses `classifyEndMargin`. The reason is synthesised from
 * the verdict plus already-public facts; the raw `modelStatusReason` is never read into the output.
 */
import type { KPIs, ModelStatus } from "../types";
import type { EndMarginVerdict } from "./endMargin";
import type { PublicStatus, PublicStatusKind, StatusColorToken } from "./types";

const LABEL: Record<PublicStatusKind, string> = {
  on_track: "På sporet",
  tight: "Stramt",
  off_track: "Ikke på sporet",
};

const COLOR: Record<PublicStatusKind, StatusColorToken> = {
  on_track: "sage",
  tight: "dawn",
  off_track: "clay",
};

export interface StatusContext {
  /** First-shortfall age computed from the YearRows (public-safe), or null. */
  firstShortfallAge: number | null;
  /** Whether the user set an FI target (so "mål" wording is meaningful). */
  hasFiTarget: boolean;
  /** Shared end-of-horizon margin verdict — the SAME one the end-margin driver consumes. */
  endMarginVerdict: EndMarginVerdict;
}

/**
 * Off_track from the shortfall-based engine verdict; otherwise the target component from the shared
 * end-of-horizon margin verdict (missed → tight, thin/comfortable → on_track).
 */
function deriveKind(modelStatus: ModelStatus, endMarginVerdict: EndMarginVerdict): PublicStatusKind {
  if (modelStatus === "invalid") return "off_track"; // shortfall / financing failure — horizon-correct
  return endMarginVerdict === "missed" ? "tight" : "on_track";
}

/** Public Danish reason, generated fresh from the verdict — never the raw engine text. */
export function adaptStatusReason(kind: PublicStatusKind, ctx: StatusContext): string {
  switch (kind) {
    case "on_track":
      return "Med dine tal holder planen hele perioden.";
    case "tight":
      return ctx.hasFiTarget
        ? "Planen holder, men slutter under dit mål."
        : "Planen er lige på grænsen.";
    case "off_track":
      return ctx.firstShortfallAge != null
        ? `Pengene slipper op ved alder ${ctx.firstShortfallAge}.`
        : "Med dine tal hænger planen ikke sammen endnu.";
  }
}

/** Map the engine verdict + shared end-margin verdict to a public status badge. */
export function toPublicStatus(kpis: Pick<KPIs, "modelStatus">, ctx: StatusContext): PublicStatus {
  const kind = deriveKind(kpis.modelStatus, ctx.endMarginVerdict);
  return { kind, label: LABEL[kind], colorToken: COLOR[kind], reason: adaptStatusReason(kind, ctx) };
}
