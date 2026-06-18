/**
 * Public-safe Frihedsmodel result layer — the contract made real in code.
 *
 * The public UI must import ONLY from this module, never from the raw engine internals
 * (`projection`, `kpis`, `sanity`, `types`). Everything exported here is horizon-correct, Danish,
 * and stripped of advanced / DK-personal concepts. See
 * docs/public-mvp-spec-and-data-contract-v1.md.
 */

// Public types.
export type {
  PublicResult,
  PublicStatus,
  PublicStatusKind,
  StatusColorToken,
  PublicBottleneck,
  PublicDriver,
  PublicScore,
  NetWorthPoint,
} from "./types";

// Entry points.
export { computePublicResult, buildPublicResult } from "./result";

// Adapters (exported so they exist before any screen consumes them — nothing raw can leak later).
export { toPublicStatus, adaptStatusReason, type StatusContext } from "./status";
export { adaptRobustnessDrivers, type DriverContext } from "./drivers";
export { classifyEndMargin, type EndMarginVerdict, type EndMarginInput } from "./endMargin";
export { toRobustnessScore, toAssumptionConfidenceScore } from "./scores";

// Horizon-correct selectors over the engine YearRows.
export {
  netWorthAtAge,
  capitalAtPlannedStopAge,
  firstShortfall,
  moneyLastsToAge,
  netWorthSeries,
} from "./selectors";

// Leak tripwire used by tests (and available to callers that want to assert public safety).
export { containsForbiddenTerm, FORBIDDEN_PUBLIC_TERMS } from "./safety";

// The public input surface (so the UI can build inputs then compute a result from one import).
export type { SimplePublicInputs } from "../simpleInputs";
export { DEFAULT_SIMPLE_INPUTS } from "../simpleInputs";
