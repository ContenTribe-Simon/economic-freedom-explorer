import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import "./public/start.css";

/**
 * 404 on the public side of the door (Phase 12 C/D, content review): replaces Lovable's English
 * placeholder ("Oops! Page not found") with a plain Danish page in the public design, one clear
 * way back to the start, and the shared footer. The h1 is the route-change focus target (a11y).
 */
export default function NotFound() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[720px] px-[clamp(18px,5vw,40px)]">
        <PublicHeader withNoCarryOverNote={false} />

        <main className="fm-rise pt-[clamp(48px,9vw,96px)]">
          <p className="mb-4 text-[12.5px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
            Siden findes ikke
          </p>
          <h1
            data-route-focus
            tabIndex={-1}
            className="m-0 font-display text-[clamp(30px,5vw,46px)] font-light leading-[1.08] tracking-[-0.015em] text-foreground focus:outline-none"
          >
            Den side kan vi ikke finde.
          </h1>
          <p className="mt-5 max-w-[34em] text-[17px] leading-[1.6] text-[color:var(--ink-soft)]">
            Linket kan være skrevet forkert, eller siden er flyttet. Dine gemte tal er ikke berørt.
          </p>
          <Button asChild size="lg" className="mt-8 h-12 px-7 text-[15px] [&_svg]:size-[18px]">
            <Link to="/start">
              Til forsiden
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        </main>

        <PublicFooter withDisclaimer={false} className="mb-14 mt-20" />
      </div>
    </div>
  );
}
