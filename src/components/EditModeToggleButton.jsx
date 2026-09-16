import { useAccount } from "../context/AccountContext.jsx";
import { useEditMode } from "../context/EditModeContext.jsx";

/**
 * EditModeToggleButton — bouton flottant, visible uniquement par l'admin,
 * qui active/désactive le mode personnalisation des tableaux dans toute
 * l'app (voir CustomizablePanel).
 */
export default function EditModeToggleButton() {
  const { account } = useAccount();
  const { isEditMode, setIsEditMode } = useEditMode();

  if (account?.role !== "admin") return null;

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
