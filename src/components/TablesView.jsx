import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import ClubLoader from "./ClubLoader.jsx";
import CustomizablePanel from "./CustomizablePanel.jsx";
import { playerLabel } from "../lib/players.js";

/**
 * TablesView — onglet "Tables" : les joueurs regroupés par table, une
 * carte par table bien détachée de la suivante, et une teinte alternée
 * d'une table à l'autre pour les distinguer d'un coup d'œil de loin
 * (l'écran est souvent consulté debout, à distance).
 *
 * Vue en lecture seule : le placement se modifie dans l'onglet Joueurs
 * (glisser-déposer de la vue des tables) ou via "Équilibrer les tables".
 * Elle se relit toute seule pour rester juste pendant la partie.
 */
export default function TablesView({ tournamentId }) {
  const [registrations, setRegistrations] = useState([]);
  const [eliminatedIds, setEliminatedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async ({ silent = false } = {}) => {
      if (!silent) setLoading(true);
      const [{ data: regs }, { data: elims }] = await Promise.all([
        supabase
          .from("registrations")
          .select("*, players(pseudo, full_name), accounts(pseudo, avatar_data)")
          .eq("tournament_id", tournamentId),
        supabase.from("eliminations").select("registration_id").eq("tournament_id", tournamentId).eq("undone", false),
      ]);
      setRegistrations(regs || []);
      setEliminatedIds(new Set((elims || []).map((e) => e.registration_id)));
      if (!silent) setLoading(false);
    },
    [tournamentId]
  );

  useEffect(() => {
    load();
    const t = setInterval(() => load({ silent: true }), 8000);
    return () => clearInterval(t);
  }, [load]);

  if (loading) return <ClubLoader />;

  // Les joueurs sans table sont regroupés à part plutôt que masqués : un
  // joueur non placé est justement ce qu'on cherche à repérer sur cet écran.
  const seated = registrations.filter((r) => r.table_number);
  const unseated = registrations.filter((r) => !r.table_number);
  const tableNumbers = [...new Set(seated.map((r) => r.table_number))].sort((a, b) => a - b);

  if (tableNumbers.length === 0 && unseated.length === 0) {
    return <div className="p-6 text-felt-cream/60 font-body">Aucun joueur inscrit.</div>;
  }

  return (
    <div className="p-4 sm:p-6 font-body text-white h-full overflow-y-auto">
      {/* Plusieurs cartes par rangée, et elles suivent les réglages 🎨 du
          tableau (fond des cellules, espacement, survol) comme partout
          ailleurs dans l'app. */}
      <CustomizablePanel
        panelKey="tables-view"
        defaultWidth="1 1 100%"
        className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6 items-start"
      >
        {tableNumbers.map((num, i) => {
          const players = seated
            .filter((r) => r.table_number === num)
            .sort((a, b) => (a.seat_number || 99) - (b.seat_number || 99));
          const enJeu = players.filter((r) => !eliminatedIds.has(r.id)).length;
          return (
            <TableCard
              key={num}
              title={`Table ${num}`}
              subtitle={`${enJeu} en jeu / ${players.length}`}
              players={players}
              eliminatedIds={eliminatedIds}
              alterne={i % 2 === 1}
            />
          );
        })}

        {unseated.length > 0 && (
          <TableCard
            title="Sans table"
            subtitle={`${unseated.length} joueur${unseated.length > 1 ? "s" : ""} à placer`}
            players={unseated}
            eliminatedIds={eliminatedIds}
            alerte
          />
        )}
      </CustomizablePanel>
    </div>
  );
}

function TableCard({ title, subtitle, players, eliminatedIds, alterne, alerte }) {
  return (
    <div
      // Teinte alternée d'une table à l'autre. Les deux fonds suivent
      // "Fond des cellules" du panneau quand l'admin en choisit un, avec
      // les couleurs du thème en repli.
      style={{
        backgroundColor: alerte
          ? "rgba(140, 58, 58, 0.12)"
          : alterne
          ? "var(--pcp-cell-bg, #14181C)"
          : "var(--pcp-cell-bg, #1B2027)",
        color: "var(--pcp-cell-text, inherit)",
      }}
      className={`pcp-card-hover rounded-xl border p-4 sm:p-5 ${alerte ? "border-felt-alert/40" : "border-felt-cream/10"}`}
    >
      <div className="flex items-baseline justify-between mb-3">
        <div className="pcp-title font-display text-lg sm:text-xl text-felt-gold">{title}</div>
        <div className="pcp-body text-xs text-felt-cream/40">{subtitle}</div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
        {players.map((r) => {
          const out = eliminatedIds.has(r.id);
          return (
            <div key={r.id} className={`flex items-center gap-3 py-1.5 ${out ? "opacity-40" : ""}`}>
              <span className="pcp-value w-8 shrink-0 text-center text-xs text-felt-cream/40 tabular-nums">
                {r.seat_number ? `S${r.seat_number}` : "—"}
              </span>
              {r.accounts?.avatar_data ? (
                <img src={r.accounts.avatar_data} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
              ) : (
                <span className="w-7 h-7 rounded-full bg-felt-bg/60 flex items-center justify-center text-[11px] text-felt-cream/40 shrink-0">
                  {playerLabel(r)[0]?.toUpperCase() || "?"}
                </span>
              )}
              <span className={`pcp-body flex-1 min-w-0 truncate ${out ? "line-through" : ""}`}>{playerLabel(r) || "?"}</span>
              <span className="pcp-value shrink-0 text-sm text-felt-cream/50 tabular-nums">
                {(r.stack ?? 0).toLocaleString("fr-FR")}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
