import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useTheme } from "../context/ThemeContext.jsx";
import { useEditMode } from "../context/EditModeContext.jsx";

/**
 * EditableButton — enveloppe un bouton pour le rendre personnalisable
 * individuellement (texte, couleur de fond, couleur de texte, position)
 * en mode personnalisation, au même titre que CustomizablePanel pour les
 * tableaux. Persisté dans club_settings.theme.buttonStyles[groupKey.id].
 *
 * Le déplacement utilise les Pointer Events (et non le drag-and-drop HTML5
 * natif, qui ne fonctionne pas du tout sur écrans tactiles) : on maintient
 * la poignée ⠿, on glisse, et on relâche sur un autre bouton du même
 * groupe pour échanger leur place — ça marche à la souris comme au doigt.
 */
export default function EditableButton({ groupKey, id, children, className, onClick, disabled, defaultOrder = 0 }) {
  const { theme, setTheme } = useTheme();
  const { isEditMode } = useEditMode();
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragInfo = useRef(null);

  const storeKey = `${groupKey}.${id}`;
  const style = theme.buttonStyles?.[storeKey] || {};
  const order = style.order ?? defaultOrder;

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  async function persist(nextTheme) {
    const { data: existing } = await supabase.from("club_settings").select("id").limit(1).maybeSingle();
    const payload = { club_name: "19PokerClub", theme: nextTheme };
    if (existing) await supabase.from("club_settings").update(payload).eq("id", existing.id);
    else await supabase.from("club_settings").insert(payload);
  }

  function update(patch) {
    const nextStyle = { ...style, ...patch };
    const nextTheme = { ...theme, buttonStyles: { ...(theme.buttonStyles || {}), [storeKey]: nextStyle } };
    setTheme(nextTheme);
    persist(nextTheme);
  }

  function swapWith(targetStoreKey) {
    if (!targetStoreKey || targetStoreKey === storeKey) return;
    const targetStyle = theme.buttonStyles?.[targetStoreKey] || {};
    const targetOrder = targetStyle.order ?? 0;
    const nextButtonStyles = {
      ...(theme.buttonStyles || {}),
      [storeKey]: { ...style, order: targetOrder },
      [targetStoreKey]: { ...targetStyle, order },
    };
    const nextTheme = { ...theme, buttonStyles: nextButtonStyles };
    setTheme(nextTheme);
    persist(nextTheme);
  }

  function handlePointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    dragInfo.current = { startX: e.clientX, startY: e.clientY };
    setDragging(true);
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }
  function handlePointerMove() {
    // Pas de fantôme visuel pour rester simple — juste le repérage à la
    // fin, comme un glisser physique de puce.
  }
  function handlePointerUp(e) {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", handlePointerUp);
    setDragging(false);
    dragInfo.current = null;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const targetEl = el?.closest(`[data-pcp-btn-group="${groupKey}"]`);
    if (targetEl) swapWith(targetEl.getAttribute("data-pcp-btn-key"));
  }

  const label = style.label || children;
  const btnStyle = {
    order,
    backgroundColor: style.bgColor || undefined,
    color: style.textColor || undefined,
    borderColor: style.bgColor || undefined,
  };

  return (
    <span
      data-pcp-btn-group={groupKey}
      data-pcp-btn-key={storeKey}
      className={`relative inline-flex ${dragging ? "opacity-60" : ""}`}
      style={{ order }}
    >
      <button onClick={onClick} disabled={disabled} style={btnStyle} className={className}>
        {label}
      </button>
      {isEditMode && (
        <>
          <button
            onPointerDown={handlePointerDown}
            title="Maintenir, glisser sur un autre bouton du même groupe, relâcher pour échanger leur place"
            onClick={(e) => e.stopPropagation()}
            style={{ touchAction: "none" }}
            className="absolute -top-2 -left-2 w-4 h-4 rounded-full bg-felt-bg border border-felt-gold/50 text-felt-gold text-[9px] flex items-center justify-center cursor-move z-10"
          >
            ⠿
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            title="Personnaliser ce bouton"
            className="absolute -top-2 -right-2 w-4 h-4 rounded-full bg-felt-gold text-felt-bg text-[9px] flex items-center justify-center z-10"
          >
            🎨
          </button>
        </>
      )}
      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-6 left-0 z-30 bg-felt-bg border border-felt-gold/40 rounded-md p-3 w-56 text-xs text-felt-cream shadow-lg"
        >
          <label className="block mb-2">
            Texte du bouton
            <input
              type="text"
              value={style.label ?? ""}
              placeholder={typeof children === "string" ? children : ""}
              onChange={(e) => update({ label: e.target.value || null })}
              className="w-full mt-1 bg-felt-panel border border-felt-cream/10 rounded px-2 py-1 text-felt-cream placeholder:text-felt-cream/30"
            />
          </label>
          <label className="flex items-center justify-between mb-2">
            Fond
            <input type="color" value={style.bgColor || "#C9A15A"} onChange={(e) => update({ bgColor: e.target.value })} className="w-8 h-6 bg-transparent cursor-pointer" />
          </label>
          <label className="flex items-center justify-between mb-2">
            Texte
            <input type="color" value={style.textColor || "#14181C"} onChange={(e) => update({ textColor: e.target.value })} className="w-8 h-6 bg-transparent cursor-pointer" />
          </label>
          <button
            onClick={() => update({ label: null, bgColor: null, textColor: null })}
            className="w-full text-left text-felt-cream/40 hover:text-felt-cream"
          >
            Réinitialiser ce bouton
          </button>
        </div>
      )}
    </span>
  );
}
