import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { api, formatApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Grape, Briefcase, Hammer, User } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { user, login, error } = useAuth();
  const navigate = useNavigate();
  const [operators, setOperators] = useState([]);
  const [loading, setLoading] = useState(null);

  useEffect(() => { if (user) navigate("/"); }, [user, navigate]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/auth/operators-list");
        setOperators(data);
      } catch (e) { toast.error(formatApiError(e)); }
    })();
  }, []);

  const choose = async (op) => {
    setLoading(op.id);
    const ok = await login(op.id);
    setLoading(null);
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
            Scegli il tuo nome per iniziare. Ogni operazione sul magazzino verrà registrata a tuo nome.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center p-8 bg-stone-50">
        <div className="w-full max-w-md space-y-6" data-testid="login-form">
          <div>
            <div className="font-serif-display text-3xl text-stone-900 mb-1">Chi sei?</div>
            <div className="text-sm text-stone-500">Seleziona il tuo nome per accedere.</div>
          </div>

          <div className="space-y-3">
            {operators.length === 0 && (
              <div className="text-sm text-stone-500 py-10 text-center border border-dashed border-stone-300 rounded-md">
                Nessun operatore configurato.
              </div>
            )}
            {operators.map((op) => {
              const isAdmin = op.role === "admin";
              return (
                <button
                  key={op.id}
                  onClick={() => choose(op)}
                  disabled={loading !== null}
                  data-testid={`login-operator-${op.id}`}
                  className={`w-full flex items-center gap-4 px-4 py-4 rounded-lg border transition-all text-left ${
                    isAdmin
                      ? "border-[#6B1D2F]/30 bg-white hover:bg-[#6B1D2F]/5 hover:border-[#6B1D2F]"
                      : "border-stone-200 bg-white hover:bg-stone-100 hover:border-stone-400"
                  } ${loading === op.id ? "opacity-60" : ""}`}
                >
                  <div className={`w-11 h-11 rounded-md flex items-center justify-center ${
                    isAdmin ? "bg-[#6B1D2F] text-white" : "bg-stone-800 text-white"
                  }`}>
                    {isAdmin ? <Briefcase className="w-5 h-5" /> : <Hammer className="w-5 h-5" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-stone-900">{op.name}</div>
                    <div className="text-xs text-stone-500">
                      {isAdmin ? "Ufficio — può modificare e annullare" : "Operatore — registra operazioni"}
                    </div>
                  </div>
                  {loading === op.id && <span className="text-xs text-stone-500">Accesso…</span>}
                </button>
              );
            })}
          </div>

          {error && (
            <div data-testid="login-error" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="text-xs text-stone-500 border-t border-stone-200 pt-4">
            Nuovo operatore? L&apos;Ufficio può aggiungerlo dalla sezione Operatori dopo l&apos;accesso.
          </div>
        </div>
      </div>
    </div>
  );
}
