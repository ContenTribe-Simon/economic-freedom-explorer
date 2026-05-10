import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function AuthPage() {
  const navigate = useNavigate();
  const { session } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) navigate("/cloud", { replace: true });
  }, [session, navigate]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Logget ind");
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/cloud` },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Tjek din mail for at bekræfte din konto");
  };

  return (
    <div className="max-w-md mx-auto mt-12 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Log ind</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Du kan også bruge appen uden login — alt gemmes lokalt i browseren.
        </p>
      </div>
      <Tabs defaultValue="login">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="login">Log ind</TabsTrigger>
          <TabsTrigger value="signup">Opret konto</TabsTrigger>
        </TabsList>
        <TabsContent value="login">
          <form onSubmit={onLogin} className="space-y-3">
            <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>Adgangskode</Label><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button disabled={busy} className="w-full">Log ind</Button>
          </form>
        </TabsContent>
        <TabsContent value="signup">
          <form onSubmit={onSignup} className="space-y-3">
            <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>Adgangskode (min. 6 tegn)</Label><Input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button disabled={busy} className="w-full">Opret konto</Button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
