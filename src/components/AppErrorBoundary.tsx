import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Last-resort error containment for the whole app (Phase 7 hardening). Resultat and
 * GemOgDel run the projection pipeline synchronously during render; before this boundary,
 * ANY unexpected engine/adapter/chart error unmounted the entire React tree — a blank
 * screen with no recovery. The fallback deliberately avoids every app dependency (no
 * router Link, no providers, no store): it must render even when those are what broke.
 * A plain <a href="/start"> gives a full reload into the public entry, which also resets
 * the boundary; the reload button retries the current URL.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Visible in the browser console for debugging; the user sees only the calm fallback.
    console.error("Uventet fejl i visningen:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
        <div className="max-w-[36em] text-center">
          <h1 className="m-0 font-display text-[clamp(28px,5vw,40px)] font-light leading-[1.15] tracking-[-0.01em]">
            Noget gik galt.
          </h1>
          <p className="mt-4 text-[16px] leading-[1.6] text-[color:var(--ink-soft)]">
            Der opstod en teknisk fejl, så siden ikke kan vises. Prøv at genindlæse siden,
            eller start forfra fra forsiden.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-11 items-center rounded-lg bg-primary px-6 text-[15px] font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Genindlæs siden
            </button>
            <a
              href="/start"
              className="inline-flex h-11 items-center rounded-lg border border-border bg-card px-6 text-[15px] font-semibold text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Til forsiden
            </a>
          </div>
        </div>
      </main>
    );
  }
}
