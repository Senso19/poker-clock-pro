import { useState } from "react";
import CustomizablePanel from "./CustomizablePanel.jsx";

const AVATAR_COLORS = ["#C9A15A", "#8C3A3A", "#3A6B8C", "#3A8C5E", "#8C5A3A", "#6B3A8C"];
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * ChampionshipDetailPage — page dédiée d'un championnat façon BlindValet :
 * retour, titre, classement complet avec avatar/nom/nombre de tournois/
 * points, chaque ligne dépliable pour voir le détail par étape.
 */
export default function ChampionshipDetailPage({ summary, manage, onBack, onDelete }) {
  const [expandedId, setExpandedId] = useState(null);
  const { championship, standings } = summary;

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
        <div
          style={{ fontSize: "var(--pcp-card-text-size, inherit)", color: "var(--pcp-card-text-color, white)" }}
          className="font-display text-2xl truncate flex-1"
        >
          {championship.name}
        </div>
        {manage && (
          <button onClick={onDelete} className="text-felt-alert/70 hover:text-felt-alert text-sm shrink-0">
            🗑 Supprimer
          </button>
        )}
      </CustomizablePanel>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <CustomizablePanel panelKey="championship-detail-meta" defaultWidth="1 1 100%" className="mb-6">
          <div className="text-base text-felt-cream/60 mb-6">
            {summary.stageCount} tournois · {summary.playerCount} joueurs ·{" "}
            {championship.best_stages_count
              ? `${championship.best_stages_count} meilleures étapes comptent`
              : "toutes les étapes comptent"}
          </div>

          <div className="font-display text-xl">Classement du championnat</div>
        </CustomizablePanel>

        {standings.length === 0 ? (
          <div className="text-base text-felt-cream/50">Aucune étape terminée pour l'instant.</div>
        ) : (
          <CustomizablePanel panelKey="championship-standings" className="space-y-2.5" defaultWidth="1 1 100%">
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
