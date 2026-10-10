# Phase 12 workstreams C + D: privacy, consent, go-live (design)

Status: approved in conversation 2026-10-10, pending written-spec review.
Scope source: `docs/product-vision.md` §6 (Phase 12 checklist + workstream breakdown).
Owner decisions recorded here are Simon's; everything else is a proposal he approved.

## 1. Goal

Make the public Frihedsmodel launch-ready on privacy, legal and go-live hygiene, without
touching engine output. Concretely: no user financial figure ever leaves the browser except
by the user's explicit action, the site says truthfully what it stores and why, users can
delete their data, monitoring/analytics exist under valid consent, and the published HTML
carries no Lovable scaffolding.

## 2. Decisions (Simon, 2026-10-10)

| Topic | Decision |
|---|---|
| Analytics/monitoring | PostHog (EU), **full tracking with a consent banner**. Before or without consent: cookieless (nothing stored on the device). After "yes": persistent ID in localStorage. |
| Data controller | **ContenTribe** (company). CVR and contact mail live in one constant with explicit placeholders until Simon fills them. |
| Feedback / bug channel | **mailto link** in the public footer, subject prefilled. No backend. |
| Account deletion | **Self-service** "Slet min konto" on `/cloud`, via a Supabase edge function. |
| Domain | **Not decided.** One build variable `VITE_SITE_URL`; absolute-URL features are omitted when it is unset. |
| Consent mechanism | Own banner + posthog-js built-in consent API (approach A). Rejected: load-only-after-yes (blind to errors for most users); third-party CMP (external scripts break CSP, cost, off-brand). |

## 3. Facts this design rests on (audit, 2026-10-10)

- Public routes: `/start`, `/simple-inputs`, `/resultat`, `/gem-og-del` (`src/App.tsx:57-88`).
  Advanced routes sit behind `AdvancedGate`; `/auth` and `/cloud` are advanced-only.
- Browser storage: `frihedsmodel-public.v1` (public inputs + saved calcs),
  `finance-tool.v1` (advanced model), `frihedsmodel-advanced-door.v1` (flag), Supabase
  `sb-<ref>-auth-token` (session incl. email, only after login), and a `sidebar:state`
  cookie from the unused shadcn Sidebar (`src/components/ui/sidebar.tsx`).
- Supabase stores email (`auth.users`, `profiles`) and financial model JSON
  (`finance_models.data_json`, `finance_snapshots`). All three tables cascade from
  `auth.users`. Auth is email + password only. No account deletion exists; models can be
  deleted one at a time.
- The MCP edge function (`supabase/functions/mcp`) is stateless and receives no user data.
- **Share links put all inputs in a query parameter** (`/resultat?d=…`,
  `src/lib/publicShare.ts`), so they reach the host on first request (access logs, link
  previews, Referer). This contradicts the copy's privacy promise.
- Only runtime third party today is Supabase. Fonts are self-hosted. A build-time CSP meta
  tag (`vite.config.ts` `cspMetaPlugin`) is guarded by `e2e/csp.spec.ts`.
- No privacy page, footer links, contact channel, analytics or consent code exist.
- The global disclaimer string is hardcoded in four public files
  (`Start.tsx`, `SimpleInputs.tsx`, `Resultat.tsx`, `GemOgDel.tsx`) and pinned by tests.
- `index.html`: `lang="en"`, `author`/`twitter:site` = Lovable, og/twitter image on a
  Lovable R2 bucket, two TODO comments, typo "scenerier". `public/` has Lovable's default
  favicon, `placeholder.svg`, and an allow-all `robots.txt` without sitemap.

## 4. Delivery: five PRs, in order

Each PR is its own branch, green on unit + typecheck + build + e2e, reviewed by Codex,
merged by Simon. No PR changes engine/projection output.

### PR 1 — Share links via URL fragment (`fix/share-link-fragment-v1`)

- `shareUrlFor` emits `/resultat#d=<payload>`. Encoding/decoding/sanitizing unchanged.
- `Resultat` reads the payload from `location.hash` first, then falls back to the legacy
  `?d=` query param so already-shared links keep working. After decoding, both forms are
  stripped from the address bar (replace navigation), as today.
- Hostile-input behaviour is preserved for both sources (non-record → null, recipient's
  inputs untouched).
- Copy claim check (CLAUDE.md §7): the GemOgDel sentence "Vi sender ikke dine tal nogen
  steder" reads no `PublicResult` field; its claim is about transport. Test: a generated
  share URL has no query string and its payload sits only after `#`.
- Tests: unit (fragment round-trip, legacy query fallback, precedence when both present:
  fragment wins, hostile payloads in each); e2e (open a fragment link → result shows the
  shared plan → address bar is clean).

### PR 2 — Go-live cleanup (`chore/golive-html-seo-v1`)

- `index.html`: `lang="da"`; title/description under the Frihedsmodel name (plain Danish,
  no em dashes); remove `author`, `twitter:site`, TODO comments; fix "scenerier".
- Self-hosted social image `public/og-image.png` (1200×630) and new favicon set
  (`favicon.ico`, `favicon.svg`, `apple-touch-icon.png`); og/twitter image tags point at
  the self-hosted file. Remove unused `placeholder.svg`. Image design: simple brand mark on
  the public palette; Simon approves the image before merge.
- `VITE_SITE_URL` (optional): when set at build time, a Vite plugin emits absolute
  `og:url`, `<link rel="canonical">`, absolute og/twitter image URLs, `sitemap.xml` (the
  four public routes plus `/privatliv` once it exists) and a `Sitemap:` line in
  `robots.txt`. When unset, these are omitted rather than wrong. `robots.txt` disallows
  the advanced routes and `/debug/`.
- Backlog item 8 (`docs/backlog-public-polish-v1.md`): align the advanced page headings
  and nav labels with the door's promises ("Milepæle for uafhængighed", "Sammenlign
  rammevilkår"). Door copy itself is unchanged (guarded by `advanced-door-copy.test.ts`).
  Mark item 8 fixed in the backlog doc.
- Remove the unused shadcn Sidebar component and its `sidebar:state` cookie if a usage
  scan confirms it is dead, so the privacy page can state that no cookies are set.
- Tests: an HTML test on the built `dist/index.html` (lang, no "Lovable", no "TODO",
  no off-origin image URLs); sitemap plugin unit test with/without `VITE_SITE_URL`;
  updated heading tests for item 8.

### PR 3 — Privacy page + public footer (`feat/public-privacy-footer-v1`)

- **Single disclaimer constant** in a new `src/lib/publicCopy.ts`, exact current text;
  the four public screens and the pinning tests read it. No wording change.
- **Legal entity constant** `src/lib/legalEntity.ts`: name "ContenTribe", CVR, contact
  mail, with explicit placeholder values. A production-build guard fails the build (Vite
  plugin, `mode === "production"`) while placeholders remain, so they cannot ship. Dev,
  unit tests and e2e are unaffected. (CI's `npm run build` will therefore fail until Simon
  fills them; the guard is skippable only via an explicit `ALLOW_LEGAL_PLACEHOLDERS=1`
  env used by CI until then. Removing that flag from CI is a go-live checklist item.)
- **Public footer component** on all four public screens and `/privatliv`: the disclaimer,
  links "Privatliv", "Cookie-indstillinger" (opens the consent banner; inert until PR 4,
  so it is hidden until then), "Giv feedback" (mailto to the contact mail, prefilled
  subject, no figures in the body). Replaces Start's hand-rolled disclaimer strip.
- **`/privatliv` route** (public, no app shell), written from what the code does:
  data controller and contact; what is stored locally (and that it never leaves the
  device); share links (data only in the link the user chooses to send); optional cloud
  account (email + saved models, Supabase EU/US region to be confirmed by Simon, kept
  until the user deletes them); hosting provider logs (Lovable); PostHog section added in
  PR 4; legal bases (consent for analytics, contract for accounts, legitimate interest for
  security logs); retention; rights (access, rectification, erasure, portability,
  objection, withdrawal of consent); complaint to Datatilsynet. Plain Danish per the copy
  voice; Simon reviews the text.
- **"Slet alle mine data i denne browser"** on `/privatliv`: confirmation dialog, then
  removes every app-owned key (`frihedsmodel-public.v1`, `finance-tool.v1`,
  `frihedsmodel-advanced-door.v1`, consent key from PR 4) and resets in-memory stores.
  Does not touch a cloud account (the page says so and points to `/cloud`).
- Tests: copy guard for `/privatliv` and the footer (forbidden public terms, no em dash,
  no "ca."); legal-placeholder build guard test; local-wipe test (keys gone, stores reset,
  foreign keys untouched); e2e footer links + wipe flow; existing disclaimer pins still pass.

### PR 4 — PostHog + consent (`feat/posthog-consent-v1`)

- `posthog-js` (npm, bundled). Config: EU host; undecided and declined users run with
  `persistence: "memory"` and PostHog's cookieless mode (`cookieless_mode: "on_reject"` or
  the equivalent option in the installed version, verified against the posthog-js docs at
  implementation time); `persistence: "localStorage"` is enabled only after opt-in; **`autocapture: false`**, **`disable_session_recording: true`**,
  **`disable_external_dependency_loading: true`** (no remote scripts, CSP stays
  `script-src 'self'`), `capture_pageview` handled by our router hook.
- **No financial data, ever.** One module `src/lib/analytics/events.ts` defines the only
  allowed events and their properties: `$pageview` (route path only), `calculation_completed`,
  `share_link_copied`, `calculation_saved`, `advanced_door_opened`, `consent_changed`,
  `$exception` (error type + component, no message text from user input). A `before_send`
  hook strips query and hash from every URL property and drops any property not in the
  allow-list. Test: feed every event through `before_send` with a fully populated public
  input set in scope and assert no input value, no kroner amount and no input field name
  appears anywhere in the payload.
- **Consent banner** (public + advanced): shown on first visit when PostHog is enabled;
  two equally prominent buttons "Ja tak" / "Nej tak", no pre-ticked state, short plain
  Danish text with a link to `/privatliv`. Choice stored under one key
  (`frihedsmodel-consent.v1`: `granted` | `denied` + timestamp + policy version). Footer
  "Cookie-indstillinger" reopens it; changing to "Nej tak" calls opt-out and clears
  PostHog's persisted ID.
- **Errors:** `AppErrorBoundary` and `window.onerror`/`unhandledrejection` send
  `$exception` in both modes, scrubbed as above.
- **Off switch:** without `VITE_POSTHOG_KEY` nothing initializes and no banner renders, so
  local dev, unit tests, e2e and CI behave exactly as today.
- CSP: `connect-src` gains the PostHog EU ingestion origin only when the key is set.
  `e2e/csp.spec.ts` gains a run with a dummy key and network stubbed.
- `/privatliv` gains its PostHog section in this same PR (what is collected in each mode,
  legal basis, retention per PostHog project setting, EU hosting).
- Manual (Simon, PostHog dashboard): EU project, enable cookieless server hash mode, set
  data retention, disable IP capture.
- Tests: consent state machine unit tests; banner e2e (yes, no, reopen, change);
  payload-scrubbing test above; "no key → no banner, no network" test.

### PR 5 — Cloud account deletion + backup notes (`feat/cloud-account-deletion-v1`)

- Edge function `supabase/functions/delete-account`: requires a valid user JWT
  (`Authorization: Bearer`), resolves the user via `auth.getUser(jwt)`, deletes exactly
  that user with the service-role client (`auth.admin.deleteUser(user.id)`); cascades
  remove `profiles`, `finance_models`, `finance_snapshots`. No request body is trusted for
  identity. POST only; CORS limited to the app origin(s).
- `/cloud`: "Slet min konto" button → dialog requiring the user to type their email →
  calls the function → signs out locally → confirmation message. Local browser data is
  untouched (stated in the dialog).
- Backup/restore: document in `src/lib/cloud/CLOUD_MODEL.md` what the Supabase plan behind
  Lovable Cloud provides (daily backups / PITR), how a restore is performed, and that the
  advanced JSON export is the user's own backup. Includes the export/import round-trip as
  the user-level restore path (already tested).
- Manual (Simon): confirm Lovable deploys edge functions from the repo and that the
  service-role key is available to functions as a secret; confirm the Supabase region for
  the privacy page.
- Tests: function unit tests with a mocked Supabase admin client (no JWT → 401, invalid
  JWT → 401, valid JWT → deletes that user id only, body-supplied ids ignored); UI test for
  the confirm-by-email dialog; `/privatliv` text updated to point at the self-service path.

## 5. Out of scope

- react-router v7 upgrade (tracked separately; moderate advisory noted in PR #42).
- Cloudflare/self-hosting for real security headers (deferred per roadmap).
- Deeper PostHog analytics configuration, dashboards, surveys (post-launch).
- Public JSON export/import (advanced already has it; YAGNI for the public MVP).
- Pre-existing lint debt (69 problems; lint is not a CI gate).

## 6. Go-live checklist additions (Simon)

1. Fill CVR + contact mail in `legalEntity.ts`; remove `ALLOW_LEGAL_PLACEHOLDERS` from CI.
2. Set `VITE_SITE_URL` and `VITE_POSTHOG_KEY` in Lovable's build env.
3. PostHog dashboard: EU, cookieless server hash on, IP capture off, retention set.
4. Supabase: confirm region, function secrets, backup tier; B's manual auth checks.
5. Review `/privatliv` text and the og-image.

## 7. Risks

- **Legal text accuracy:** the privacy page is drafted from code, not legal advice. Simon
  reviews; a lawyer check is recommended before launch.
- **PostHog cookieless semantics:** if cookieless server hashing is not enabled in the
  project, declined users are simply not counted (events are dropped client-side), which
  is safe but loses error monitoring for them.
- **Edge-function deploy path via Lovable** is unverified from the repo; PR 5 is blocked
  on Simon confirming it.
