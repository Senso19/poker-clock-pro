import { createContext, useContext, useEffect, useState } from "react";
import {
  fetchSessionAccount,
  fetchAccountByAuthUserId,
  surChangementDeSession,
  logout as logoutFn,
} from "../lib/auth.js";

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

  // Une session perdue doit se VOIR. Le jeton expire toutes les heures et se
  // renouvelle seul, mais le renouvellement peut échouer : réseau coupé dans
  // la salle, machine en veille une nuit entière sur un tournoi de plusieurs
  // jours. Sans cette écoute, l'écran gardait ses boutons pendant que la base
  // ne voyait plus qu'un visiteur — l'horloge affichait l'heure sans plus
  // rien enregistrer, et les éliminations ne partaient plus.
  // Repasser le compte à null renvoie à l'écran de connexion : une panne
  // franche vaut mieux qu'une soirée perdue en silence.
  useEffect(() => {
    return surChangementDeSession(async (authUserId) => {
      if (!authUserId) {
        setAccount(null);
        return;
      }
      setAccount(await fetchAccountByAuthUserId(authUserId));
    });
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
