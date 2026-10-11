import { CUSTOM_EVENTS, SYSTEM_EVENTS } from "./events";

/**
 * PostHog `before_send` filter (Phase 12 C/D, PR 4): the last line of defence for the rule that no
 * financial figure leaves the browser.
 * - Unknown events (autocapture, rage clicks, page leave, replay, surveys...) are dropped.
 * - Custom events lose every property they did not get from PostHog itself ($-prefixed).
 * - Every URL-like property loses its query string and fragment (a share link's numbers live in
 *   the fragment; legacy links put them in `?d=`).
 * - Exception messages have digit runs masked, in case an error ever echoes a number.
 */
export type CaptureEvent = { event: string; properties?: Record<string, unknown> } & Record<string, unknown>;

const ALLOWED = new Set<string>([...CUSTOM_EVENTS, ...SYSTEM_EVENTS]);
const CUSTOM = new Set<string>(CUSTOM_EVENTS);
const URL_KEYS = /(url|referrer|href)$/i;

export function stripUrl(value: string): string {
  const cut = value.search(/[?#]/);
  return cut === -1 ? value : value.slice(0, cut);
}

export function maskDigits(value: string): string {
  return value.replace(/\d+/g, "#");
}

function scrubValue(key: string, value: unknown): unknown {
  if (typeof value === "string" && URL_KEYS.test(key)) return stripUrl(value);
  return value;
}

function scrubException(props: Record<string, unknown>): Record<string, unknown> {
  const out = { ...props };
  if (typeof out.$exception_message === "string") out.$exception_message = maskDigits(out.$exception_message);
  if (Array.isArray(out.$exception_list)) {
    out.$exception_list = out.$exception_list.map((e) =>
      e && typeof e === "object" && typeof (e as { value?: unknown }).value === "string"
        ? { ...(e as object), value: maskDigits((e as { value: string }).value) }
        : e,
    );
  }
  return out;
}

export function scrubEvent<T extends CaptureEvent>(event: T | null): T | null {
  if (!event || !ALLOWED.has(event.event)) return null;
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(event.properties ?? {})) {
    if (CUSTOM.has(event.event) && !k.startsWith("$")) continue;
    props[k] = scrubValue(k, v);
  }
  const $set = event.$set;
  const cleaned = { ...event, properties: event.event === "$exception" ? scrubException(props) : props };
  // Never attach person properties: there is nothing about a person we want to store.
  if ($set !== undefined) delete (cleaned as Record<string, unknown>).$set;
  delete (cleaned as Record<string, unknown>).$set_once;
  return cleaned;
}
