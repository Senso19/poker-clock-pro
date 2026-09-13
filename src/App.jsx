import { lazy, Suspense, useState } from "react";
import Sidebar from "./components/Sidebar.jsx";
import TournamentsGrid from "./components/TournamentsGrid.jsx";
import { useTheme } from "./context/ThemeContext.jsx";
import { useAccount } from "./context/AccountContext.jsx";
import { canManageTournaments, canManageAccounts } from "./lib/auth.js";

// Chargés à la demande (import() dynamique) : ces écrans embarquent des
// composants lourds (horloge éditable, structure des blinds, xlsx...) qui
// n'ont pas besoin de peser sur le premier écran affiché (la grille des
// tournois). Ça réduit sensiblement le temps de chargement initial.
const TournamentPage = lazy(() => import("./components/TournamentPage.jsx"));
const LayoutSettings = lazy(() => import("./components/LayoutSettings.jsx"));
const ChampionshipView = lazy(() => import("./components/ChampionshipView.jsx"));
const StructureTemplatesManager = lazy(() => import("./components/StructureTemplatesManager.jsx"));
const AccountsAdmin = lazy(() => import("./components/AccountsAdmin.jsx"));
const EliminationView = lazy(() => import("./components/EliminationView.jsx"));

function TabFallback() {
  return <div className="p-6 text-felt-cream/50 font-body">Chargement…</div>;
}

/**
 * App — les onglets Horloge et Structure autonomes ont été retirés de la
 * barre latérale : la conception de modèles de structure et d'horloge se
 * fait désormais depuis "Gérer les modèles" (StructureTemplatesManager),
 * sans dépendre d'un tournoi actif. L'horloge et la structure d'UN tournoi
 * précis restent accessibles via ses propres onglets dans TournamentPage.
 */
export default function App() {
  const { account } = useAccount();
  const manage = canManageTournaments(account.role);
  const manageAccounts = canManageAccounts(account.role);
  const isStaffOnly = account.role === "floor" || account.role === "table_captain";

  const [tab, setTab] = useState(isStaffOnly ? "eliminate" : "tournaments");
  const [openTournamentId, setOpenTournamentId] = useState(null);
  const { theme } = useTheme();

  function goToTab(key) {
    setTab(key);
  }

  const bg = theme.background || { type: "color", value: "#14181C" };
  const bgStyle =
    bg.type === "image"
      ? { backgroundImage: `url(${bg.value})`, backgroundSize: "cover", backgroundPosition: "center" }
      : { backgroundColor: bg.value };

  return (
    <div className="h-screen w-screen flex" style={bgStyle}>
      <Sidebar tab={tab} setTab={goToTab} />
      <div className="flex-1 min-w-0 h-full overflow-hidden relative pt-14 sm:pt-0">
        <Suspense fallback={<TabFallback />}>
          {tab === "tournaments" &&
            (openTournamentId ? (
              <TournamentPage tournamentId={openTournamentId} onBack={() => setOpenTournamentId(null)} />
            ) : (
              <TournamentsGrid onOpen={setOpenTournamentId} />
            ))}
          {tab === "eliminate" && isStaffOnly && <EliminationView />}
          {tab === "championship" && <ChampionshipView />}
          {tab === "templates" && manage && <StructureTemplatesManager />}
          {tab === "accounts" && manageAccounts && <AccountsAdmin />}
          {tab === "settings" && manage && <LayoutSettings />}
        </Suspense>
      </div>
    </div>
  );
}
