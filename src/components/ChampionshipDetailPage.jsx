import { useState } from "react";
import CustomizablePanel from "./CustomizablePanel.jsx";
import { avatarColor, initials } from "../lib/avatars.js";


/**
 * ChampionshipDetailPage — page dédiée d'un championnat façon BlindValet :
 * retour, titre, classement complet avec avatar/nom/nombre de tournois/
 * points, chaque ligne dépliable pour voir le détail par étape.
 */
export default function ChampionshipDetailPage({
  summary,
  manage,
  onBack,
  onDelete,
  onTogglePublic,
  onEdit,
  onRecalculate,
  recalculating,
  onToggleFinished,
}) {
  const [expandedId, setExpandedId] = useState(null);
  const { championship, standings } = summary;
  const termine = !!championship.finished_at;

  /**
   * Le classement, en CSV — de quoi l'ouvrir dans un tableur, l'afficher
   * ou l'envoyer aux joueurs. Séparateur point-virgule et BOM UTF-8 :
   * c'est ce qu'attend Excel en français, sinon les accents sortent en
   * charabia et tout atterrit dans une seule colonne.
   */
  function telechargerCsv() {
    const echapper = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lignes = [
      ["Place", "Joueur", "Tournois", "Points"].map(echapper).join(";"),
      ...standings.map((s, i) => [i + 1, s.name, s.stagePoints.length, s.totalPoints].map(echapper).join(";")),
    ];
    const blob = new Blob(["\ufeff" + lignes.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${championship.name.replace(/[^\w\d-]+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="h-full overflow-y-auto font-body text-white">
      <CustomizablePanel
        panelKey="championship-detail-header"
        defaultWidth="1 1 100%"
        className="flex items-center gap-3 px-4 sm:px-6 py-5 border-b border-felt-cream/10"
      >
        <button onClick={onBack} className="text-felt-cream/60 hover:text-white text-2xl leading-none">
          ←
        </button>
        <div className="pcp-title font-display text-2xl truncate flex-1">{championship.name}</div>
        {manage && (
          <label className="flex items-center gap-1.5 text-xs text-felt-cream/60 shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={!!championship.public_view}
              onChange={(e) => onTogglePublic?.(e.target.checked)}
            />
            Accès public
          </label>
        )}
        {manage && (
          <button onClick={onEdit} title="Réglages du championnat (formule, étapes comptées…)" className="text-felt-cream/50 hover:text-felt-gold text-lg shrink-0">
            ⚙
          </button>
        )}
        {manage && (
          <button onClick={onDelete} title="Supprimer ce championnat" className="text-felt-alert/70 hover:text-felt-alert text-lg shrink-0">
            🗑
          </button>
        )}
      </CustomizablePanel>

      <div className="p-4 sm:p-6">
        {/* Les actions du championnat, groupées sous le titre : régler la
            formule, clore la saison, relire le classement, l'emporter. */}
        <CustomizablePanel panelKey="championship-detail-actions" defaultWidth="1 1 768px" defaultMaxWidth="768px" className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-5">
          {manage && (
            <button onClick={onToggleFinished} className="flex items-center gap-2 text-sm text-felt-cream/70 hover:text-felt-gold">
              <span>🏆</span> {termine ? "Rouvrir le championnat" : "Terminer le championnat"}
            </button>
          )}
          <button
            onClick={onRecalculate}
            disabled={recalculating}
            title="Relit les résultats de toutes les étapes et recalcule les points"
            className="flex items-center gap-2 text-sm text-felt-cream/70 hover:text-felt-gold disabled:opacity-40"
          >
            <span>↻</span> {recalculating ? "Recalcul…" : "Recalculer"}
          </button>
          <button
            onClick={telechargerCsv}
            disabled={standings.length === 0}
            className="flex items-center gap-2 text-sm text-felt-cream/70 hover:text-felt-gold disabled:opacity-40"
          >
            <span>⤓</span> Télécharger (CSV)
          </button>
          {termine && <span className="text-xs text-felt-gold/70">Championnat terminé</span>}
        </CustomizablePanel>

        <CustomizablePanel panelKey="championship-detail-meta" defaultWidth="1 1 768px" defaultMaxWidth="768px" className="mb-6">
          <div className="pcp-body text-base text-felt-cream/60 mb-6">
            {summary.stageCount} tournois · {summary.playerCount} joueurs ·{" "}
            {championship.best_stages_count
              ? `${championship.best_stages_count} meilleures étapes comptent`
              : "toutes les étapes comptent"}
          </div>

          <div className="pcp-title font-display text-xl">Classement du championnat</div>
        </CustomizablePanel>

        {standings.length === 0 ? (
          <div className="text-base text-felt-cream/50">Aucune étape terminée pour l'instant.</div>
        ) : (
          <CustomizablePanel panelKey="championship-standings" className="space-y-2.5" defaultWidth="1 1 768px" defaultMaxWidth="768px">
            {standings.map((s, i) => {
              const expanded = expandedId === s.playerId;
              return (
                <div
                  key={s.playerId}
                  style={{ backgroundColor: "var(--pcp-cell-bg)", color: "var(--pcp-cell-text)" }}
                  className="bg-felt-panel border border-felt-cream/10 rounded-xl overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedId(expanded ? null : s.playerId)}
                    className="w-full flex items-center gap-4 px-5 py-4 text-left hover:bg-black/10"
                  >
                    <span className="w-8 text-center font-display text-xl text-felt-gold">{i + 1}</span>
                    <div
                      style={{ backgroundColor: avatarColor(s.name) }}
                      className="w-12 h-12 rounded-full flex items-center justify-center text-felt-cream font-display text-base shrink-0"
                    >
                      {initials(s.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-lg truncate">{s.name}</div>
                      <div className="text-sm text-felt-cream/40">
                        {s.stagePoints.length} tournoi{s.stagePoints.length > 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="text-felt-gold font-display text-2xl shrink-0">{s.totalPoints}</div>
                    <span className="text-felt-cream/30 shrink-0 text-lg">{expanded ? "▲" : "▼"}</span>
                  </button>
                  {expanded && (
                    <div className="px-5 pb-4 space-y-1.5 border-t border-felt-cream/5 pt-3">
                      {[...s.stagePoints]
                        .sort((a, b) => b.points - a.points)
                        .map((sp) => (
                          <div key={sp.stageId} className="flex items-center justify-between text-base py-1">
                            <span className="text-felt-cream/60 truncate">{sp.stageLabel}</span>
                            <span className="flex items-center gap-3 shrink-0">
                              <span className="text-felt-cream/40 text-sm">{sp.position}e place</span>
                              <span className="text-felt-gold">{sp.points} pts</span>
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </CustomizablePanel>
        )}
      </div>
    </div>
  );
}
