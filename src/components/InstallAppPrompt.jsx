import { useEffect, useState } from "react";
import { getDeferredPrompt, onPromptAvailable, isIos } from "../lib/installPrompt.js";

/**
 * InstallAppPrompt — proposition d'ajouter l'app à l'écran d'accueil,
 * affichée juste après la création d'un compte. Sur Chrome/Android, un
 * simple bouton déclenche l'invite native. Sur iOS Safari (qui n'expose
 * aucune API pour ça), on affiche la marche à suivre manuelle.
 */
export default function InstallAppPrompt({ onClose }) {
  const [prompt, setPrompt] = useState(() => getDeferredPrompt());
  const ios = isIos();

  useEffect(() => {
    return onPromptAvailable(() => setPrompt(getDeferredPrompt()));
  }, []);

  async function handleInstall() {
    if (!prompt) return;
    prompt.prompt();
    await prompt.userChoice;
    onClose();
  }

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm p-6 font-body text-felt-cream text-center">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-felt-bg border border-felt-gold/40 flex items-center justify-center text-felt-gold text-3xl mb-4">
          ♠
        </div>
        <div className="font-display text-lg mb-2">Installer PokerClock Pro</div>

        {prompt ? (
          <>
            <p className="text-sm text-felt-cream/60 mb-5">
              Ajoutez l'application à votre écran d'accueil pour l'ouvrir en un tap, comme une vraie app.
            </p>
            <button onClick={handleInstall} className="w-full px-4 py-2.5 bg-felt-gold text-felt-bg rounded-md font-display mb-2">
              Installer
            </button>
            <button onClick={onClose} className="w-full px-4 py-2 text-felt-cream/50 hover:text-felt-cream text-sm">
              Plus tard
            </button>
          </>
        ) : ios ? (
          <>
            <p className="text-sm text-felt-cream/60 mb-4">
              Pour l'ajouter à votre écran d'accueil : appuyez sur <span className="text-felt-gold">⎋ Partager</span> en
              bas de Safari, puis sur <span className="text-felt-gold">« Sur l'écran d'accueil »</span>.
            </p>
            <button onClick={onClose} className="w-full px-4 py-2.5 bg-felt-gold text-felt-bg rounded-md font-display">
              Compris
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-felt-cream/60 mb-4">
              Depuis le menu de votre navigateur, cherchez « Ajouter à l'écran d'accueil » ou « Installer
              l'application ».
            </p>
            <button onClick={onClose} className="w-full px-4 py-2.5 bg-felt-gold text-felt-bg rounded-md font-display">
              Compris
            </button>
          </>
        )}
      </div>
    </div>
  );
}
