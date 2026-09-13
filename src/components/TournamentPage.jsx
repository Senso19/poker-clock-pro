import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { selectTournament } from "../lib/tournaments.js";
import { fetchLevels, defaultStructure } from "../lib/levels.js";
import { useAccount } from "../context/AccountContext.jsx";
import { canManageTournaments, canControlClock } from "../lib/auth.js";
import EditableClock from "./EditableClock.jsx";
import StructureEditor from "./StructureEditor.jsx";
import TournamentDetail from "./TournamentDetail.jsx";
import TournamentPublicView from "./TournamentPublicView.jsx";
import TournamentSettingsModal from "./TournamentSettingsModal.jsx";

const TABS = [
  { key: "clock", label: "Horloge" },
  { key: "structure", label: "Structure des blinds" },
  { key: "players", label: "Joueurs" },
];

/**
 * TournamentPage — page d'un tournoi précis, façon BlindValet : bouton
 * "← Lobby Poker", nom du tournoi, puis onglets Horloge / Structure des
 * blinds / Joueurs. L'onglet Horloge affiche l'horloge en direct de CE
 * tournoi ; Structure permet de l'éditer (admin/TD) ou de la consulter
 * (joueur) ; Joueurs reprend la gestion des inscriptions (admin/TD) ou la
 * liste en lecture seule (joueur).
 */
export default function TournamentPage({ tournamentId, onBack }) {
  const { account } = useAccount();
  const manage = canManageTournaments(account.role);
  const clockControl = canControlClock(account.role);

  const [tab, setTab] = useState("clock");
  const [tournament, setTournament] = useState(null);
  const [levels, setLevels] = useState(defaultStructure());
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    selectTournament(tournamentId);
    load();
  }, [tournamentId]);

  async function load() {
    setLoading(true);
    const { data: t } = await supabase
      .from("tournaments")
      .select("*, championships(name)")
      .eq("id", tournamentId)
      .maybeSingle();
    setTournament(t);
    await loadLevels();
    setLoading(false);
  }

  async function loadLevels() {
    try {
      const existing = await fetchLevels(tournamentId);
      setLevels(existing.length > 0 ? existing : defaultStructure());
    } catch {
      setLevels(defaultStructure());
    }
  }

  if (loading) {
    return <div className="p-6 text-felt-cream/60 font-body">Chargement…</div>;
  }
  if (!tournament) {
    return <div className="p-6 text-felt-cream/60 font-body">Tournoi introuvable.</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center px-3 sm:px-6 py-3 sm:py-4 border-b border-felt-cream/10 shrink-0">
        <button onClick={onBack} className="text-xs sm:text-sm text-felt-cream/50 hover:text-felt-cream flex items-center gap-1 shrink-0">
          ← Lobby
        </button>
        <div className="flex-1 text-center min-w-0 px-2 flex items-center justify-center gap-3">
          <div className="min-w-0">
            <div className="font-display text-2xl sm:text-3xl text-felt-cream truncate">{tournament.name}</div>
            {tournament.championships?.name && (
              <div className="text-base sm:text-lg text-felt-gold/80 truncate mt-0.5">
                🏆 {tournament.championships.name}
                {tournament.stage_label ? ` — ${tournament.stage_label}` : ""}
              </div>
            )}
          </div>
          {manage && (
            <button
              onClick={() => setShowSettings(true)}
              title="Réglages du tournoi"
              className="text-felt-cream/40 hover:text-felt-gold shrink-0 text-lg"
            >
              ⚙
            </button>
          )}
        </div>
        <div className="w-10 sm:w-20 shrink-0" />
      </div>

      {showSettings && (
        <TournamentSettingsModal
          tournament={tournament}
          onClose={() => setShowSettings(false)}
          onSaved={load}
        />
      )}

      <div className="flex border-b border-felt-cream/10 shrink-0">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-3 sm:py-4 px-2 text-sm sm:text-lg font-display font-medium text-center border-b-2 -mb-px ${
              tab === t.key ? "border-felt-gold text-felt-gold" : "border-transparent text-felt-cream/50 hover:text-felt-cream"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden relative">
        <div className={tab === "clock" ? "absolute inset-0" : "absolute inset-0 hidden"}>
          <EditableClock levels={levels} canEdit={manage && clockControl} />
        </div>
        {tab === "structure" &&
          (manage ? (
            <StructureEditor onSaved={loadLevels} />
          ) : (
            <div className="p-4 sm:p-6 font-body text-felt-cream h-full overflow-y-auto max-w-lg">
              <div className="space-y-1">
                {levels.map((l, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md px-3 py-2 bg-felt-panel border border-felt-cream/10 text-sm">
                    <span className="text-felt-cream/40 w-8">{i + 1}</span>
                    <span className="text-felt-cream/40 w-14">{l.durationMinutes}'</span>
                    <span className="flex-1 text-right">
                      {l.isBreak ? l.breakLabel || "Pause" : `${l.smallBlind}/${l.bigBlind}${l.ante ? ` (${l.ante})` : ""}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        {tab === "players" &&
          (manage ? (
            <TournamentDetail tournamentId={tournamentId} onBack={onBack} />
          ) : (
            <TournamentPublicView tournamentId={tournamentId} onBack={onBack} />
          ))}
      </div>
    </div>
  );
}
