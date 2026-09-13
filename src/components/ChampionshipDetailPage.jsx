import { useState } from "react";

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
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-felt-cream/10">
        <button onClick={onBack} className="text-felt-cream/60 hover:text-white text-xl leading-none">
          ←
        </button>
        <div className="font-display text-lg truncate flex-1">{championship.name}</div>
        {manage && (
          <button onClick={onDelete} className="text-felt-alert/70 hover:text-felt-alert text-sm shrink-0">
            🗑 Supprimer
          </button>
        )}
      </div>

      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        <div className="text-xs text-felt-cream/40 mb-1 font-mono">{championship.formula_text}</div>
        <div className="text-xs text-felt-cream/40 mb-6">
          {championship.best_stages_count
            ? `${championship.best_stages_count} meilleures étapes comptent`
            : "Toutes les étapes comptent"}
          {" · "}
          {summary.stageCount} tournois · {summary.playerCount} joueurs
        </div>

        <div className="font-display text-base mb-3">Classement du championnat</div>

        {standings.length === 0 ? (
          <div className="text-sm text-felt-cream/50">Aucune étape terminée pour l'instant.</div>
        ) : (
          <div className="space-y-2">
            {standings.map((s, i) => {
              const expanded = expandedId === s.playerId;
              return (
                <div key={s.playerId} className="bg-felt-panel border border-felt-cream/10 rounded-xl overflow-hidden">
                  <button
                    onClick={() => setExpandedId(expanded ? null : s.playerId)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-black/10"
                  >
                    <span className="w-6 text-center font-display text-felt-gold">{i + 1}</span>
                    <div
                      style={{ backgroundColor: avatarColor(s.name) }}
                      className="w-10 h-10 rounded-full flex items-center justify-center text-felt-cream font-display text-sm shrink-0"
                    >
                      {initials(s.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-white truncate">{s.name}</div>
                      <div className="text-xs text-felt-cream/40">
                        {s.stagePoints.length} tournoi{s.stagePoints.length > 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="text-felt-gold font-display text-lg shrink-0">{s.totalPoints}</div>
                    <span className="text-felt-cream/30 shrink-0">{expanded ? "▲" : "▼"}</span>
                  </button>
                  {expanded && (
                    <div className="px-4 pb-3 space-y-1 border-t border-felt-cream/5 pt-2">
                      {[...s.stagePoints]
                        .sort((a, b) => b.points - a.points)
                        .map((sp) => (
                          <div key={sp.stageId} className="flex items-center justify-between text-sm py-1">
                            <span className="text-felt-cream/60 truncate">{sp.stageLabel}</span>
                            <span className="flex items-center gap-3 shrink-0">
                              <span className="text-felt-cream/40 text-xs">{sp.position}e place</span>
                              <span className="text-felt-gold">{sp.points} pts</span>
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
