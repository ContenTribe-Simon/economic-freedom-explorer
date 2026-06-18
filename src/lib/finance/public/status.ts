/**
 * Public-safe status adapter (data contract §4.4(a)).
 *
 * The public status is derived from the engine's existing `modelStatus` verdict — NO new
 * thresholds. The reason is synthesised from the verdict plus already-public facts; the raw
 * `modelStatusReason` (which may name holding / folkepension / ratepension / "No Barma") is
 * never read into the output. Default-deny by construction.
 */
import type { KPIs, ModelStatus } from "../types";
import type { PublicStatus, PublicStatusKind, StatusColorToken } from "./types";

const KIND_BY_STATUS: Record<ModelStatus, PublicStatusKind> = {
  valid: "on_track",
  target_missed: "tight",
  invalid: "off_track",
};

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

/** Map the engine verdict to a public status badge (kind + Danish label + colour + safe reason). */
export function toPublicStatus(kpis: Pick<KPIs, "modelStatus">, ctx: StatusContext): PublicStatus {
  const kind = KIND_BY_STATUS[kpis.modelStatus];
  return { kind, label: LABEL[kind], colorToken: COLOR[kind], reason: adaptStatusReason(kind, ctx) };
}
