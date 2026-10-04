import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import {
  LayoutDashboard, Package2, Wine, FileText, History,
  Users, LogOut, Grape
} from "lucide-react";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, tid: "nav-dashboard" },
  { to: "/materie-prime", label: "Materie Prime", icon: Package2, tid: "nav-materie" },
  { to: "/prodotti-finiti", label: "Prodotti Finiti", icon: Wine, tid: "nav-finiti" },
  { to: "/imbottigliamento", label: "Imbottigliamento", icon: FileText, tid: "nav-imbottigliamento" },
  { to: "/cronologia", label: "Cronologia", icon: History, tid: "nav-cronologia" },
  { to: "/operatori", label: "Operatori", icon: Users, tid: "nav-operatori" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const doLogout = async () => { await logout(); navigate("/login"); };

  return (
    <div className="flex min-h-screen">
      <aside className="w-64 bg-stone-900 text-stone-100 flex flex-col sticky top-0 h-screen">
        <div className="px-5 py-6 border-b border-stone-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{background:'#6B1D2F'}}>
              <Grape className="w-5 h-5 text-stone-100" />
            </div>
            <div>
              <div className="font-serif-display text-xl leading-tight">Tenuta Barbon</div>
              <div className="text-[10px] uppercase tracking-widest text-stone-400">Gestione Magazzino</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              data-testid={n.tid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
                  isActive ? "nav-active font-semibold" : "text-stone-300 hover:bg-stone-800 hover:text-white"
                }`
              }
            >
              <n.icon className="w-4 h-4" />
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3 border-t border-stone-800">
          <div className="px-2 py-2 mb-2">
            <div className="text-xs text-stone-400 uppercase tracking-wider">Operatore</div>
            <div className="text-sm font-medium truncate" data-testid="current-operator-name">
              {user?.name || user?.email}
            </div>
            <div className="text-[10px] text-stone-500">{user?.role === "admin" ? "Amministratore" : "Operatore"}</div>
          </div>
          <Button
            onClick={doLogout}
            variant="ghost"
            data-testid="logout-button"
            className="w-full justify-start text-stone-300 hover:text-white hover:bg-stone-800"
          >
            <LogOut className="w-4 h-4 mr-2" /> Esci
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
