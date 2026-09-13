import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import AuthScreen from "./components/AuthScreen.jsx";
import { ThemeProvider } from "./context/ThemeContext.jsx";
import { AccountProvider, useAccount } from "./context/AccountContext.jsx";
import "./lib/installPrompt.js";
import "./index.css";

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
    <AccountProvider>
      <ThemeProvider>
        <Root />
      </ThemeProvider>
    </AccountProvider>
  </React.StrictMode>
);

// Service worker minimal, requis par Chrome/Android pour proposer
// l'installation de l'app sur l'écran d'accueil.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}
