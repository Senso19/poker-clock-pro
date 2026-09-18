import { useState } from "react";
import { playerLabel } from "../lib/players.js";

/**
 * EliminationPicker — « éliminé par qui ? » avant de confirmer une sortie.
 *
 * Facultatif, mais loin d'être décoratif : ce champ alimente le compte des
 * KO, qui entre dans les points du championnat. Une élimination saisie
 * sans lui coûte un KO au joueur qui l'a réalisé.
 *
 * Extrait ici parce que trois écrans en ont besoin (Joueurs, Élimination,
 * Tables) et que les deux premiers en avaient déjà chacun leur copie.
 */
export default function EliminationPicker({ candidates, onConfirm, onCancel, confirmLabel = "Confirmer l'élimination" }) {
  const [selected, setSelected] = useState("");
  return (
    <div className="mt-1 mb-2 flex flex-wrap items-center gap-2 bg-felt-bg border border-felt-alert/30 rounded-md px-3 py-2">
      <span className="text-xs text-felt-cream/60">Éliminé par (optionnel, pour le KO) :</span>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="bg-felt-panel border border-felt-cream/10 rounded px-2 py-1 text-sm text-felt-cream"
      >
        <option value="">Aucun</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {playerLabel(c) || c.players?.full_name}
          </option>
        ))}
      </select>
      <button
        onClick={() => onConfirm(selected || null)}
        className="text-xs px-3 py-1.5 bg-felt-alert/80 text-felt-cream rounded font-display"
      >
        {confirmLabel}
      </button>
      <button onClick={onCancel} className="text-xs px-3 py-1.5 text-felt-cream/50 hover:text-felt-cream">
        Annuler
      </button>
    </div>
  );
}
