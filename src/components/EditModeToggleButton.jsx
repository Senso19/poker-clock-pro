import { useAccount } from "../context/AccountContext.jsx";
import { useEditMode } from "../context/EditModeContext.jsx";
import { roleEffectif, canManageClubSettings } from "../lib/auth.js";

/**
 * EditModeToggleButton — bouton flottant qui active le mode
 * personnalisation des tableaux dans toute l'application (voir
 * CustomizablePanel).
 *
 * Réservé à qui peut modifier les paramètres du club : personnaliser
 * l'affichage engage tout le club, pas seulement celui qui règle. Le rôle
 * était écrit en dur, donc invisible dans la matrice des droits.
 */
export default function EditModeToggleButton() {
  const { account } = useAccount();
  const { isEditMode, setIsEditMode } = useEditMode();

  if (!canManageClubSettings(roleEffectif(account))) return null;

  return (
    <button
      onClick={() => setIsEditMode((v) => !v)}
      title={isEditMode ? "Quitter le mode personnalisation" : "Personnaliser l'affichage des tableaux"}
      className={`fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full flex items-center justify-center shadow-lg text-xl font-display ${
        isEditMode ? "bg-felt-alert text-felt-cream" : "bg-felt-gold text-felt-bg"
      }`}
    >
      {isEditMode ? "✕" : "🎨"}
    </button>
  );
}
