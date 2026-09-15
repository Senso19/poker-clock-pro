import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useTheme } from "../context/ThemeContext.jsx";
import { useEditMode } from "../context/EditModeContext.jsx";

/**
 * EditableButton — enveloppe un bouton pour le rendre personnalisable
 * individuellement (texte, couleur de fond, couleur de texte, position)
 * en mode personnalisation, au même titre que CustomizablePanel pour les
 * tableaux. Persisté dans club_settings.theme.buttonStyles[groupKey.id].
 *
 * - groupKey : identifiant du groupe de boutons (ex. "tournaments-toolbar")
 *   — la position ne peut être échangée qu'entre boutons du même groupe.
 * - id : identifiant stable de CE bouton dans le groupe.
 * - children : le texte/contenu par défaut du bouton.
 * - className : classes de base (mise en forme, indépendantes du style
 *   personnalisé qui vient s'ajouter par-dessus).
 */
export default function EditableButton({ groupKey, id, children, className, onClick, disabled, defaultOrder = 0 }) {
  const { theme, setTheme } = useTheme();
  const { isEditMode } = useEditMode();
  const [open, setOpen] = useState(false);
  const [dragOver, setDragOver] = useState(false);

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

  function handleDragStart(e) {
    e.stopPropagation();
    e.dataTransfer.setData("text/plain", `${groupKey}|${storeKey}|${order}`);
    e.dataTransfer.effectAllowed = "move";
  }
  function handleDragOver(e) {
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }
  function handleDragLeave() {
    setDragOver(false);
  }
  function handleDrop(e) {
    if (!isEditMode) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const data = e.dataTransfer.getData("text/plain");
    if (!data) return;
    const [sourceGroup, sourceKey, sourceOrderStr] = data.split("|");
    if (sourceGroup !== groupKey || sourceKey === storeKey) return;
    const sourceOrder = Number(sourceOrderStr);
    const nextButtonStyles = {
      ...(theme.buttonStyles || {}),
      [storeKey]: { ...(theme.buttonStyles?.[storeKey] || {}), order: sourceOrder },
      [sourceKey]: { ...(theme.buttonStyles?.[sourceKey] || {}), order },
    };
    const nextTheme = { ...theme, buttonStyles: nextButtonStyles };
    setTheme(nextTheme);
    persist(nextTheme);
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
      className={`relative inline-flex ${dragOver ? "ring-2 ring-felt-gold rounded-full" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{ order }}
    >
      <button onClick={onClick} disabled={disabled} style={btnStyle} className={className}>
        {label}
      </button>
      {isEditMode && (
        <>
          <button
            draggable
            onDragStart={handleDragStart}
            title="Glisser sur un autre bouton du même groupe pour échanger leur place"
            onClick={(e) => e.stopPropagation()}
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
