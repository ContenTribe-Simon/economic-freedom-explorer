import { useState } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { deleteAccount } from "@/lib/cloud/deleteAccount";

/**
 * "Slet min konto" (Phase 12 C/D, PR 5). The user confirms by typing their own email, so a stray
 * click cannot delete an account. The dialog stays open while the request runs and shows a plain
 * Danish error if it fails; `onDeleted` runs only after the server confirmed the deletion.
 */
export function DeleteAccountSection({ email, onDeleted }: { email: string; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim().toLowerCase() === email.trim().toLowerCase();

  const onConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      setOpen(false);
      onDeleted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kontoen kunne ikke slettes.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-destructive/40 p-5 space-y-3">
      <h2 className="text-sm font-medium">Slet konto</h2>
      <p className="text-sm text-muted-foreground">
        Sletter din konto, din e-mail og alle dine gemte modeller i cloud med det samme. Data i denne browser bliver
        ikke rørt.
      </p>
      <Button variant="outline" className="text-destructive" onClick={() => { setTyped(""); setError(null); setOpen(true); }}>
        <Trash2 className="h-4 w-4" /> Slet min konto
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet din konto?</AlertDialogTitle>
            <AlertDialogDescription>
              Din konto og alle dine gemte modeller slettes permanent. Det kan ikke fortrydes. Skriv din e-mail for at
              bekræfte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-email">Din e-mail</Label>
            <Input id="confirm-email" type="email" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={email} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Behold kontoen</AlertDialogCancel>
            <Button variant="destructive" disabled={!matches || busy} onClick={onConfirm}>
              {busy ? "Sletter..." : "Slet kontoen"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
