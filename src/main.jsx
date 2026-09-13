import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import PublicRegistrationForm from "./components/PublicRegistrationForm.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { AccountProvider, useAccount } from "./context/AccountContext.jsx";
import { EditModeProvider } from "./context/EditModeContext.jsx";
import { ConfirmProvider } from "./context/ConfirmContext.jsx";
import "./lib/installPrompt.js";
import "./index.css";

// Route publique (sans connexion) pour le formulaire d'inscription
// Festival/Open : /inscription/<slug-du-registre>. Contourne entièrement
// l'écran de connexion.
const publicFormMatch = window.location.pathname.match(/^\/inscription\/([^/]+)\/?$/);

function Root() {
  const { account, loading } = useAccount();

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-felt-bg text-felt-cream/50 font-body">
        Chargement…
      </div>
    );
  }
  if (!account) return <AuthScreen />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    {publicFormMatch ? (
      <PublicRegistrationForm slug={publicFormMatch[1]} />
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
