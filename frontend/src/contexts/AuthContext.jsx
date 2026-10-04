import { createContext, useContext, useEffect, useState } from "react";
import { api, formatApiError } from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // null=loading, false=anon, obj=auth
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const token = localStorage.getItem("tb_token");
      if (!token) { setUser(false); return; }
      try {
        const { data } = await api.get("/auth/me");
        setUser(data);
      } catch {
        localStorage.removeItem("tb_token");
        setUser(false);
      }
    })();
  }, []);

  const login = async (email, password) => {
    setError("");
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem("tb_token", data.token);
      setUser(data.user);
      return true;
    } catch (e) {
      setError(formatApiError(e));
      return false;
    }
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch (_e) { /* ignore */ }
    localStorage.removeItem("tb_token");
    setUser(false);
  };

  return (
    <AuthContext.Provider value={{ user, setUser, login, logout, error }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
