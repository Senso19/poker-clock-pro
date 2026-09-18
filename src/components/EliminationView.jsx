import { useEffect, useState } from "react";
import ClubLoader from "./ClubLoader.jsx";
import { supabase } from "../lib/supabase.js";
import { sortByPlayerLabel } from "../lib/players.js";
import { eliminatePlayer } from "../lib/eliminations.js";
import EliminationPicker from "./EliminationPicker.jsx";
import { fetchCurrentTournament } from "../lib/tournaments.js";
import { fetchMyTables, canEliminateAnyone, ROLE_LABELS } from "../lib/auth.js";
import { useAccount } from "../context/AccountContext.jsx";
import CustomizablePanel from "./CustomizablePanel.jsx";

/**
 * EliminationView — vue restreinte pour Floor (toutes les tables) et Chef de
 * table (sa/ses table(s) assignée(s) uniquement). Pas de gestion de structure,
 * de championnat ni d'inscriptions.
 */
export default function EliminationView() {
  const { account } = useAccount();
  const [tournament, setTournament] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [eliminations, setEliminations] = useState([]);
  const [myTables, setMyTables] = useState(null); // null = pas de restriction
  const [loading, setLoading] = useState(true);
  const [eliminatingReg, setEliminatingReg] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const t = await fetchCurrentTournament();
    setTournament(t);
    if (t) {
      // Le cloisonnement aux tables assignées suit la permission « Éliminer
      // n'importe quel joueur », pas le rôle : cette case est réglable par
      // l'administrateur dans la matrice des droits, et elle ne servait à
      // rien — la restriction était écrite en dur sur le rôle chef de
      // table. La décocher pour un floor ne changeait rien ; la cocher pour
      // un chef de table non plus.
      if (!canEliminateAnyone(account.role)) {
        setMyTables(await fetchMyTables(t.id, account.id));
      } else {
        setMyTables(null);
      }
      await loadData(t.id);
    }
    setLoading(false);
  }

  async function loadData(tournamentId) {
    const { data: regs } = await supabase
      .from("registrations")
      // pseudo en plus du nom complet : c'est lui qui sert de libellé et
      // de clé de tri, il manquait à cette requête.
      .select("*, players(full_name, pseudo), accounts(pseudo)")
      .eq("tournament_id", tournamentId);
    const { data: elims } = await supabase
      .from("eliminations")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("undone", false);
    setRegistrations(sortByPlayerLabel(regs));
    setEliminations(elims || []);
  }

  // Sans suivi des knockouts, le "éliminé par qui ?" ne compte plus rien :
  // on élimine directement plutôt que de faire valider un champ inutile.
  function demanderElimination(reg) {
    if (!tournament?.track_knockouts) {
      confirmElimination(reg, null);
      return;
    }
    setEliminatingReg(eliminatingReg === reg.id ? null : reg.id);
  }

  async function confirmElimination(reg, eliminatedByRegId) {
    const stillIn = registrations.filter(
      (r) => !eliminations.some((e) => e.registration_id === r.id)
    );
    // Passe par lib/eliminations.js : cette vue écrivait jusqu'ici la
    // ligne à la main, sans journal, sans annonce et sans terminer le
    // tournoi au dernier joueur. Une élimination saisie par un chef de
    // table valait donc moins qu'une élimination saisie par le floor.
    await eliminatePlayer({ tournamentId: tournament.id, reg, stillIn, eliminatedByRegId });
    setEliminatingReg(null);
    loadData(tournament.id);
  }

  if (loading) return <ClubLoader />;
  if (!tournament) return <div className="p-6 text-felt-cream/60 font-body">Aucun tournoi actif.</div>;

  const eliminatedIds = new Set(eliminations.map((e) => e.registration_id));
  const stillIn = registrations.filter((r) => !eliminatedIds.has(r.id));
  const visible =
    myTables === null ? stillIn : stillIn.filter((r) => myTables.includes(r.table_number));

  return (
    <div className="p-4 sm:p-6 font-body text-felt-cream h-full overflow-y-auto">
      <div className="font-display text-xl mb-1">{tournament.name}</div>
      <div className="text-xs text-felt-cream/40 mb-4">
        {myTables !== null
          ? myTables.length > 0
            ? `${ROLE_LABELS[account.role] || "Accès limité"} — Table${myTables.length > 1 ? "s" : ""} ${myTables.join(", ")}`
            : "Aucune table ne t'est assignée pour ce tournoi."
          : "Floor — toutes les tables"}
      </div>

      <CustomizablePanel panelKey="elimination-list" defaultWidth="1 1 100%" className="space-y-2">
        {visible.map((reg) => (
          <div key={reg.id}>
            <div
              style={{ backgroundColor: "var(--pcp-cell-bg, #1B2027)", color: "var(--pcp-cell-text)" }}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md px-4 py-2 border border-felt-cream/10"
            >
              <div>
                <span className="pcp-title font-medium">{reg.players?.full_name}</span>
                <span className="pcp-body text-felt-cream/40 text-sm ml-2">
                  Table {reg.table_number} · Siège {reg.seat_number}
                </span>
              </div>
              <button
                onClick={() => demanderElimination(reg)}
                className="text-xs px-3 py-1.5 rounded font-display bg-felt-alert/80 text-felt-cream hover:bg-felt-alert"
              >
                Éliminer
              </button>
            </div>
            {eliminatingReg === reg.id && (
              <EliminationPicker
                candidates={stillIn.filter((r) => r.id !== reg.id)}
                onConfirm={(byId) => confirmElimination(reg, byId)}
                onCancel={() => setEliminatingReg(null)}
              />
            )}
          </div>
        ))}
        {visible.length === 0 && (
          <div className="text-felt-cream/50 text-sm">Aucun joueur à afficher.</div>
        )}
      </CustomizablePanel>
    </div>
  );
}

