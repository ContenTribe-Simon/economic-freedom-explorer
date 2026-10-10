# PR 1: Share links via URL fragment (implementation plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Share links carry the user's inputs only after `#`, so the payload never reaches the host, while legacy `?d=` links keep working.

**Architecture:** `src/lib/publicShare.ts` gains a pure `readSharePayload(search, hash)` (fragment first, legacy query fallback) and `shareUrlFor` emits `/resultat#d=…`. `Resultat.tsx` reads `useLocation()` instead of `useSearchParams()` and hydrates from `readSharePayload`, then replaces the URL with a clean `/resultat`. Encoding, decoding and sanitizing are unchanged.

**Tech Stack:** React 18, react-router-dom v6, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-10-phase12-cd-privacy-golive-design.md` §4 PR 1.

## Global Constraints

- Branch `fix/share-link-fragment-v1` from up-to-date `main`. Never commit on `main`.
- No engine/projection output change. No public copy change in this PR.
- `decodeShareInputs` stays the single trust boundary; hostile behaviour (non-record → `null`, recipient's inputs untouched) must hold for both sources.
- Fragment wins when both `#d=` and `?d=` are present.
- Gate before PR: `npx vitest run`, `npx tsc -p tsconfig.app.json --noEmit`, `npm run build`, `npm run test:e2e` all green.

---

### Task 1: `readSharePayload` + fragment URL in `publicShare.ts`

**Files:**
- Modify: `src/lib/publicShare.ts` (header comment lines 4-13, `shareUrlFor` lines 50-54, new export)
- Modify: `src/lib/__tests__/publicShare-hostile.test.ts:4` (comment only: "`d` query param" → "`d` fragment param (legacy: query param)")
- Test (create): `src/lib/__tests__/publicShare-fragment.test.ts`

**Interfaces:**
- Produces: `readSharePayload(search: string, hash: string): string | null` (raw encoded payload or null; `search` like `"?d=x"`, `hash` like `"#d=x"`, both may be `""`); `shareUrlFor(inputs): string` now returns `${origin}/resultat#d=${payload}`.

- [ ] **Step 1: Write the failing test** — `src/lib/__tests__/publicShare-fragment.test.ts`

```ts
/**
 * PR 1 (Phase 12 C/D): share links carry the payload in the URL FRAGMENT, which browsers never
 * send to the server — so the host (access logs, link previews, Referer) never sees the inputs.
 * Legacy `?d=` links already in circulation must keep working.
 */
import { describe, expect, it } from "vitest";
import { decodeShareInputs, encodeShareInputs, readSharePayload, shareUrlFor } from "@/lib/publicShare";
import { DEFAULT_SIMPLE_INPUTS } from "@/lib/finance/public";

const SHARED = { ...DEFAULT_SIMPLE_INPUTS, currentAge: 41, monthlySavings: 7_500 };

describe("shareUrlFor: payload lives only in the fragment", () => {
  it("has no query string and puts d= after #", () => {
    const url = new URL(shareUrlFor(SHARED), "https://example.test");
    expect(url.pathname).toBe("/resultat");
    expect(url.search).toBe("");
    expect(url.hash.startsWith("#d=")).toBe(true);
  });

  it("round-trips through readSharePayload + decodeShareInputs", () => {
    const url = new URL(shareUrlFor(SHARED), "https://example.test");
    const payload = readSharePayload(url.search, url.hash);
    expect(payload).not.toBeNull();
    expect(decodeShareInputs(payload!)).toMatchObject({ currentAge: 41, monthlySavings: 7_500 });
  });
});

describe("readSharePayload: source precedence", () => {
  const frag = encodeShareInputs({ ...SHARED, currentAge: 30 });
  const legacy = encodeShareInputs({ ...SHARED, currentAge: 50 });

  it("reads the fragment", () => {
    expect(readSharePayload("", `#d=${frag}`)).toBe(frag);
  });

  it("falls back to the legacy query param", () => {
    expect(readSharePayload(`?d=${legacy}`, "")).toBe(legacy);
  });

  it("prefers the fragment when both are present", () => {
    expect(readSharePayload(`?d=${legacy}`, `#d=${frag}`)).toBe(frag);
  });

  it("returns null when neither carries d", () => {
    expect(readSharePayload("", "")).toBeNull();
    expect(readSharePayload("?x=1", "#top")).toBeNull();
  });

  it("returns the raw value for hostile payloads; decoding stays the trust boundary", () => {
    expect(readSharePayload("", "#d=%%%not-base64%%%")).toBe("%%%not-base64%%%");
    expect(decodeShareInputs(readSharePayload("", "#d=%%%not-base64%%%")!)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/__tests__/publicShare-fragment.test.ts`
Expected: FAIL (`readSharePayload` is not exported; `url.search` is `?d=…`).

- [ ] **Step 3: Implement** — in `src/lib/publicShare.ts`

Replace the header's format line with:

```ts
 * Format: base64url of the SimplePublicInputs JSON in a `d` param in the URL FRAGMENT on
 * /resultat (`/resultat#d=…`). The fragment is never sent to the server, so the host never sees
 * the inputs. Legacy links put `d` in the query string (`/resultat?d=…`); they still decode, and
 * the fragment wins if both are present.
```

Add above `shareUrlFor`:

```ts
/**
 * The raw encoded payload from a location's search + hash, or null. Fragment first, then the
 * legacy query param. Returns the value undecoded; `decodeShareInputs` is the trust boundary.
 */
export function readSharePayload(search: string, hash: string): string | null {
  const fromHash = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("d");
  if (fromHash != null) return fromHash;
  return new URLSearchParams(search).get("d");
}
```

Change `shareUrlFor`'s return to:

```ts
  return `${origin}/resultat#d=${encodeShareInputs(inputs)}`;
```

Update the doc comment on `encodeShareInputs` to "Encode inputs for the share link's `d` fragment param." and the hostile-test header comment as listed under Files.

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/lib/__tests__/`
Expected: PASS (new file + existing hostile tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/publicShare.ts src/lib/__tests__/publicShare-fragment.test.ts src/lib/__tests__/publicShare-hostile.test.ts
git commit -m "fix(share): put share-link payload in the URL fragment, keep legacy ?d= readable"
```

---

### Task 2: `Resultat` hydrates from fragment (legacy query fallback)

**Files:**
- Modify: `src/pages/public/Resultat.tsx:2` (imports), `:114-127` (hydration effect)
- Test (create): `src/pages/public/__tests__/resultat-share-hydration.test.tsx`

**Interfaces:**
- Consumes: `readSharePayload(search, hash)`, `encodeShareInputs`, `decodeShareInputs` from Task 1.

- [ ] **Step 1: Write the failing test** — `src/pages/public/__tests__/resultat-share-hydration.test.tsx`

```tsx
/**
 * PR 1 (Phase 12 C/D): opening a share link hydrates the recipient's inputs from the URL
 * fragment (legacy ?d= still accepted), then cleans the address bar. Hostile payloads leave the
 * recipient's own inputs untouched.
 */
import { describe, expect, it, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import Resultat from "../Resultat";
import { usePublicStore } from "@/store/publicStore";
import { DEFAULT_SIMPLE_INPUTS } from "@/lib/finance/public";
import { encodeShareInputs } from "@/lib/publicShare";

let current = "";
function LocationProbe() {
  const loc = useLocation();
  current = `${loc.pathname}${loc.search}${loc.hash}`;
  return null;
}

function open(entry: string) {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[entry]}>
        <LocationProbe />
        <Routes>
          <Route path="/resultat" element={<Resultat />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  );
}

const OWN = { ...DEFAULT_SIMPLE_INPUTS, currentAge: 33 };

beforeEach(() => {
  current = "";
  usePublicStore.setState({ inputs: { ...OWN }, saved: [] });
});

describe("Resultat share-link hydration", () => {
  it("hydrates from the fragment and cleans the URL", async () => {
    open(`/resultat#d=${encodeShareInputs({ ...DEFAULT_SIMPLE_INPUTS, currentAge: 44 })}`);
    await waitFor(() => expect(usePublicStore.getState().inputs.currentAge).toBe(44));
    await waitFor(() => expect(current).toBe("/resultat"));
  });

  it("still hydrates from a legacy ?d= link and cleans the URL", async () => {
    open(`/resultat?d=${encodeShareInputs({ ...DEFAULT_SIMPLE_INPUTS, currentAge: 55 })}`);
    await waitFor(() => expect(usePublicStore.getState().inputs.currentAge).toBe(55));
    await waitFor(() => expect(current).toBe("/resultat"));
  });

  it("prefers the fragment when both are present", async () => {
    const legacy = encodeShareInputs({ ...DEFAULT_SIMPLE_INPUTS, currentAge: 50 });
    const frag = encodeShareInputs({ ...DEFAULT_SIMPLE_INPUTS, currentAge: 30 });
    open(`/resultat?d=${legacy}#d=${frag}`);
    await waitFor(() => expect(usePublicStore.getState().inputs.currentAge).toBe(30));
  });

  it("ignores a hostile fragment: recipient's inputs untouched, URL cleaned", async () => {
    open("/resultat#d=%%%not-base64%%%");
    await waitFor(() => expect(current).toBe("/resultat"));
    expect(usePublicStore.getState().inputs.currentAge).toBe(33);
  });

  it("does nothing without a payload", async () => {
    open("/resultat");
    await waitFor(() => expect(current).toBe("/resultat"));
    expect(usePublicStore.getState().inputs.currentAge).toBe(33);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/public/__tests__/resultat-share-hydration.test.tsx`
Expected: FAIL on the fragment cases (current code only reads `searchParams`). The legacy and no-payload cases pass.

- [ ] **Step 3: Implement** — in `src/pages/public/Resultat.tsx`

Import line 2 becomes:

```ts
import { Link, useLocation, useNavigate } from "react-router-dom";
```

Import line 11 becomes:

```ts
import { decodeShareInputs, readSharePayload } from "@/lib/publicShare";
```

Replace lines 114-127 (the `useSearchParams` line through the effect) with:

```tsx
  const location = useLocation();
  const navigate = useNavigate();

  // Share-link hydration: /resultat#d=<encoded inputs> (legacy: ?d=) loads the sender's numbers
  // into the local state ("Linket indeholder dine tal"), then cleans the URL. The fragment is
  // never sent to the server. Decoding is defensive: a malformed payload is simply ignored.
  useEffect(() => {
    const d = readSharePayload(location.search, location.hash);
    if (d == null) return;
    const decoded = decodeShareInputs(d);
    if (decoded) replaceInputs(decoded);
    navigate("/resultat", { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per mount/link change
  }, [location.search, location.hash]);
```

(Keep the existing `const navigate = useNavigate();` from the old block removed so it is declared once.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run src/pages/public/`
Expected: PASS (new file + all existing Resultat tests).

- [ ] **Step 5: Commit**

```bash
git add src/pages/public/Resultat.tsx src/pages/public/__tests__/resultat-share-hydration.test.tsx
git commit -m "fix(resultat): hydrate shared plans from the URL fragment, legacy ?d= still accepted"
```

---

### Task 3: E2E proof that the payload never reaches the server

**Files:**
- Test (create): `e2e/share-link.spec.ts`
- Modify: `docs/backlog-public-polish-v1.md:29` (`/resultat?d=...` → `/resultat#d=...`, note legacy `?d=` still accepted)

- [ ] **Step 1: Write the test** — `e2e/share-link.spec.ts`

```ts
/**
 * Share links (PR 1, Phase 12 C/D): the payload sits in the URL fragment, which the browser never
 * sends to the server. Proven against a real browser: no network request carries the payload, the
 * shared plan lands in the recipient's local state, and the address bar is cleaned.
 */
import { test, expect } from "@playwright/test";

const PUBLIC_KEY = "frihedsmodel-public.v1";

function encode(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64url");
}

const SHARED = {
  currentAge: 47, lifeExpectancy: 90, annualIncome: 612_345, monthlySpending: 23_456,
  currentInvestments: 345_678, monthlySavings: 9_876, pensionBalance: 456_789,
  pensionAccessAge: 68, expectedRealReturn: 0.04, desiredStopAge: 62,
};

test("fragment share link: payload never sent, plan hydrated, URL cleaned", async ({ page }) => {
  const payload = encode(SHARED);
  const requested: string[] = [];
  page.on("request", (r) => requested.push(r.url()));

  await page.goto(`/resultat#d=${payload}`);
  await expect(page).toHaveURL(/\/resultat$/);

  expect(requested.some((u) => u.includes(payload))).toBe(false);
  const stored = await page.evaluate((k) => localStorage.getItem(k), PUBLIC_KEY);
  expect(JSON.parse(stored!).state.inputs).toMatchObject({ currentAge: 47, monthlySavings: 9_876 });
});

test("legacy ?d= link still hydrates and is cleaned", async ({ page }) => {
  await page.goto(`/resultat?d=${encode({ ...SHARED, currentAge: 52 })}`);
  await expect(page).toHaveURL(/\/resultat$/);
  const stored = await page.evaluate((k) => localStorage.getItem(k), PUBLIC_KEY);
  expect(JSON.parse(stored!).state.inputs.currentAge).toBe(52);
});
```

Before running, confirm the `SHARED` field names match `SimplePublicInputs` in `src/lib/finance/simpleInputs.ts` (lines 16-39) and the persisted shape `{ state: { inputs } }` from `src/store/publicStore.ts:105`; adjust names only, not intent.

- [ ] **Step 2: Run it**

Run: `npx playwright test e2e/share-link.spec.ts`
Expected: PASS (Tasks 1-2 are in place).

- [ ] **Step 3: Update backlog note, full gate, commit**

Edit `docs/backlog-public-polish-v1.md:29` as listed. Then:

Run: `npx vitest run && npx tsc -p tsconfig.app.json --noEmit && npm run build && npm run test:e2e`
Expected: all green.

```bash
git add e2e/share-link.spec.ts docs/backlog-public-polish-v1.md
git commit -m "test(e2e): prove share-link payload never reaches the server"
```
