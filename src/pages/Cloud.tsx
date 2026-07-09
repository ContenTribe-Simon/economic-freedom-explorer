import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  CloudModelRow,
  cloudErrorMessage,
  deleteModel,
  listModels,
  loadModel,
  overwriteModel,
  renameModel,
  saveAsNewModel,
} from "@/lib/cloud/models";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Cloud, FilePlus2, FolderOpen, Pencil, Save, Trash2 } from "lucide-react";

export default function CloudPage() {
  const { user, loading, signOut } = useAuth();
  const navigate = useNavigate();
  const [models, setModels] = useState<CloudModelRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [newName, setNewName] = useState("");
  const [pendingLoad, setPendingLoad] = useState<CloudModelRow | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CloudModelRow | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  useEffect(() => {
    if (!loading && !user) navigate("/auth", { replace: true });
  }, [loading, user, navigate]);

  const refresh = async () => {
    setRefreshing(true);
    try { setModels(await listModels()); }
    catch (e) { toast.error(cloudErrorMessage(e, "Kunne ikke hente modeller")); }
    finally { setRefreshing(false); }
  };

  useEffect(() => { if (user) refresh(); }, [user]);

  if (loading) return <p className="text-sm text-muted-foreground">Indlæser…</p>;
  if (!user) return null;

  const handleSaveAsNew = async () => {
    const name = newName.trim() || `Model ${new Date().toLocaleString("da-DK")}`;
    try { await saveAsNewModel(name); toast.success("Gemt i cloud"); setNewName(""); refresh(); }
    catch (e) { toast.error(cloudErrorMessage(e, "Kunne ikke gemme")); }
  };

  const handleOverwrite = async (m: CloudModelRow) => {
    // m.updated_at is the optimistic-concurrency token: overwrite only wins if no other
    // session wrote the model since this list was fetched (see overwriteModel).
    try { await overwriteModel(m.id, m.updated_at); toast.success(`Opdateret: ${m.name}`); refresh(); }
    catch (e) { toast.error(cloudErrorMessage(e, "Kunne ikke opdatere")); }
  };

  const handleLoad = async (m: CloudModelRow) => {
    try { await loadModel(m.id); toast.success(`Indlæst: ${m.name}`); refresh(); }
    catch (e) { toast.error(cloudErrorMessage(e, "Kunne ikke indlæse")); }
  };

  const handleDelete = async (m: CloudModelRow) => {
    try { await deleteModel(m.id); toast.success("Slettet"); refresh(); }
    catch (e) { toast.error(cloudErrorMessage(e, "Kunne ikke slette")); }
  };

  const handleRename = async (id: string) => {
    if (!renameValue.trim()) return;
    try { await renameModel(id, renameValue.trim()); toast.success("Omdøbt"); setRenamingId(null); refresh(); }
    catch (e) { toast.error(cloudErrorMessage(e, "Kunne ikke omdøbe")); }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground"><Cloud className="h-3.5 w-3.5" /> Cloud</div>
          <h1 className="font-display text-3xl font-semibold">Gemte modeller</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Logget ind som <span className="font-medium">{user.email}</span>. Snapshots og scenarier gemmes som del af modellen.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={signOut}>Log ud</Button>
      </div>

      <section className="border rounded-md p-4 space-y-3">
        <h2 className="text-sm font-medium flex items-center gap-2"><FilePlus2 className="h-4 w-4" /> Gem nuværende model som ny</h2>
        <div className="flex gap-2">
          <Input placeholder="Modelnavn (valgfrit)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Button onClick={handleSaveAsNew}>Gem som ny</Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Dine modeller {models.length > 0 && <span className="text-muted-foreground">({models.length})</span>}</h2>
          <Button variant="ghost" size="sm" onClick={refresh} disabled={refreshing}>Opdater</Button>
        </div>
        {models.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ingen gemte modeller endnu.</p>
        ) : (
          <ul className="space-y-2">
            {models.map((m) => (
              <li key={m.id} className="border rounded-md p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  {renamingId === m.id ? (
                    <div className="flex gap-2">
                      <Input value={renameValue} onChange={(e) => setRenameValue(e.target.value)} autoFocus />
                      <Button size="sm" onClick={() => handleRename(m.id)}>Gem</Button>
                      <Button size="sm" variant="ghost" onClick={() => setRenamingId(null)}>Annullér</Button>
                    </div>
                  ) : (
                    <>
                      <div className="font-medium truncate">{m.name}</div>
                      <div className="text-xs text-muted-foreground">
                        Sidst gemt {new Date(m.updated_at).toLocaleString("da-DK")}
                        {m.last_opened_at && ` · sidst åbnet ${new Date(m.last_opened_at).toLocaleString("da-DK")}`}
                      </div>
                    </>
                  )}
                </div>
                {renamingId !== m.id && (
                  <div className="flex gap-1 shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => setPendingLoad(m)}><FolderOpen className="h-4 w-4 mr-1" />Indlæs</Button>
                    {/* Disabled while the list refreshes: the row's updated_at is the
                        concurrency token, and clicking mid-refresh would send a stale one
                        (a false conflict at worst, but avoidable). */}
                    <Button size="sm" variant="ghost" disabled={refreshing} onClick={() => handleOverwrite(m)}><Save className="h-4 w-4 mr-1" />Overskriv</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setRenamingId(m.id); setRenameValue(m.name); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => setPendingDelete(m)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <AlertDialog open={pendingLoad !== null} onOpenChange={(o) => !o && setPendingLoad(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Indlæs model?</AlertDialogTitle>
            <AlertDialogDescription>
              Dette erstatter dine nuværende lokale scenarier, antagelser og snapshots med "{pendingLoad?.name}".
              Hvis du har ændringer du vil beholde, så gem dem først som ny cloud-model eller eksportér til JSON.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annullér</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingLoad) handleLoad(pendingLoad); setPendingLoad(null); }}>Indlæs</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slet model?</AlertDialogTitle>
            <AlertDialogDescription>"{pendingDelete?.name}" slettes permanent fra cloud.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annullér</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (pendingDelete) handleDelete(pendingDelete); setPendingDelete(null); }}>Slet</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
