import React, { Suspense, lazy, useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import PublicRegistrationForm from "./components/PublicRegistrationForm.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { AccountProvider, useAccount } from "./context/AccountContext.jsx";
import { EditModeProvider } from "./context/EditModeContext.jsx";
import { ConfirmProvider } from "./context/ConfirmContext.jsx";
import ClubLoader from "./components/ClubLoader.jsx";
import "./lib/installPrompt.js";
import "./index.css";

// Chargé à la demande uniquement (contient EditableClock, gros module) —
// ne doit jamais alourdir le bundle principal chargé par tout le monde,
// y compris sur l'écran de connexion.
const PublicTournamentPage = lazy(() => import("./components/PublicTournamentPage.jsx"));

// Route publique (sans connexion) pour le formulaire d'inscription
// Festival/Open : /inscription/<slug-du-registre>. Contourne entièrement
// l'écran de connexion.
const publicFormMatch = window.location.pathname.match(/^\/inscription\/([^/]+)\/?$/);

// Route publique (sans connexion) pour consulter un tournoi en lecture
// seule : /public/<id-du-tournoi>. N'affiche quelque chose que si l'admin
// a explicitement activé "Accès public" pour ce tournoi précis.
const publicTournamentMatch = window.location.pathname.match(/^\/public\/([^/]+)\/?$/);

function Root() {
  const { account, loading } = useAccount();
  const [showLogin, setShowLogin] = useState(false);

  useEffect(() => {
    if (account) setShowLogin(false);
  }, [account]);

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-felt-bg">
        <ClubLoader />
      </div>
    );
  }

  return (
    <>
      {/*
        La `key` remonte toute l'application quand on change d'identité —
        connexion, déconnexion, rien d'autre.

        Sans elle, se connecter depuis la fenêtre de connexion laissait les
        écrans déjà montés en l'état : ils avaient chargé leurs données en
        tant que VISITEUR et ne se relançaient jamais (leurs effets n'ont
        aucune dépendance). L'onglet Tournois restait vide jusqu'à ce qu'on
        en change et qu'on revienne, ce qui les démontait enfin. Même cause
        pour le championnat, l'écran d'élimination, et pour l'onglet d'accueil
        d'un chef de table, calculé une seule fois à partir du rôle.

        Au rechargement de la page le problème ne se posait pas : `loading`
        ci-dessus attend déjà que le compte soit connu.
      */}
      <App key={account?.id ?? "visiteur"} onRequestLogin={() => setShowLogin(true)} />
      {showLogin && !account && (
        <div className="fixed inset-0 z-[100] bg-felt-bg sm:bg-black/70 sm:flex sm:items-center sm:justify-center">
          <div className="relative h-full sm:h-auto sm:max-h-[90vh] sm:overflow-y-auto sm:rounded-lg sm:max-w-sm sm:w-full">
            <button
              onClick={() => setShowLogin(false)}
              className="absolute top-3 right-3 z-10 text-felt-cream/50 hover:text-felt-cream text-xl"
              aria-label="Fermer"
            >
              ✕
            </button>
            <AuthScreen />
          </div>
        </div>
      )}
    </>
  );
}

const loadingScreen = (
  <div className="h-screen w-screen flex items-center justify-center bg-felt-bg">
    <ClubLoader />
  </div>
);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {publicFormMatch ? (
      <PublicRegistrationForm slug={publicFormMatch[1]} />
    ) : publicTournamentMatch ? (
      <ThemeProvider>
        <Suspense fallback={loadingScreen}>
          <PublicTournamentPage tournamentId={publicTournamentMatch[1]} />
        </Suspense>
      </ThemeProvider>
    ) : (
      <AccountProvider>
        <ThemeProvider>
          <EditModeProvider>
            <ConfirmProvider>
              <Root />
            </ConfirmProvider>
          </EditModeProvider>
        </ThemeProvider>
      </AccountProvider>
    )}
  </React.StrictMode>
);

// Service worker minimal, requis par Chrome/Android pour proposer
// l'installation de l'app sur l'écran d'accueil.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
