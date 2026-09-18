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
  // Zoom du contenu et taille de la fenêtre, réglables : selon le nombre
  // de tables on veut soit tout voir d'un coup, soit grossir un plateau
  // pour le lire de loin. null = taille automatique d'origine.
  const [zoom, setZoom] = useState(1);
  const [size, setSize] = useState(null);
  const resizeRef = useRef(null);

  const perTable = playersPerTable || 9;
  // Un joueur éliminé ne tient plus son siège : sa place redevient libre,
  // exactement comme dans l'onglet Tables et comme dans les calculs
  // d'équilibrage. Cet écran était le dernier à le montrer encore assis,
  // le nom barré — or ce siège est justement celui qu'on peut
  // réattribuer, et les tables entièrement vidées n'ont plus lieu d'être
  // affichées.
  const enJeu = registrations.filter((r) => !eliminatedIds.has(r.id));
  const maxTable = Math.max(1, ...enJeu.map((r) => r.table_number || 1));
  const tables = Array.from({ length: maxTable }, (_, i) => i + 1);

  const bySeat = {};
  enJeu.forEach((r) => {
    const key = `${r.table_number}-${r.seat_number}`;
    if (!bySeat[key]) bySeat[key] = [];
    bySeat[key].push(r);
  });
  const duplicates = new Set(Object.keys(bySeat).filter((k) => bySeat[k].length > 1));

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

  function handleResizePointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget.closest("[data-seating-window]");
    if (!el) return;
    const r = el.getBoundingClientRect();
    resizeRef.current = { startX: e.clientX, startY: e.clientY, w: r.width, h: r.height };
    function onMove(ev) {
      const { startX, startY, w, h } = resizeRef.current;
      setSize({
        w: Math.max(420, Math.round(w + (ev.clientX - startX))),
        h: Math.max(280, Math.round(h + (ev.clientY - startY))),
      });
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      resizeRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
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
        data-seating-window
        style={{
          transform: `translate(${pos.x}px, ${pos.y}px)`,
          ...(size ? { width: size.w, height: size.h, maxHeight: "none" } : {}),
        }}
        className="absolute top-8 left-1/2 -translate-x-1/2 pointer-events-auto bg-felt-panel border border-felt-gold/30 rounded-lg shadow-2xl w-[min(96vw,1400px)] max-h-[90vh] flex flex-col"
      >
        <div
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerUp}
          className="flex items-center justify-between px-5 py-3 border-b border-felt-cream/10 cursor-move select-none shrink-0"
        >
          <div className="font-display text-xl text-felt-cream">⠿ Vue des tables</div>
          <div onPointerDown={(e) => e.stopPropagation()} className="flex items-center gap-1 ml-auto mr-3 text-sm">
            <button
              onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.1) * 10) / 10))}
              title="Réduire"
              className="w-7 h-7 rounded bg-felt-bg border border-felt-cream/10 text-felt-cream/70 hover:text-felt-cream"
            >
              −
            </button>
            <button
              onClick={() => {
                setZoom(1);
                setSize(null);
              }}
              title="Taille et zoom d'origine"
              className="px-2 h-7 rounded bg-felt-bg border border-felt-cream/10 text-xs text-felt-cream/70 hover:text-felt-cream tabular-nums"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              onClick={() => setZoom((z) => Math.min(2, Math.round((z + 0.1) * 10) / 10))}
              title="Agrandir"
              className="w-7 h-7 rounded bg-felt-bg border border-felt-cream/10 text-felt-cream/70 hover:text-felt-cream"
            >
              +
            </button>
          </div>
          <button onPointerDown={(e) => e.stopPropagation()} onClick={onClose} className="text-felt-cream/50 hover:text-felt-cream px-2">
            ✕
          </button>
        </div>

        {/* zoom CSS plutôt qu'une mise à l'échelle par transform : le
            contenu se réagence vraiment (les plateaux se replacent en
            colonnes), au lieu d'être étiré et de déborder. */}
        <div style={{ zoom }} className="flex-1 min-h-0 overflow-y-auto p-5 font-body text-felt-cream">
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
                    const isDuplicate = duplicates.has(key);
                    const r = occupants[0];
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
                            ? "bg-felt-gold/10 border-felt-gold/40"
                            : "bg-felt-panel border-felt-cream/10 text-felt-cream/30 border-dashed"
                        }`}
                      >
                        <div className="text-felt-cream/40 text-[9px] leading-tight">S{seat}</div>
                        {r ? (
                          <div
                            onPointerDown={(e) => handlePlayerPointerDown(e, r.id)}
                            style={{ touchAction: "none" }}
                            className="truncate font-medium cursor-grab"
                            title={playerLabel(r)}
                          >
                            {playerLabel(r)}
                          </div>
                        ) : (
                          <div className="truncate leading-tight">Libre</div>
                        )}
                        {r && (
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

        {/* Poignée de redimensionnement, coin bas-droit. */}
        <div
          onPointerDown={handleResizePointerDown}
          title="Redimensionner la fenêtre"
          style={{ touchAction: "none" }}
          className="absolute -bottom-1 -right-1 w-5 h-5 cursor-nwse-resize text-felt-gold/60 hover:text-felt-gold flex items-end justify-end pr-1 pb-0.5 select-none"
        >
          ◢
        </div>
      </div>
    </div>
  );
}
