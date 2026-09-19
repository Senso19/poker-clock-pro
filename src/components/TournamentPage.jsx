import { useEffect, useState } from "react";
import { usePolling } from "../lib/usePolling.js";
import ClubLoader from "./ClubLoader.jsx";
import { supabase } from "../lib/supabase.js";
import { selectTournament } from "../lib/tournaments.js";
import { fetchLevels, defaultStructure } from "../lib/levels.js";
import { useAccount } from "../context/AccountContext.jsx";
import { canManageTournament, canControlClock, canManageInterclubTournaments, roleEffectif, canManageStructure, canManageSeating } from "../lib/auth.js";
import { useIsMobile } from "../lib/useIsMobile.js";
import { useTheme } from "../context/ThemeContext.jsx";
import { formatChips } from "../lib/format.js";
import EditableClock from "./EditableClock.jsx";
import MobileClockView from "./MobileClockView.jsx";
import TablesView from "./TablesView.jsx";
import StructureEditor from "./StructureEditor.jsx";
import TournamentDetail from "./TournamentDetail.jsx";
import TournamentPublicView from "./TournamentPublicView.jsx";
import TournamentSettingsModal from "./TournamentSettingsModal.jsx";
import { TableBalanceProvider } from "../context/TableBalanceContext.jsx";

const TABS = [
  { key: "clock", label: "Horloge" },
  { key: "structure", label: "Structure des blinds" },
  { key: "players", label: "Joueurs" },
  { key: "tables", label: "Tables" },
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
  const { theme } = useTheme();
  // Liste de structure en lecture seule (joueurs) : même abréviation des
  // montants que sur l'horloge, sinon les deux écrans se contrediraient.
  const chips = (v) => formatChips(v, !!theme.compactChips);
  const isMobile = useIsMobile();

  const [tab, setTab] = useState("clock");
  const [tournament, setTournament] = useState(null);
  const [levels, setLevels] = useState(defaultStructure());
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    selectTournament(tournamentId);
    load();
  }, [tournamentId]);

  async function load({ silent = false } = {}) {
    if (!silent) setLoading(true);
    const { data: t } = await supabase
      .from("tournaments")
      .select("*, championships(name)")
      .eq("id", tournamentId)
      .maybeSingle();
    setTournament(t);
    await loadLevels();
    if (!silent) setLoading(false);
  }

  // L'horloge lit la structure et les réglages du tournoi via ces états :
  // sans rafraîchissement ils restaient figés sur leur valeur au moment
  // où la page a été ouverte, et une modification faite en pleine partie
  // (ici ou depuis un autre appareil) n'apparaissait jamais à l'écran.
  // "silent" évite de repasser par l'écran de chargement à chaque tour.
  usePolling(() => load({ silent: true }), 10000, { immediat: false });

  // Revenir sur l'onglet Horloge doit montrer l'état à jour tout de suite,
  // sans attendre le prochain tour de rafraîchissement.
  useEffect(() => {
    if (tab === "clock") load({ silent: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function loadLevels() {
    try {
      const existing = await fetchLevels(tournamentId);
      setLevels(existing.length > 0 ? existing : defaultStructure());
    } catch {
      setLevels(defaultStructure());
    }
  }

  if (loading) {
    return <ClubLoader />;
  }
  if (!tournament) {
    return <div className="p-6 text-felt-cream/60 font-body">Tournoi introuvable.</div>;
  }

  // Un gestionnaire de club gère entièrement ce tournoi s'il est marqué
  // "interclubs", exactement comme admin/TD/floor gèrent les tournois
  // normaux — sinon il n'a que la vue lecture, comme un joueur.
  const manage = canManageTournament(account, tournament);
  // Deux droits plus fins se détachent de « gérer les tournois » : modifier
  // la structure des blindes, et bouger les joueurs sur les tables. Un
  // floor tient la salle sans avoir à toucher à la structure.
  const role = roleEffectif(account);
  const editStructure = manage && canManageStructure(role);
  // (manage || X) && X se réduit à X : la première moitié ne changeait
  // rien. Gérer les sièges est un droit à part, c'est lui qui décide.
  const editSeating = canManageSeating(role);
  // Idem pour le contrôle de l'horloge : un gestionnaire de club l'a sur ses
  // tournois interclubs, en plus des rôles à qui la matrice l'accorde déjà.
  const clockControl = canControlClock(account?.role) ||
    // Le gestionnaire d'un club invité pilote l'horloge de SON tournoi
    // interclub, et d'aucun autre.
    (canManageInterclubTournaments(account?.role) && !!tournament.is_interclub);

  // La surveillance de l'équilibre des tables vit ici, autour des onglets,
  // et non plus dans l'onglet Joueurs : un onglet n'est monté que pendant
  // qu'on le regarde, donc la proposition de casser ou d'équilibrer
  // n'apparaissait qu'en entrant dans Joueurs. À ce niveau, le message du
  // bas de page sort dès que l'action devient possible, quel que soit
  // l'onglet ouvert. Les inscriptions ne sont lues en continu que pour
  // ceux qui gèrent le tournoi (ce sont les seuls à qui on propose ces
  // déplacements) ou quand un onglet les affiche.
  return (
    <TableBalanceProvider
      tournamentId={tournamentId}
      tournament={tournament}
      surveiller={manage}
      actif={manage || tab === "tables" || tab === "players"}
    >
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
          {isMobile ? (
            <MobileClockView levels={levels} canEdit={manage && clockControl} />
          ) : (
            <EditableClock levels={levels} canEdit={manage && clockControl} />
          )}
        </div>
        {tab === "structure" &&
          (editStructure ? (
            <StructureEditor onSaved={loadLevels} />
          ) : (
            <div className="p-4 sm:p-6 font-body text-felt-cream h-full overflow-y-auto max-w-lg">
              <div className="space-y-1">
                {levels.map((l, i) => (
                  <div key={i} className="flex items-center justify-between rounded-md px-3 py-2 bg-felt-panel border border-felt-cream/10 text-sm">
                    <span className="text-felt-cream/40 w-8">{i + 1}</span>
                    <span className="text-felt-cream/40 w-14">{l.durationMinutes}'</span>
                    <span className="flex-1 text-right">
                      {l.isBreak
                        ? l.breakLabel || "Pause"
                        : `${chips(l.smallBlind)}/${chips(l.bigBlind)}${l.ante ? ` (${chips(l.ante)})` : ""}`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        {tab === "tables" && <TablesView tournamentId={tournamentId} manage={editSeating} />}
        {tab === "players" &&
          (manage ? (
            <TournamentDetail tournamentId={tournamentId} onBack={onBack} />
          ) : (
            <TournamentPublicView tournamentId={tournamentId} onBack={onBack} />
          ))}
      </div>
    </div>
    </TableBalanceProvider>
  );
}
