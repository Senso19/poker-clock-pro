import { useRef, useState } from "react";

/**
 * TableSeatingModal — fenêtre flottante et déplaçable montrant chaque table
 * sous forme de vrai plateau ovale avec les sièges positionnés tout autour,
 * pseudo du joueur affiché sur chaque siège. Les joueurs peuvent être
 * déplacés d'un siège à l'autre par glisser-déposer, éliminés, et leur
 * stack modifié, directement depuis cette vue.
 *
 * Ne se ferme QUE via la croix (pas de clic à l'extérieur), et se déplace
 * en glissant l'en-tête — utile pour la positionner sur un second écran si
 * la fenêtre du navigateur s'étend sur plusieurs moniteurs (déplacer la
 * fenêtre du navigateur elle-même reste nécessaire, une page web ne peut
 * pas s'extraire de son onglet).
 */
export default function TableSeatingModal({
  registrations,
  eliminatedIds,
  playersPerTable,
  onRepair,
  onClose,
  onMoveSeat,
  onEliminate,
  onUpdateStack,
}) {
  const [repairing, setRepairing] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);
  const [editingStackId, setEditingStackId] = useState(null);
  const [stackDraft, setStackDraft] = useState("");

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

  function handleHeaderPointerDown(e) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handleHeaderPointerMove(e) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPos({ x: dragRef.current.origX + dx, y: dragRef.current.origY + dy });
  }
  function handleHeaderPointerUp() {
    dragRef.current = null;
  }

  function handlePlayerPointerDown(e, regId) {
    e.preventDefault();
    e.stopPropagation();
    function onUp(ev) {
      window.removeEventListener("pointerup", onUp);
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const seatEl = el?.closest("[data-seat-table][data-seat-number]");
      if (seatEl) {
        onMoveSeat(regId, Number(seatEl.getAttribute("data-seat-table")), Number(seatEl.getAttribute("data-seat-number")));
      }
    }
    window.addEventListener("pointerup", onUp);
  }

  function playerLabel(r) {
    return r.players?.pseudo || r.accounts?.pseudo || r.players?.full_name || "?";
  }

  function startEditStack(r) {
    setEditingStackId(r.id);
    setStackDraft(String(r.stack ?? 0));
  }
  function commitStack(r) {
    const val = Math.max(0, Number(stackDraft) || 0);
    setEditingStackId(null);
    onUpdateStack(r.id, val);
  }

  function seatStyle(index, total) {
    const angle = (index / total) * 2 * Math.PI - Math.PI / 2;
    const rx = 40;
    const ry = 38;
    return {
      left: `${50 + rx * Math.cos(angle)}%`,
      top: `${50 + ry * Math.sin(angle)}%`,
      transform: "translate(-50%, -50%)",
    };
  }

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      <div
        style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}
        className="absolute top-8 left-1/2 -translate-x-1/2 pointer-events-auto bg-felt-panel border border-felt-gold/30 rounded-lg shadow-2xl w-[min(96vw,1400px)] max-h-[90vh] flex flex-col"
      >
        <div
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerUp}
          className="flex items-center justify-between px-5 py-3 border-b border-felt-cream/10 cursor-move select-none shrink-0"
        >
          <div className="font-display text-xl text-felt-cream">⠿ Vue des tables</div>
          <button onClick={onClose} className="text-felt-cream/50 hover:text-felt-cream px-2">
            ✕
          </button>
        </div>

        <div className="overflow-y-auto p-5 font-body text-felt-cream">
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

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
            {tables.map((table) => (
              <div key={table}>
                <div className="font-display text-base text-felt-gold mb-2">Table {table}</div>
                <div className="relative w-full aspect-[4/3] bg-felt-bg rounded-lg">
                  {/* Le plateau ovale */}
                  <div className="absolute inset-[18%] bg-emerald-950/60 border-2 border-felt-gold/20 rounded-[50%]" />
                  {Array.from({ length: perTable }, (_, i) => i + 1).map((seat, i) => {
                    const key = `${table}-${seat}`;
                    const occupants = bySeat[key] || [];
                    const active = occupants.filter((r) => !eliminatedIds.has(r.id));
                    const isDuplicate = duplicates.has(key);
                    const r = active[0] || occupants[0];
                    const isOut = r && eliminatedIds.has(r.id);
                    return (
                      <div
                        key={seat}
                        style={seatStyle(i, perTable)}
                        data-seat-table={table}
                        data-seat-number={seat}
                        className={`absolute w-[86px] rounded-md px-1.5 py-1 text-[11px] border text-center ${
                          isDuplicate
                            ? "bg-felt-alert/20 border-felt-alert/60"
                            : r
                            ? isOut
                              ? "bg-felt-bg border-felt-cream/10 text-felt-cream/30"
                              : "bg-felt-gold/10 border-felt-gold/40"
                            : "bg-felt-panel border-felt-cream/10 text-felt-cream/30 border-dashed"
                        }`}
                      >
                        <div className="text-felt-cream/40 text-[9px] leading-tight">S{seat}</div>
                        {r ? (
                          <div
                            onPointerDown={(e) => !isOut && handlePlayerPointerDown(e, r.id)}
                            style={{ touchAction: isOut ? undefined : "none" }}
                            className={`truncate font-medium ${isOut ? "line-through" : "cursor-grab"}`}
                            title={playerLabel(r)}
                          >
                            {playerLabel(r)}
                          </div>
                        ) : (
                          <div className="truncate leading-tight">Libre</div>
                        )}
                        {r && !isOut && (
                          <>
                            {editingStackId === r.id ? (
                              <input
                                autoFocus
                                type="number"
                                value={stackDraft}
                                onChange={(e) => setStackDraft(e.target.value)}
                                onBlur={() => commitStack(r)}
                                onKeyDown={(e) => e.key === "Enter" && commitStack(r)}
                                className="w-full mt-0.5 bg-felt-bg border border-felt-gold/40 rounded px-1 text-[10px] text-felt-cream text-center"
                              />
                            ) : (
                              <button onClick={() => startEditStack(r)} className="block w-full text-felt-cream/60 underline decoration-dotted text-[10px] mt-0.5">
                                {(r.stack ?? 0).toLocaleString()}
                              </button>
                            )}
                            <button
                              onClick={() => onEliminate(r)}
                              title="Éliminer"
                              className="mt-0.5 text-[9px] text-felt-alert/70 hover:text-felt-alert"
                            >
                              ✕ Éliminer
                            </button>
                          </>
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
    </div>
  );
}
