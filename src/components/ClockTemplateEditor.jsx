import { useState } from "react";
import EditableClock from "./EditableClock.jsx";
import { createClockTemplate, updateClockTemplate } from "../lib/clockTemplates.js";
import { defaultStructure } from "../lib/levels.js";

const PREVIEW_LEVELS = defaultStructure();

/**
 * ClockTemplateEditor — conception d'un modèle de disposition d'horloge,
 * hors de tout tournoi réel (données de démonstration pour l'aperçu).
 * Le bouton "💾 Enregistrer le modèle" (dans la barre d'outils de
 * EditableClock, visible car templateMode=true) déclenche handleSaveLayout.
 */
export default function ClockTemplateEditor({ template, onClose, onSaved }) {
  const [name, setName] = useState(template?.name || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleSaveLayout(panels, images, background) {
    if (!name.trim()) {
      setError("Merci de donner un nom au modèle.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const layout = { ...panels, images, background };
      if (template) await updateClockTemplate(template.id, name.trim(), layout);
      else await createClockTemplate(name.trim(), layout);
      onSaved();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 bg-felt-bg border-b border-felt-cream/10 shrink-0">
        <button onClick={onClose} className="text-sm text-felt-cream/60 hover:text-felt-cream">
          ← Retour
        </button>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nom du modèle"
          className="bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-1.5 text-felt-cream text-sm placeholder:text-felt-cream/40"
        />
        {saving && <span className="text-felt-cream/40 text-xs">Sauvegarde…</span>}
        {error && <span className="text-felt-alert text-xs">{error}</span>}
        <span className="ml-auto text-xs text-felt-cream/40 hidden sm:block">
          Clique sur "✥ Réorganiser l'affichage" pour disposer les panneaux, puis sur "💾 Enregistrer le modèle"
        </span>
      </div>
      <div className="flex-1 relative min-h-0">
        <EditableClock
          levels={PREVIEW_LEVELS}
          canEdit
          initialLayout={template?.layout}
          templateMode
          onSaveLayout={handleSaveLayout}
        />
      </div>
    </div>
  );
}
