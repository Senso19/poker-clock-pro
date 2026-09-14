import FormWizard from "./FormWizard.jsx";

/**
 * FormTemplatePreviewModal — aperçu d'un modèle de formulaire depuis
 * "Gérer les modèles". Utilise le même moteur (FormWizard) que le vrai
 * formulaire public, mais aucune soumission n'est réellement envoyée.
 */
export default function FormTemplatePreviewModal({ template, onClose }) {
  async function fakeSubmit() {
    // Aperçu uniquement : on simule juste un court délai avant l'écran de succès.
    await new Promise((r) => setTimeout(r, 300));
  }

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md max-h-[90vh] rounded-2xl overflow-hidden relative shadow-2xl">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
        >
          ✕
        </button>
        <div className="absolute top-3 left-3 z-10 text-[11px] px-2.5 py-1 rounded-full bg-black/50 text-white font-display">
          Aperçu — {template.name}
        </div>
        <div className="max-h-[90vh] overflow-y-auto">
          <FormWizard pages={template.pages || []} theme={template.theme} isOpen onSubmit={fakeSubmit} />
        </div>
      </div>
    </div>
  );
}
