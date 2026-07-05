import { useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isAdvancedDoorOpen, openAdvancedDoor } from "@/lib/advancedDoor";

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
  if (open) return <>{children}</>;
  return (
    <DoorPage
      onOpen={() => {
        openAdvancedDoor();
        setOpen(true);
      }}
    />
  );
}

function DoorPage({ onOpen }: { onOpen: () => void }) {
  const location = useLocation();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-[540px]">
        <p className="m-0 text-[12.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Frihedsmodel
        </p>
        <h1 className="mb-4 mt-2 font-display text-[clamp(30px,5vw,42px)] font-light leading-[1.12] tracking-[-0.01em]">
          Du er på vej ind i den avancerede model.
        </h1>
        <p className="mb-3 text-[16px] leading-[1.6] text-muted-foreground">
          Den bruger samme beregningsmodel som den enkle udgave, men viser alle detaljer og
          indstillinger, blandt andet skat, pension i flere lag, gæld og stress-tests. Den er
          bygget til dyb gennemgang, ikke til et hurtigt overblik.
        </p>
        <p className="mb-8 text-[14px] leading-[1.6] text-muted-foreground">
          Dit valg huskes på denne enhed, så du lander direkte her næste gang.
        </p>
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
        <p className="mt-8 border-t border-border pt-4 text-[12.5px] text-muted-foreground">
          Du bad om siden {location.pathname}. Den åbner, når du fortsætter.
        </p>
      </div>
    </div>
  );
}
