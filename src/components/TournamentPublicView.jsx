import { useEffect, useState } from "react";
import ClubLoader from "./ClubLoader.jsx";
import { supabase } from "../lib/supabase.js";

/**
 * TournamentPublicView — consultation en lecture seule d'un tournoi pour
 * un simple joueur : liste des inscrits, statut, sans aucune action de
 * gestion (ça, c'est réservé à admin/TD via TournamentDetail).
 */
export default function TournamentPublicView({ tournamentId, onBack }) {
  const [tournament, setTournament] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [eliminations, setEliminations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    load();
  }, [tournamentId]);

  async function load() {
    setLoading(true);
    const { data: t } = await supabase.from("tournaments").select("*").eq("id", tournamentId).single();
    const { data: regs } = await supabase
      .from("registrations")
      .select("*, players(full_name)")
      .eq("tournament_id", tournamentId)
      .order("table_number", { ascending: true });
    const { data: elims } = await supabase
      .from("eliminations")
      .select("registration_id")
      .eq("tournament_id", tournamentId)
      .eq("undone", false);
    setTournament(t);
    setRegistrations(regs || []);
    setEliminations(elims || []);
    setLoading(false);
  }

  if (loading) return <ClubLoader />;
  if (!tournament) return null;

  const eliminatedIds = new Set(eliminations.map((e) => e.registration_id));
  const stillIn = registrations.filter((r) => !eliminatedIds.has(r.id));

  return (
    <div className="p-4 sm:p-6 font-body text-felt-cream h-full overflow-y-auto max-w-lg">
      <div className="text-xs text-felt-cream/40 mb-4">
        {stillIn.length} en jeu / {registrations.length} inscrits
      </div>

      <div className="space-y-2">
        {registrations.map((reg) => {
          const isOut = eliminatedIds.has(reg.id);
          return (
            <div
              key={reg.id}
              className={`flex items-center justify-between rounded-md px-4 py-2 border ${
                isOut
                  ? "border-felt-alert/30 bg-felt-alert/10 text-felt-cream/40"
                  : "border-felt-cream/10 bg-felt-panel"
              }`}
            >
              <span className="font-medium">{reg.players?.full_name}</span>
              <span className="text-felt-cream/40 text-sm">
                Table {reg.table_number} · Siège {reg.seat_number}
              </span>
            </div>
          );
        })}
        {registrations.length === 0 && (
          <div className="text-felt-cream/50 text-sm">Aucun joueur inscrit pour le moment.</div>
        )}
      </div>
    </div>
  );
}
