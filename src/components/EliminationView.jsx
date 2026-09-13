import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { fetchCurrentTournament } from "../lib/tournaments.js";
import { fetchMyTables } from "../lib/auth.js";
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
  const [myTables, setMyTables] = useState(null); // null = pas de restriction (floor)
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
      if (account.role === "table_captain") {
        setMyTables(await fetchMyTables(t.id, account.id));
      }
      await loadData(t.id);
    }
    setLoading(false);
  }

  async function loadData(tournamentId) {
    const { data: regs } = await supabase
      .from("registrations")
      .select("*, players(full_name)")
      .eq("tournament_id", tournamentId)
      .order("table_number", { ascending: true });
    const { data: elims } = await supabase
      .from("eliminations")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("undone", false);
    setRegistrations(regs || []);
    setEliminations(elims || []);
  }

  async function confirmElimination(reg, eliminatedByRegId) {
    const stillIn = registrations.filter(
      (r) => !eliminations.some((e) => e.registration_id === r.id)
    );
    const position = stillIn.length;
    await supabase.from("eliminations").insert({
      tournament_id: tournament.id,
      registration_id: reg.id,
      finish_position: position,
      eliminated_by: eliminatedByRegId || null,
    });
    setEliminatingReg(null);
    loadData(tournament.id);
  }

  if (loading) return <div className="p-6 text-felt-cream/60 font-body">Chargement…</div>;
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
            ? `Chef de table — Table${myTables.length > 1 ? "s" : ""} ${myTables.join(", ")}`
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
                <span className="font-medium">{reg.players?.full_name}</span>
                <span className="text-felt-cream/40 text-sm ml-2">
                  Table {reg.table_number} · Siège {reg.seat_number}
                </span>
              </div>
              <button
                onClick={() => setEliminatingReg(eliminatingReg === reg.id ? null : reg.id)}
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

function EliminationPicker({ candidates, onConfirm, onCancel }) {
  const [selected, setSelected] = useState("");
  return (
    <div className="mt-1 mb-2 ml-4 flex items-center gap-2 bg-felt-bg border border-felt-alert/30 rounded-md px-3 py-2">
      <span className="text-xs text-felt-cream/60">Éliminé par (optionnel) :</span>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="bg-felt-panel border border-felt-cream/10 rounded px-2 py-1 text-sm text-felt-cream"
      >
        <option value="">Aucun</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.players?.full_name}
          </option>
        ))}
      </select>
      <button
        onClick={() => onConfirm(selected || null)}
        className="text-xs px-3 py-1.5 bg-felt-alert/80 text-felt-cream rounded font-display"
      >
        Confirmer
      </button>
      <button onClick={onCancel} className="text-xs px-3 py-1.5 text-felt-cream/50 hover:text-felt-cream">
        Annuler
      </button>
    </div>
  );
}
