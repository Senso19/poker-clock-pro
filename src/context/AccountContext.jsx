import { createContext, useContext, useEffect, useState } from "react";
import { fetchSessionAccount, logout as logoutFn } from "../lib/auth.js";

const AccountContext = createContext({
  account: null,
  loading: true,
  refresh: () => {},
  logout: () => {},
});

export function AccountProvider({ children }) {
  const [account, setAccount] = useState(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    try {
      // Filet de sécurité : si la requête réseau reste bloquée (coupure,
      // connexion lente, souci ponctuel côté serveur), on n'attend pas
      // indéfiniment — on bascule sur l'écran de connexion après 10s au
      // lieu de rester coincé sur "Chargement…" pour toujours.
      const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 10000));
      const acc = await Promise.race([fetchSessionAccount(), timeout]);
      setAccount(acc);
    } catch {
      setAccount(null);
    }
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function logout() {
    await logoutFn();
    setAccount(null);
  }

  return (
    <AccountContext.Provider value={{ account, loading, refresh, logout }}>
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  return useContext(AccountContext);
}
