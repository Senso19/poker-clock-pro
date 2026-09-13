import { useMemo } from "react";

/**
 * SeatPickerModal — visualisation des tables/sièges disponibles pour
 * déplacer un joueur manuellement : grille table x siège, places occupées
 * grisées avec le nom du joueur, places libres cliquables.
 */
export default function SeatPickerModal({ registrations, eliminatedIds, playersPerTable, currentReg, onSelect, onClose }) {
  const perTable = playersPerTable || 9;
  const maxTable = Math.max(1, ...registrations.map((r) => r.table_number || 1));
  const tables = Array.from({ length: maxTable + 1 }, (_, i) => i + 1);

  const occupied = useMemo(() => {
    const map = {};
    registrations.forEach((r) => {
      if (eliminatedIds.has(r.id)) return;
      if (r.id === currentReg.id) return;
      map[`${r.table_number}-${r.seat_number}`] = r;
    });
    return map;
  }, [registrations, eliminatedIds, currentReg.id]);

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-lg p-5 font-body text-felt-cream max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <div className="font-display text-lg">Choisir une place</div>
          <button onClick={onClose} className="text-felt-cream/50 hover:text-felt-cream">✕</button>
        </div>
        <div className="text-xs text-felt-cream/40 mb-4">
          Déplacer {currentReg.players?.full_name} — table {currentReg.table_number} · siège {currentReg.seat_number} actuellement.
        </div>

        <div className="space-y-4">
          {tables.map((table) => (
            <div key={table}>
              <div className="text-xs text-felt-cream/40 uppercase tracking-wide mb-1.5">Table {table}</div>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {Array.from({ length: perTable }, (_, i) => i + 1).map((seat) => {
                  const occ = occupied[`${table}-${seat}`];
                  const isCurrent = table === currentReg.table_number && seat === currentReg.seat_number;
                  return (
                    <button
                      key={seat}
                      disabled={!!occ}
                      onClick={() => onSelect(table, seat)}
                      className={`px-2 py-2 rounded-md text-xs text-left border ${
                        occ
                          ? "bg-felt-bg/40 border-felt-cream/5 text-felt-cream/30 cursor-not-allowed"
                          : isCurrent
                          ? "bg-felt-gold/15 border-felt-gold/60 text-felt-gold"
                          : "bg-felt-bg border-felt-gold/30 text-felt-cream hover:bg-felt-gold/10"
                      }`}
                    >
                      <div className="text-felt-gold/70">S{seat}</div>
                      <div className="truncate">{occ ? occ.players?.full_name : isCurrent ? "Actuel" : "Libre"}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
