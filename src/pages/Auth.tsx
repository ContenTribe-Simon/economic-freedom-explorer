import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { PASSWORD_MIN_LENGTH, PASSWORD_RULE_TEXT, passwordProblem } from "@/lib/cloud/passwordPolicy";
import { SIGNUP_SENT_MESSAGE, authErrorMessage, signupRedirectTo } from "@/lib/cloud/authFlow";

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
    if (!supabase) return; // forms are disabled in unconfigured environments, belt and braces
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error(authErrorMessage(error));
    else toast.success("Logget ind");
  };

  const onSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const problem = passwordProblem(password);
    if (problem) {
      toast.error(problem);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: signupRedirectTo(window.location.origin, window.location.hostname) },
    });
    setBusy(false);
    if (error) toast.error(authErrorMessage(error));
    else toast.success(SIGNUP_SENT_MESSAGE);
  };

  // "Fik du ikke mailen?": resends the confirmation for an unconfirmed signup. Same neutral answer
  // either way, so it reveals nothing about whether the email has an account.
  const onResend = async () => {
    if (!supabase || !email) {
      toast.error("Skriv din e-mail først.");
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: signupRedirectTo(window.location.origin, window.location.hostname) },
    });
    setBusy(false);
    if (error && /rate|too many/i.test(error.message)) toast.error(authErrorMessage(error));
    else toast.success(SIGNUP_SENT_MESSAGE);
  };

  return (
    <div className="max-w-md mx-auto mt-12 space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Log ind</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Du kan også bruge appen uden login. Så gemmes alt lokalt i browseren.
        </p>
      </div>
      {!isSupabaseConfigured && (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          Cloud-login er ikke sat op i dette miljø. Appen virker fuldt ud alligevel, alt gemmes
          lokalt i browseren.
        </p>
      )}
      <Tabs defaultValue="login">
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="login">Log ind</TabsTrigger>
          <TabsTrigger value="signup">Opret konto</TabsTrigger>
        </TabsList>
        <TabsContent value="login">
          <form onSubmit={onLogin} className="space-y-3">
            <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div><Label>Adgangskode</Label><Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
            <Button disabled={busy || !isSupabaseConfigured} className="w-full">Log ind</Button>
          </form>
        </TabsContent>
        <TabsContent value="signup">
          <form onSubmit={onSignup} className="space-y-3">
            <div><Label>Email</Label><Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div>
              <Label htmlFor="signup-password">Adgangskode</Label>
              <Input id="signup-password" type="password" required minLength={PASSWORD_MIN_LENGTH} aria-describedby="signup-password-rule" value={password} onChange={(e) => setPassword(e.target.value)} />
              <p id="signup-password-rule" className="mt-1 text-xs text-muted-foreground">{PASSWORD_RULE_TEXT}</p>
            </div>
            <Button disabled={busy || !isSupabaseConfigured} className="w-full">Opret konto</Button>
            <button type="button" onClick={onResend} disabled={busy || !isSupabaseConfigured} className="w-full text-center text-xs text-muted-foreground hover:underline">
              Fik du ikke mailen? Send den igen
            </button>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
