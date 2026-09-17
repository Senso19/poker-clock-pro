import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { fetchLevels, defaultStructure } from "../lib/levels.js";
import { useIsMobile } from "../lib/useIsMobile.js";
import EditableClock from "./EditableClock.jsx";
import MobileClockView from "./MobileClockView.jsx";
import ClubLoader from "./ClubLoader.jsx";

/**
 * PublicTournamentPage — consultation d'un tournoi SANS connexion ni
 * compte, à l'adresse /public/<tournamentId>. Uniquement si l'admin/TD a
 * activé "Accès public (lecture seule)" pour ce tournoi (tournaments.
 * public_view) — sinon un message explicite s'affiche, rien n'est exposé
 * par défaut. Toujours en lecture seule : canEdit={false} sur l'horloge,
 * aucune action de gestion possible ici.
 */
export default function PublicTournamentPage({ tournamentId }) {
  const isMobile = useIsMobile();
  const [tournament, setTournament] = useState(null);
  const [levels, setLevels] = useState(defaultStructure());
  const [registrations, setRegistrations] = useState([]);
  const [eliminatedIds, setEliminatedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("clock");

  useEffect(() => {
    load();
  }, [tournamentId]);

  async function load() {
    setLoading(true);
    const { data: t } = await supabase.from("tournaments").select("*").eq("id", tournamentId).maybeSingle();
    setTournament(t);
    if (t?.public_view) {
      const existing = await fetchLevels(tournamentId);
      if (existing?.length) setLevels(existing);
      const { data: regs } = await supabase
        .from("registrations")
        .select("*, players(full_name, pseudo)")
        .eq("tournament_id", tournamentId)
        .order("table_number", { ascending: true });
      setRegistrations(regs || []);
      const { data: elims } = await supabase
        .from("eliminations")
        .select("registration_id")
        .eq("tournament_id", tournamentId)
        .eq("undone", false);
      setEliminatedIds(new Set((elims || []).map((e) => e.registration_id)));
    }
    setLoading(false);
  }

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-felt-bg">
        <ClubLoader />
      </div>
    );
  }

  if (!tournament || !tournament.public_view) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-felt-bg text-felt-cream/60 font-body text-center px-6">
        Ce tournoi n'est pas accessible publiquement, ou n'existe pas.
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-felt-bg text-felt-cream flex flex-col">
      <div className="flex items-center gap-4 px-4 py-2 border-b border-felt-cream/10 font-display">
        <span className="text-felt-gold/70 text-xs uppercase tracking-wide">Consultation publique</span>
        <span className="truncate">{tournament.name}</span>
        <div className="ml-auto flex gap-2 text-xs">
          <button
            onClick={() => setTab("clock")}
            className={`px-3 py-1 rounded-md ${tab === "clock" ? "bg-felt-gold text-felt-bg" : "bg-felt-panel text-felt-cream/60"}`}
          >
            Horloge
          </button>
          <button
            onClick={() => setTab("players")}
            className={`px-3 py-1 rounded-md ${tab === "players" ? "bg-felt-gold text-felt-bg" : "bg-felt-panel text-felt-cream/60"}`}
          >
            Joueurs
          </button>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        {tab === "clock" ? (
          isMobile ? <MobileClockView levels={levels} /> : <EditableClock levels={levels} canEdit={false} />
        ) : (
          <div className="p-4 overflow-y-auto h-full">
            <div className="text-xs text-felt-cream/40 mb-3">{registrations.length} joueur(s) inscrit(s)</div>
            <div className="divide-y divide-felt-cream/5">
              {registrations.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-2 text-sm">
                  <span className={eliminatedIds.has(r.id) ? "text-felt-cream/30 line-through" : ""}>
                    {r.players?.pseudo || r.players?.full_name}
                  </span>
                  <span className="text-felt-cream/40 text-xs">
                    {r.table_number ? `Table ${r.table_number} / Siège ${r.seat_number}` : ""}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
