import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PublicHeader } from "@/components/public/PublicHeader";
import { PublicFooter } from "@/components/public/PublicFooter";
import { LEGAL_ENTITY } from "@/lib/legalEntity";
import { clearLocalAppData } from "@/lib/localData";
import "./start.css";

/**
 * Privacy page (Phase 12 C/D, PR 3). Every statement here describes what the code actually does
 * (spec: docs/superpowers/specs/2026-10-10-phase12-cd-privacy-golive-design.md §4 PR 3), so a code
 * change that alters data handling must update this page in the same PR. PR 4 adds the analytics
 * section, PR 5 the self-service account deletion. Drafted from code, reviewed by Simon; not legal
 * advice.
 */

export const PRIVACY_UPDATED = "11. oktober 2026";

/** Session-only flag so the confirmation survives the reload that resets the in-memory stores. */
const WIPED_FLAG = "frihedsmodel-wiped";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="m-0 font-display text-[22px] font-normal tracking-[-0.01em] text-foreground">{title}</h2>
      <div className="mt-2.5 grid gap-3 text-[15px] leading-[1.65] text-[color:var(--ink-soft)] [&_strong]:font-semibold [&_strong]:text-foreground">
        {children}
      </div>
    </section>
  );
}

export default function Privatliv() {
  const [wiped, setWiped] = useState(false);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(WIPED_FLAG)) {
        sessionStorage.removeItem(WIPED_FLAG);
        setWiped(true);
      }
    } catch {
      // sessionStorage unavailable: the confirmation is simply not shown.
    }
  }, []);

  const onWipe = () => {
    clearLocalAppData();
    try {
      sessionStorage.setItem(WIPED_FLAG, "1");
    } catch {
      // ignore
    }
    // A full reload resets every in-memory store to its defaults; nothing old is written back.
    window.location.assign("/privatliv");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[720px] px-[clamp(18px,5vw,40px)]">
        <PublicHeader
          withNoCarryOverNote={false}
          action={
            <Button asChild variant="ghost" size="sm">
              <Link to="/start">
                <ArrowLeft aria-hidden="true" />
                Til forsiden
              </Link>
            </Button>
          }
        />

        <main className="fm-rise pt-[clamp(34px,6vw,58px)]">
          <p className="mb-4 text-[12.5px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-soft)]">
            Privatliv
          </p>
          <h1
            data-route-focus
            tabIndex={-1}
            className="m-0 font-display text-[clamp(30px,5vw,46px)] font-light leading-[1.08] tracking-[-0.015em] text-foreground focus:outline-none"
          >
            Sådan behandler vi dine oplysninger
          </h1>
          <p className="mt-4 text-[13.5px] text-[color:var(--ink-soft)]">Senest opdateret {PRIVACY_UPDATED}.</p>

          {wiped && (
            <p role="status" className="mt-6 rounded-[12px] border border-border bg-card px-4 py-3 text-[14.5px] text-foreground">
              Dine data i denne browser er slettet.
            </p>
          )}

          <Section title="Kort fortalt">
            <ul className="m-0 grid list-disc gap-1.5 pl-5">
              <li>De tal, du taster ind, bliver i din egen browser. Vi modtager dem ikke.</li>
              <li>Vi bruger ingen cookies og intet analyseværktøj.</li>
              <li>Hvis du opretter en konto i den avancerede model, gemmer vi din e-mail og dine modeller i EU.</li>
              <li>Du kan altid slette dine data. Knappen står nederst på siden.</li>
            </ul>
          </Section>

          <Section title="Hvem står bag">
            <p className="m-0">
              Frihedsmodel drives af <strong>{LEGAL_ENTITY.name}</strong>, CVR {LEGAL_ENTITY.cvr}, som er
              dataansvarlig. Har du spørgsmål om dine oplysninger, så skriv til{" "}
              <a className="font-semibold text-[color:var(--fjord)] hover:underline" href={`mailto:${LEGAL_ENTITY.email}`}>
                {LEGAL_ENTITY.email}
              </a>
              .
            </p>
          </Section>

          <Section title="Det gemmes i din browser">
            <p className="m-0">
              Dine tal, dine gemte beregninger og dine indstillinger i den avancerede model gemmes i din browsers
              lokale lager på din egen enhed. De bliver ikke sendt til os. De ligger der, indtil du sletter dem, for
              eksempel med knappen nederst på siden.
            </p>
            <p className="m-0">
              Siden henter ingen skrifttyper, scripts eller sporing fra andre tjenester.
            </p>
          </Section>

          <Section title="Delelinks">
            <p className="m-0">
              Når du deler din beregning, ligger dine tal i selve linket. Delen med tallene sendes ikke til vores
              server, når linket åbnes, så vi ser dem ikke. Den, du sender linket til, kan se tallene, og linket kan
              ligge i den besked eller mail, du sender det med.
            </p>
          </Section>

          <Section title="Konto i den avancerede model">
            <p className="m-0">
              Det er frivilligt at oprette en konto, og det er kun muligt i den avancerede model. Har du en konto,
              gemmer vi <strong>din e-mail</strong> og <strong>de modeller, du vælger at gemme</strong>, så du kan
              hente dem på andre enheder. Grundlaget er aftalen om at levere kontoen til dig.
            </p>
            <p className="m-0">
              Data gemmes hos vores leverandør af database og login, som kører på servere i Stockholm i Sverige,
              altså i EU. Oplysningerne ligger der, indtil du sletter dem. Du kan slette dine modeller på
              cloud-siden. Vil du have hele kontoen slettet, så skriv til os, så sletter vi den inden for 30 dage.
            </p>
          </Section>

          <Section title="Hosting og tekniske logs">
            <p className="m-0">
              Siden hostes af Lovable. Som på de fleste websteder registrerer hostingen tekniske oplysninger, når du
              besøger siden, for eksempel IP-adresse, browsertype og tidspunkt. Det sker for at drive og beskytte
              siden, og grundlaget er vores legitime interesse i en sikker og stabil tjeneste. Lovable behandler
              oplysningerne på vores vegne.
            </p>
          </Section>

          <Section title="Dine rettigheder">
            <p className="m-0">
              Du har ret til at få indsigt i de oplysninger, vi har om dig, og til at få dem rettet, slettet eller
              udleveret. Du kan også gøre indsigelse eller bede os begrænse behandlingen. Skriv til{" "}
              {LEGAL_ENTITY.email}, så svarer vi inden for 30 dage. Vi træffer ingen automatiske afgørelser om dig.
            </p>
            <p className="m-0">
              Er du utilfreds med, hvordan vi behandler dine oplysninger, kan du klage til Datatilsynet på{" "}
              <a
                className="font-semibold text-[color:var(--fjord)] hover:underline"
                href="https://www.datatilsynet.dk"
                target="_blank"
                rel="noopener noreferrer"
              >
                datatilsynet.dk
              </a>
              .
            </p>
          </Section>

          <Section title="Slet dine data i denne browser">
            <p className="m-0">
              Knappen sletter dine tal, dine gemte beregninger og den avancerede model i denne browser. En eventuel
              konto i den avancerede model bliver ikke slettet. Den sletter du på cloud-siden eller ved at skrive til
              os.
            </p>
            <div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="[&_svg]:size-[17px]">
                    <Trash2 aria-hidden="true" />
                    Slet alle mine data i denne browser
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Slet dine data i denne browser?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Dine tal, gemte beregninger og den avancerede model forsvinder fra denne browser. Det kan ikke
                      fortrydes.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Behold dem</AlertDialogCancel>
                    <AlertDialogAction onClick={onWipe}>Slet</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </Section>
        </main>

        <PublicFooter withDisclaimer={false} className="mb-14 mt-14" />
      </div>
    </div>
  );
}
