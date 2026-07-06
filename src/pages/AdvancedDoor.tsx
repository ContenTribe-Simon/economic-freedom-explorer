import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAdvancedDoorOpen, openAdvancedDoor } from "@/lib/advancedDoor";
import { focusRouteHeading } from "@/lib/routeFocus";
import { DOOR_FEATURES, DOOR_LEAD, DOOR_REMEMBER_NOTE } from "./advancedDoorCopy";

/**
 * The "Advanced door" — the deliberate routing boundary between the public Frihedsmodel flow
 * and the advanced app (product structure §4: "The existing advanced surface lives behind an
 * opt-in 'Advanced' door — same engine, same data").
 *
 * NOT authentication (that stays /auth for the advanced app's own cloud features) and NOT a
 * feature gate: once opened, the full advanced app works exactly as before, at its unchanged
 * URLs. The door is an interstitial shown at whatever advanced URL was requested, so deep
 * links and bookmarks keep working: opting in once (persisted per device) lets every later
 * direct navigation through without friction. Nobody LANDS on the advanced surface by
 * accident, but nobody who chose it is ever nagged again.
 */

/**
 * Route gate: renders its children (the advanced app) when the door has been opened on this
 * device, otherwise the door page — at the SAME URL, so the requested page appears right
 * after opting in.
 */
export function AdvancedGate({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(isAdvancedDoorOpen);
  // Opening the door swaps door -> requested page at the SAME pathname, so RouteFocusManager's
  // pathname-keyed effect never fires and the clicked button unmounts, dropping focus to
  // <body> (Codex, Phase 7 round 2). Trigger the shared focus rules after the swap commits.
  // The ref limits this to the IN-SESSION transition: a returning user whose door is already
  // open mounts straight into the app, and initial load never steals focus.
  const openedThisSession = useRef(false);
  useEffect(() => {
    if (open && openedThisSession.current) focusRouteHeading();
  }, [open]);
  if (open) return <>{children}</>;
  return (
    <DoorPage
      onOpen={() => {
        openedThisSession.current = true;
        openAdvancedDoor();
        setOpen(true);
      }}
    />
  );
}

function DoorPage({ onOpen }: { onOpen: () => void }) {
  const location = useLocation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-12 text-foreground">
      <div className="w-full max-w-[640px]">
        <p className="m-0 text-[12.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Frihedsmodel
        </p>
        <h1 data-route-focus tabIndex={-1} className="mb-4 mt-2 font-display text-[clamp(30px,5vw,42px)] font-light leading-[1.12] tracking-[-0.01em] focus:outline-none">
          Du er på vej ind i den avancerede model.
        </h1>
        <p className="mb-8 text-[16px] leading-[1.6] text-muted-foreground">{DOOR_LEAD}</p>
        <div className="flex flex-wrap items-center gap-4">
          <Button size="lg" className="h-12 px-7 text-[15px] [&_svg]:size-[18px]" onClick={onOpen} data-testid="open-advanced-door">
            Åbn den avancerede model
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button asChild variant="outline" size="lg" className="h-12 px-7 text-[15px] [&_svg]:size-[18px]">
            <Link to="/start">
              <ArrowLeft aria-hidden="true" />
              Tilbage til den enkle udgave
            </Link>
          </Button>
        </div>
        <p className="mb-3 mt-8 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Det finder du derinde
        </p>
        <dl className="m-0 grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
          {DOOR_FEATURES.map(([title, body]) => (
            <div key={title}>
              <dt className="text-[14px] font-semibold text-foreground">{title}</dt>
              <dd className="m-0 mt-1 text-[13.5px] leading-[1.55] text-muted-foreground">{body}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 border-t border-border pt-4 text-[12.5px] text-muted-foreground">
          {DOOR_REMEMBER_NOTE} Du bad om siden {location.pathname}. Den åbner, når du fortsætter.
        </p>
      </div>
    </div>
  );
}
