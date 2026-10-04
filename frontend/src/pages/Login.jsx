import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Grape } from "lucide-react";

export default function Login() {
  const { user, login, error } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (user) navigate("/"); }, [user, navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const ok = await login(email, password);
    setLoading(false);
    if (ok) navigate("/");
  };

  return (
    <div className="min-h-screen grid md:grid-cols-2">
      <div
        className="hidden md:block relative"
        style={{
          backgroundImage:
            "linear-gradient(135deg, rgba(28,25,23,0.65), rgba(107,29,47,0.65)), url(https://images.unsplash.com/photo-1645693091574-1b31ea5ccbc6?crop=entropy&cs=srgb&fm=jpg&q=85)",
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        <div className="absolute bottom-10 left-10 right-10 text-stone-100">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-md flex items-center justify-center" style={{background:'#6B1D2F'}}>
              <Grape className="w-6 h-6" />
            </div>
            <div className="font-serif-display text-3xl">Tenuta Barbon</div>
          </div>
          <h1 className="font-serif-display text-5xl leading-tight mb-3">
            Il tuo magazzino,<br/>in ogni dettaglio.
          </h1>
          <p className="text-stone-200 text-base max-w-md leading-relaxed">
            Materie prime, prodotti finiti, imbottigliamento e cronologia dei movimenti —
            tutto in un unico sistema pensato per la cantina.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center p-8 bg-stone-50">
        <form onSubmit={onSubmit} className="w-full max-w-md space-y-6" data-testid="login-form">
          <div>
            <div className="font-serif-display text-3xl text-stone-900 mb-1">Accesso Operatore</div>
            <div className="text-sm text-stone-500">Inserisci le tue credenziali per continuare.</div>
          </div>

          <div className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-stone-700">Email</Label>
              <Input
                id="email" type="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                data-testid="login-email-input"
                className="h-11 mt-1.5"
                placeholder="nome@tenutabarbon.it"
              />
            </div>
            <div>
              <Label htmlFor="password" className="text-stone-700">Password</Label>
              <Input
                id="password" type="password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                data-testid="login-password-input"
                className="h-11 mt-1.5"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div
              data-testid="login-error"
              className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2"
            >{error}</div>
          )}

          <Button
            type="submit" disabled={loading}
            data-testid="login-submit-button"
            className="w-full h-11 btn-wine"
          >
            {loading ? "Accesso in corso…" : "Accedi"}
          </Button>

          <div className="text-xs text-stone-500 border-t border-stone-200 pt-4">
            Prima volta?  Credenziali admin fornite via mail. Gli operatori possono essere creati dall&apos;amministratore nella sezione Operatori.
          </div>
        </form>
      </div>
    </div>
  );
}
