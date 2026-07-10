import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config. Most specs run against the LOCAL Vite dev server (port 8080). One spec,
 * csp.spec.ts, runs against the PRODUCTION build served by `vite preview` on port 4174: the
 * Content-Security-Policy <meta> is injected only at build time (vite.config.ts), so the dev
 * server has none. Both servers are declared below; Playwright starts both before the suite.
 * Tests live in ./e2e (outside src/, so Vitest's `src/**` include never picks them up, and
 * Playwright's testDir never picks up unit tests).
 *
 * First run / CI: the Chromium binary is NOT installed by `npm install` / `npm ci`. Install it
 * once via `npm run test:e2e:install` (or `npm run test:e2e:ci` on Linux CI). See e2e/README.md.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: "http://localhost:8080",
    headless: true,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "npm run dev",
      url: "http://localhost:8080",
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      // Production build served for csp.spec.ts — the CSP <meta> exists only in the build output.
      // Rebuilds on start; reuseExistingServer skips that when a preview is already up locally.
      command: "npm run build && npm run preview -- --port 4174 --strictPort",
      url: "http://localhost:4174",
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
