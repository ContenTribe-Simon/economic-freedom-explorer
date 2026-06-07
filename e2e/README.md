# End-to-end smoke tests (Playwright)

Browser-level smoke tests that prove the app boots and the main routes render. They run
against the local Vite dev server on port `8080` (auto-started by Playwright), **not** the
Lovable preview.

## First run / CI: install the browser binary

Playwright needs a Chromium binary that is **not** included by `npm install` / `npm ci`.
Install it once before running the tests:

```bash
npm run test:e2e:install      # downloads Chromium into the Playwright cache
```

## Run the smoke tests

```bash
npm run test:e2e              # headless (assumes the browser is already installed)
npm run test:e2e -- --headed # watch it in a real browser window
```

## CI (Linux) one-liner

Installs Chromium **with OS dependencies** and then runs the suite:

```bash
npm run test:e2e:ci
```

Tests live in `e2e/*.spec.ts` and are kept out of the Vitest unit run (Vitest only includes
`src/**`). See `../playwright.config.ts` for the dev-server + browser configuration.
