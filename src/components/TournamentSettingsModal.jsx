import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { fetchChampionships, assignTournamentToChampionship } from "../lib/points.js";
import { useAccount } from "../context/AccountContext.jsx";
import { roleEffectif, canManageClubSettings } from "../lib/auth.js";

/**
 * TournamentSettingsModal — "Réglages tournoi" ouvert via l'icône ⚙ à côté
 * du nom du tournoi. Permet de rattacher un championnat, modifier
 * nom/date/heure/lieu, et activer les options Gérer Joueurs / Suivi des
 * knockouts / Gérer les Payouts.
 */
export default function TournamentSettingsModal({ tournament, onClose, onSaved }) {
  const { account } = useAccount();
  // Ouvrir un tournoi aux clubs invités décide qui le verra depuis
  // l'extérieur : c'est un réglage de club, pas de tournoi.
  const peutOuvrirAuxClubs = canManageClubSettings(roleEffectif(account));
  const [championships, setChampionships] = useState([]);
  const [championshipId, setChampionshipId] = useState(tournament.championship_id || "");
  const [stageLabel, setStageLabel] = useState(tournament.stage_label || "");
  const [addingChampionship, setAddingChampionship] = useState(false);
  const [name, setName] = useState(tournament.name || "");
  const [date, setDate] = useState(() => toDateInput(tournament.scheduled_at) || tournament.date || "");
  const [time, setTime] = useState(() => toTimeInput(tournament.scheduled_at) || "");
  const [location, setLocation] = useState(tournament.location || "");
  const [managePlayers, setManagePlayers] = useState(tournament.manage_players !== false);
  const [trackKnockouts, setTrackKnockouts] = useState(!!tournament.track_knockouts);
  const [managePayouts, setManagePayouts] = useState(!!tournament.manage_payouts);
  const [forceFinished, setForceFinished] = useState(!!tournament.force_finished);
  const [isInterclub, setIsInterclub] = useState(!!tournament.is_interclub);
  const [publicView, setPublicView] = useState(!!tournament.public_view);
  const [linkCopied, setLinkCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const publicUrl = `${window.location.origin}/public/${tournament.id}`;

  function copyPublicLink() {
    navigator.clipboard.writeText(publicUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    });
  }

  useEffect(() => {
    fetchChampionships().then(setChampionships).catch(() => {});
  }, []);

  function toDateInput(iso) {
    if (!iso) return "";
    return new Date(iso).toISOString().slice(0, 10);
  }
  function toTimeInput(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  const currentChampionship = championships.find((c) => c.id === championshipId);

  async function handleConfirm() {
    if (!name.trim()) {
      setError("Le nom du tournoi est obligatoire.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let scheduledAt = null;
      if (date) {
        scheduledAt = new Date(`${date}T${time || "00:00"}`).toISOString();
      }
      const { error: updErr } = await supabase
        .from("tournaments")
        .update({
          name: name.trim(),
          date: date || tournament.date,
          scheduled_at: scheduledAt,
          location: location.trim() || null,
          manage_players: managePlayers,
          track_knockouts: trackKnockouts,
          manage_payouts: managePayouts,
          force_finished: forceFinished,
          public_view: publicView,
          ...(peutOuvrirAuxClubs ? { is_interclub: isInterclub } : {}),
        })
        .eq("id", tournament.id);
      if (updErr) throw updErr;

      if (championshipId !== (tournament.championship_id || "")) {
        await assignTournamentToChampionship(tournament.id, championshipId || null, stageLabel.trim() || null);
      } else if (stageLabel !== (tournament.stage_label || "")) {
        await assignTournamentToChampionship(tournament.id, championshipId || null, stageLabel.trim() || null);
      }

      onSaved?.();
      onClose();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm p-6 font-body text-felt-cream max-h-[85vh] overflow-y-auto">
        <div className="font-display text-lg mb-5">Réglages tournoi</div>

        <div className="mb-4">
          <div className="text-xs text-felt-cream/50 mb-1.5">Championnats</div>
          {currentChampionship ? (
            <div className="flex items-center gap-2 bg-felt-bg border border-felt-cream/10 rounded-full px-3 py-1.5 w-fit text-sm">
              <span>{currentChampionship.name}</span>
              <button
                onClick={() => {
                  setChampionshipId("");
                  setStageLabel("");
                }}
                className="text-felt-cream/40 hover:text-felt-alert"
              >
                ✕
              </button>
            </div>
          ) : addingChampionship ? (
            <div className="space-y-2">
              <select
                value={championshipId}
                onChange={(e) => setChampionshipId(e.target.value)}
                className="w-full bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-sm text-felt-cream"
              >
                <option value="">Choisir un championnat</option>
                {championships.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                value={stageLabel}
                onChange={(e) => setStageLabel(e.target.value)}
                placeholder="Nom de l'étape (ex : Étape 3)"
                className="w-full bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-sm text-felt-cream placeholder:text-felt-cream/40"
              />
            </div>
          ) : (
            <button
              onClick={() => setAddingChampionship(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-felt-cream/20 text-sm text-felt-cream/70 hover:text-felt-cream hover:border-felt-cream/40"
            >
              <span>+</span> Ajouter un championnat
            </button>
          )}
        </div>

        <label className="block text-xs text-felt-cream/50 mb-1.5 mt-4">
          Nom du tournoi
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream"
          />
        </label>

        <label className="block text-xs text-felt-cream/50 mb-1.5 mt-4">
          Date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream"
          />
        </label>

        <label className="block text-xs text-felt-cream/50 mb-1.5 mt-4">
          Heure
          <input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream"
          />
        </label>

        <label className="block text-xs text-felt-cream/50 mb-1.5 mt-4">
          Lieu
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Aucun lieu"
            className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
          />
        </label>

        <div className="mt-5 space-y-3">
          <label className="flex items-center gap-2 text-sm text-felt-cream/80">
            <input type="checkbox" checked={managePlayers} onChange={(e) => setManagePlayers(e.target.checked)} />
            Gérer Joueurs
          </label>
          <label className="flex items-center gap-2 text-sm text-felt-cream/80">
            <input type="checkbox" checked={trackKnockouts} onChange={(e) => setTrackKnockouts(e.target.checked)} />
            Suivi des knockouts
          </label>
          <label className="flex items-center gap-2 text-sm text-felt-cream/80">
            <input type="checkbox" checked={managePayouts} onChange={(e) => setManagePayouts(e.target.checked)} />
            Gérer les Payouts
          </label>
          <label className="flex items-center gap-2 text-sm text-felt-alert/80 pt-2 border-t border-felt-cream/10 mt-1">
            <input type="checkbox" checked={forceFinished} onChange={(e) => setForceFinished(e.target.checked)} />
            Forcer le statut "Terminé"
          </label>
          {peutOuvrirAuxClubs && (
            <label className="flex items-center gap-2 text-sm text-felt-cream/80 pt-2 border-t border-felt-cream/10 mt-1">
              <input type="checkbox" checked={isInterclub} onChange={(e) => setIsInterclub(e.target.checked)} />
              Tournoi interclubs
            </label>
          )}
        </div>

        <div className="mt-5 pt-4 border-t border-felt-cream/10">
          <label className="flex items-center gap-2 text-sm text-felt-cream/80">
            <input type="checkbox" checked={publicView} onChange={(e) => setPublicView(e.target.checked)} />
            Accès public (lecture seule, sans connexion)
          </label>
          <div className="text-xs text-felt-cream/40 mt-1">
            Toute personne avec le lien pourra voir l'horloge et la liste des joueurs, sans se connecter ni créer de
            compte.
          </div>
          {publicView && (
            <div className="flex items-center gap-2 mt-2">
              <input
                readOnly
                value={publicUrl}
                onClick={(e) => e.target.select()}
                className="flex-1 bg-felt-bg border border-felt-cream/10 rounded-md px-2 py-1.5 text-xs text-felt-cream/70"
              />
              <button
                onClick={copyPublicLink}
                className="px-3 py-1.5 text-xs rounded-md bg-felt-panel border border-felt-cream/10 text-felt-cream/70 hover:text-felt-cream whitespace-nowrap"
              >
                {linkCopied ? "✓ Copié" : "Copier"}
              </button>
            </div>
          )}
        </div>

        {error && <div className="text-felt-alert text-sm mt-4">{error}</div>}

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-felt-cream/60 hover:text-felt-cream">
            Fermer
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
          >
            {saving ? "Sauvegarde…" : "Confirmer"}
          </button>
        </div>
      </div>
    </div>
  );
}
