# Economic Freedom Explorer

A financial-independence / FIRE planning tool that helps people understand **when they
can realistically become financially free, and what most affects that timeline.**

The product principle: *simple on the surface, powered by a strong underlying model.*
A first-time user meets simple inputs, understandable outputs, clear assumptions, and a
few practical levers — while the same engine supports advanced scenarios behind an
opt-in "Advanced" door.

> Public UI is in **Danish** (brand: *Frihedsmodel*). The repository / product name is
> *Economic Freedom Explorer*. (Naming across surfaces is intentionally being kept
> consistent — see `docs/product-vision.md`.)

## Status

Moving from a stable, well-tested **model foundation** toward the **public MVP UX/UI**.
The finance engine, a typed simple-input mapping layer, and a full test + CI gate are in
place. The next phase is defining the public user journey before building UI.

## Tech stack

- **Vite + React + TypeScript**
- **shadcn/ui** (Radix) + **Tailwind CSS**
- **Zustand** for runtime state (`src/store/financeStore.ts`)
- **Supabase** as an *optional* cloud overlay (save/login). The app works fully offline
  with `localStorage`; cloud is disabled without env config.
- **Vitest** (unit) + **Playwright** (e2e), gated in GitHub Actions.

## Quickstart

```bash
npm install
cp .env.example .env   # optional: fill VITE_SUPABASE_* to enable cloud save/login
npm run dev            # http://localhost:8080
```

The `VITE_SUPABASE_*` values are public browser-facing keys (bundled into the client by
design). The real data-access boundary is Supabase **Row Level Security**, not key
secrecy. Never put a `service_role` key in `.env`.

## Scripts

```bash
npm run dev            # dev server
npm test               # unit tests (Vitest, single run)
npm run test:watch     # unit tests, watch mode
npm run build          # production build
npm run lint           # ESLint
npm run test:e2e       # Playwright (run `test:e2e:install` once first)
npm run test:e2e:ci    # CI variant (installs Chromium + OS deps)
```

## Project structure

```
src/
  lib/finance/     # the financial engine (projection, types, stress, kpis, fire, …)
    MODEL.md       # engine flow & scenario types (read this first)
    ASK_NOTE.md    # ASK / Aktiesparekonto design note
    simpleInputs.ts# simple public input surface → full ScenarioInputs mapping
  lib/cloud/       # optional Supabase persistence (see CLOUD_MODEL.md)
  store/           # Zustand store (runtime source of truth)
  pages/           # routed pages (Dashboard, Inputs, Projection, Scenarios, …)
  components/      # UI components (incl. shadcn/ui in components/ui)
docs/              # product vision, model primitives, public MVP scope
e2e/               # Playwright smoke + user-flow specs
```

## Documentation map

- `docs/product-vision.md` — overall product direction and roadmap.
- `docs/model-primitives-v1.md` — the generalized model primitives.
- `docs/public-mvp-scope-v1.md` — public MVP scope (de-facto PRD).
- `src/lib/finance/MODEL.md` — engine flow and scenario types.
- `src/lib/cloud/CLOUD_MODEL.md` — cloud persistence rules.

## Contributing / working method

This project is built with AI agents under a **review-before-merge** workflow. If you
(or an agent) are making changes, read **[`CLAUDE.md`](./CLAUDE.md)** first — it defines
the guardrails, the finance/model rules, and the branch/PR process. `main` is never
changed directly by an agent.

## Disclaimer

Projections are estimates driven by assumptions — **not financial advice.**
