import { useState } from "react";

/**
 * TableSeatingModal — vue d'ensemble en lecture seule de toutes les tables
 * et de leurs sièges, avec le joueur assis à chaque place (ou "Libre").
 * Un siège n'est considéré en conflit que si PLUSIEURS joueurs ENCORE EN
 * JEU s'y retrouvent en même temps — un éliminé affiché au même siège
 * qu'un joueur actif n'est pas une anomalie (il a juste laissé sa place).
 */
export default function TableSeatingModal({ registrations, eliminatedIds, playersPerTable, onRepair, onClose }) {
  const [repairing, setRepairing] = useState(false);
  const perTable = playersPerTable || 9;
  const maxTable = Math.max(1, ...registrations.map((r) => r.table_number || 1));
  const tables = Array.from({ length: maxTable }, (_, i) => i + 1);

  const bySeat = {};
  registrations.forEach((r) => {
    const key = `${r.table_number}-${r.seat_number}`;
    if (!bySeat[key]) bySeat[key] = [];
    bySeat[key].push(r);
  });
  const duplicates = new Set(
    Object.keys(bySeat).filter((k) => bySeat[k].filter((r) => !eliminatedIds.has(r.id)).length > 1)
  );

  async function handleRepair() {
    setRepairing(true);
    await onRepair();
    setRepairing(false);
  }

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-5xl p-6 font-body text-felt-cream max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="font-display text-xl">Vue des tables</div>
          <button onClick={onClose} className="text-felt-cream/50 hover:text-felt-cream">
            ✕
          </button>
        </div>

        {duplicates.size > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm mb-4 bg-felt-alert/10 border border-felt-alert/30 rounded-md px-3 py-2.5">
            <span className="text-felt-alert">
              ⚠ {duplicates.size} siège(s) partagé(s) par plusieurs joueurs encore en jeu à la fois (signalés en
              rouge).
            </span>
            <button
              onClick={handleRepair}
              disabled={repairing}
              className="px-3 py-1.5 bg-felt-alert/80 text-felt-cream rounded-md font-display text-xs disabled:opacity-40 shrink-0"
            >
              {repairing ? "Réparation…" : "🔧 Réparer automatiquement"}
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
          {tables.map((table) => (
            <div key={table} className="bg-felt-bg border border-felt-cream/10 rounded-lg p-4">
              <div className="font-display text-lg text-felt-gold mb-3">Table {table}</div>
              <div className="grid grid-cols-3 gap-2">
                {Array.from({ length: perTable }, (_, i) => i + 1).map((seat) => {
                  const key = `${table}-${seat}`;
                  const occupants = bySeat[key] || [];
                  const isDuplicate = duplicates.has(key);
                  const active = occupants.filter((r) => !eliminatedIds.has(r.id));
                  const isFullyOut = occupants.length > 0 && active.length === 0;
                  return (
                    <div
                      key={seat}
                      className={`rounded-md px-2 py-2 text-xs border min-h-[52px] ${
                        isDuplicate
                          ? "bg-felt-alert/15 border-felt-alert/50"
                          : occupants.length > 0
                          ? isFullyOut
                            ? "bg-felt-bg border-felt-cream/10 text-felt-cream/30"
                            : "bg-felt-gold/10 border-felt-gold/30"
                          : "bg-felt-panel border-felt-cream/10 text-felt-cream/30"
                      }`}
                    >
                      <div className="text-felt-cream/40">S{seat}</div>
                      {occupants.length === 0 ? (
                        <div className="truncate">Libre</div>
                      ) : (
                        occupants.map((r) => (
                          <div key={r.id} className={`truncate ${eliminatedIds.has(r.id) ? "line-through text-felt-cream/30" : ""}`}>
                            {r.players?.full_name}
                          </div>
                        ))
                      )}
                    </div>
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
