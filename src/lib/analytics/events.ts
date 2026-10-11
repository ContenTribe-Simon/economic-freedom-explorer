/**
 * The ONLY analytics events the app may send (Phase 12 C/D, PR 4). Hard rule from the spec: no
 * financial figure, no input value and no input field name ever reaches PostHog. Custom events
 * therefore carry no properties at all; anything else is dropped by `scrubEvent`.
 */
export const CUSTOM_EVENTS = [
  "calculation_completed",
  "share_link_copied",
  "calculation_saved",
  "advanced_door_opened",
] as const;

export type CustomEvent = (typeof CUSTOM_EVENTS)[number];

/** PostHog's own events we keep: page views, exceptions, web vitals. Everything else is dropped. */
export const SYSTEM_EVENTS = ["$pageview", "$exception", "$web_vitals"] as const;
