/**
 * Who runs Frihedsmodel: the data controller named on the privacy page and the address behind the
 * feedback link (Phase 12 C/D, PR 3). One place, so the page, the footer and the tests agree.
 */
export const LEGAL_ENTITY = {
  name: "ContenTribe",
  cvr: "44349124",
  email: "info@contentribe.dk",
} as const;

/** Prefilled feedback mail. Deliberately no figures in the body: the user's numbers stay local. */
export const FEEDBACK_MAILTO = `mailto:${LEGAL_ENTITY.email}?subject=${encodeURIComponent("Feedback på Frihedsmodel")}`;
