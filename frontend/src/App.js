import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";

import Login from "@/pages/Login";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import MateriePrime from "@/pages/MateriePrime";
import ProdottiFiniti from "@/pages/ProdottiFiniti";
import Imbottigliamento from "@/pages/Imbottigliamento";
import Cronologia from "@/pages/Cronologia";
import Operatori from "@/pages/Operatori";

function Protected({ children }) {
  const { user } = useAuth();
  if (user === null) {
    return (
      <div className="min-h-screen flex items-center justify-center text-stone-500">
        Caricamento…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <div className="App bg-grain min-h-screen">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Protected><Layout /></Protected>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/materie-prime" element={<MateriePrime />} />
              <Route path="/prodotti-finiti" element={<ProdottiFiniti />} />
              <Route path="/imbottigliamento" element={<Imbottigliamento />} />
              <Route path="/cronologia" element={<Cronologia />} />
              <Route path="/operatori" element={<Operatori />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster position="top-right" richColors />
      </AuthProvider>
    </div>
  );
}

export default App;
