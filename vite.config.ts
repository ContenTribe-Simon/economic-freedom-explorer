import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/supabase/vite";

/**
 * Production-only Content-Security-Policy meta tag (Phase 12 workstream B — security).
 *
 * Lovable does not allow custom HTTP response headers on a published project, so a
 * <meta http-equiv="Content-Security-Policy"> tag is the only CSP mechanism available on the
 * live site (see docs/product-vision.md §6). It is injected ONLY into the production build:
 * `npm run dev` — and the Playwright e2e suite, which runs against the dev server — need
 * script-src 'unsafe-inline' for @vitejs/plugin-react-swc's react-refresh preamble and
 * connect-src ws: for HMR, so the same tight policy in index.html would break both. The shipped
 * dist/index.html still carries the tight policy; dev is untouched (apply: "build").
 *
 * Directives are set to the app's ACTUAL runtime resource usage, verified against source + the
 * production bundle, not a generic template:
 *  - default-src 'none' — deny by default; every load must be allowed explicitly below.
 *  - script-src 'self' — the prod bundle has no inline script and no eval()/new Function() path.
 *  - style-src 'self' 'unsafe-inline' — FORCED: sonner and react-style-singleton (Radix scroll
 *    lock) inject <style> elements at runtime and support no nonce.
 *  - font-src / img-src 'self' — fonts are self-hosted (@fontsource); no external or data: images.
 *  - connect-src 'self' + the Supabase origin, added only when VITE_SUPABASE_URL is configured:
 *    Supabase is the sole network consumer (no realtime/websocket, no analytics).
 *  - object-src / base-uri 'none', form-action 'self' — close plugin/base-tag/redirect vectors.
 *
 * Cannot be expressed via <meta> (documented limits, not gaps): frame-ancestors (clickjacking),
 * report-uri, HSTS and X-Frame-Options — those require real HTTP headers.
 */
function cspMetaPlugin(supabaseUrl: string): Plugin {
  let connectSrc = "'self'";
  if (supabaseUrl) {
    try {
      connectSrc += ` ${new URL(supabaseUrl).origin}`;
    } catch {
      // Malformed VITE_SUPABASE_URL: keep 'self' only rather than emit a broken directive.
    }
  }
  const csp = [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "img-src 'self'",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
  return {
    name: "csp-meta",
    apply: "build",
    transformIndexHtml() {
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: csp },
          injectTo: "head-prepend",
        },
      ];
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [
      react(),
      mcpPlugin(),
      cspMetaPlugin(env.VITE_SUPABASE_URL ?? ""),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
