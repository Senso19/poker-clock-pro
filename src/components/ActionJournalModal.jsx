import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { fetchEvents, markEventUndone } from "../lib/events.js";
import { useConfirm } from "../context/ConfirmContext.jsx";

const TYPE_ICON = {
  register: "➕👤",
  elimination: "👤",
  create: "➕",
};

// Types que l'on sait défaire proprement. "create" (création du tournoi)
// n'est volontairement pas réversible depuis ce journal.
const UNDOABLE_TYPES = ["register", "elimination"];

/**
 * ActionJournalModal — "Journal de tournoi" façon BlindValet : liste de
 * toutes les actions effectuées, avec la possibilité d'annuler chacune
 * individuellement (pas seulement la dernière).
 */
export default function ActionJournalModal({ tournamentId, playersPerTable, onClose, onChanged }) {
  const confirmAction = useConfirm();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [undoingId, setUndoingId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      setEvents(await fetchEvents(tournamentId));
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  // Si le siège d'origine du joueur qu'on ré-active a été repris par
  // quelqu'un d'autre entre-temps (rééquilibrage, autre inscription...),
  // on le replace automatiquement sur le prochain siège libre au lieu de
  // créer un doublon.
  async function reseatIfConflict(registrationId) {
    const { data: allRegs } = await supabase
      .from("registrations")
      .select("id, table_number, seat_number")
      .eq("tournament_id", tournamentId);
    const { data: elims } = await supabase
      .from("eliminations")
      .select("registration_id")
      .eq("tournament_id", tournamentId)
      .eq("undone", false);
    const eliminatedSet = new Set((elims || []).map((e) => e.registration_id));
    const me = (allRegs || []).find((r) => r.id === registrationId);
    if (!me) return;
    const conflict = (allRegs || []).some(
      (r) =>
        r.id !== registrationId &&
        !eliminatedSet.has(r.id) &&
        r.table_number === me.table_number &&
        r.seat_number === me.seat_number
    );
    if (!conflict) return;

    const perTable = playersPerTable || 9;
    const occupied = new Set(
      (allRegs || [])
        .filter((r) => r.id !== registrationId && !eliminatedSet.has(r.id))
        .map((r) => `${r.table_number}-${r.seat_number}`)
    );
    let table = 1;
    let found = null;
    while (table < 1000 && !found) {
      for (let seat = 1; seat <= perTable; seat++) {
        const key = `${table}-${seat}`;
        if (!occupied.has(key)) {
          found = { table, seat };
          break;
        }
      }
      table += 1;
    }
    if (found) {
      await supabase.from("registrations").update({ table_number: found.table, seat_number: found.seat }).eq("id", registrationId);
    }
  }

  async function handleUndo(ev) {
    if (!(await confirmAction("Annuler cette action ?"))) return;
    setUndoingId(ev.id);
    setError(null);
    try {
      if (ev.type === "register" && ev.payload?.registrationId) {
        // On retire d'abord une éventuelle élimination liée, pour ne pas
        // laisser de ligne orpheline, puis l'inscription elle-même.
        await supabase.from("eliminations").delete().eq("registration_id", ev.payload.registrationId);
        await supabase.from("registrations").delete().eq("id", ev.payload.registrationId);
      } else if (ev.type === "elimination" && ev.payload?.eliminationId) {
        await supabase.from("eliminations").delete().eq("id", ev.payload.eliminationId);
        if (ev.payload.registrationId) {
          await reseatIfConflict(ev.payload.registrationId);
        }
      }
      await markEventUndone(ev.id);
      await load();
      onChanged?.();
    } catch (e) {
      setError(e.message);
    }
    setUndoingId(null);
  }

  function formatTime(iso) {
    return new Date(iso).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-lg font-body text-felt-cream max-h-[85vh] flex flex-col">
        <div className="px-6 py-5">
          <div className="font-display text-lg">Journal de tournoi</div>
        </div>

        {error && <div className="px-6 text-felt-alert text-sm mb-2">Erreur : {error}</div>}

        <div className="flex-1 overflow-y-auto px-6">
          {loading ? (
            <div className="text-felt-cream/50 text-sm pb-4">Chargement…</div>
          ) : events.length === 0 ? (
            <div className="text-felt-cream/50 text-sm pb-4">Aucune action enregistrée pour ce tournoi.</div>
          ) : (
            <div className="border border-felt-cream/10 rounded-md overflow-hidden mb-2">
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-3 py-2 text-xs uppercase tracking-wide text-felt-cream/40 border-b border-felt-cream/10">
                <div>Événement</div>
                <div>Temps</div>
                <div></div>
              </div>
              {events.map((ev) => (
                <div
                  key={ev.id}
                  className={`grid grid-cols-[1fr_auto_auto] gap-3 items-center px-3 py-2.5 border-b border-felt-cream/5 text-sm ${
                    ev.undone ? "opacity-40" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="shrink-0">{TYPE_ICON[ev.type] || "•"}</span>
                    <span className="truncate">
                      {ev.type === "register" && "Register: "}
                      {ev.type === "elimination" && "Elimination: "}
                      {ev.type === "create" && "Créer Tournoi"}
                      {ev.type !== "create" && ev.description}
                    </span>
                  </div>
                  <div className="text-felt-cream/40 text-xs whitespace-nowrap">{formatTime(ev.created_at)}</div>
                  <div>
                    {UNDOABLE_TYPES.includes(ev.type) && !ev.undone && (
                      <button
                        onClick={() => handleUndo(ev)}
                        disabled={undoingId === ev.id}
                        title="Annuler cette action"
                        className="text-felt-gold/80 hover:text-felt-gold disabled:opacity-40"
                      >
                        ↩
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-6 py-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-felt-cream/60 hover:text-felt-cream">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
