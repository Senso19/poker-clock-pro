import { useEffect, useRef, useState } from "react";
import { saveClubTheme } from "../lib/clubSettings.js";
import { clamp } from "../lib/format.js";
import { useTheme } from "../context/ThemeContext.jsx";
import { useEditMode } from "../context/EditModeContext.jsx";

/**
 * EditableButton — enveloppe un bouton pour le rendre personnalisable
 * individuellement (texte, couleur de fond, couleur de texte, et position
 * LIBRE à l'intérieur de sa carte) en mode personnalisation.
 *
 * Position libre : on maintient la poignée ⠿, on glisse n'importe où DANS
 * la carte (l'ancêtre le plus proche portant data-pcp-card), on relâche —
 * le bouton se positionne exactement là (en % de la carte, donc ça
 * s'adapte à la taille de l'écran). Comme le style est mémorisé par
 * "groupKey.id" (le RÔLE du bouton, ex. "tournament-card.open"), et non
 * par instance, ce déplacement s'applique automatiquement à TOUTES les
 * cartes du même type.
 *
 * Persisté dans club_settings.theme.buttonStyles[groupKey.id].
 */
export default function EditableButton({ groupKey, id, children, className, wrapperClassName, onClick, disabled, title, defaultOrder = 0 }) {
  const { theme, setTheme } = useTheme();
  const { isEditMode } = useEditMode();
  const [open, setOpen] = useState(false);
  const [dragPos, setDragPos] = useState(null); // {x,y} en % pendant le glisser, pour le suivi visuel
  const dragPosRef = useRef(null);
  const wrapperRef = useRef(null);

  const storeKey = `${groupKey}.${id}`;
  const style = theme.buttonStyles?.[storeKey] || {};
  const order = style.order ?? defaultOrder;
  const hasFreePosition = style.posX != null && style.posY != null;

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  async function persist(nextTheme) {
    await saveClubTheme(nextTheme);
  }

  function update(patch) {
    const nextStyle = { ...style, ...patch };
    const nextTheme = { ...theme, buttonStyles: { ...(theme.buttonStyles || {}), [storeKey]: nextStyle } };
    setTheme(nextTheme);
    persist(nextTheme);
  }


  function handlePointerDown(e) {
    e.preventDefault();
    e.stopPropagation();
    const card = wrapperRef.current?.closest("[data-pcp-card]");
    if (!card) return;
    const rect = card.getBoundingClientRect();

    function onMove(ev) {
      const x = clamp(((ev.clientX - rect.left) / rect.width) * 100, 0, 100);
      const y = clamp(((ev.clientY - rect.top) / rect.height) * 100, 0, 100);
      dragPosRef.current = { x, y };
      setDragPos({ x, y });
    }
    function onUp() {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragPos(null);
      if (dragPosRef.current) update({ posX: dragPosRef.current.x, posY: dragPosRef.current.y });
      dragPosRef.current = null;
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  const label = style.label || children;
  const btnStyle = {
    backgroundColor: style.transparent ? "transparent" : style.bgColor || undefined,
    color: style.textColor || undefined,
    borderColor: style.transparent ? style.borderColor || "transparent" : style.borderColor || style.bgColor || undefined,
    borderWidth: style.borderColor || style.transparent ? "1px" : undefined,
    borderStyle: style.borderColor || style.transparent ? "solid" : undefined,
    fontSize: style.fontSize ? `${style.fontSize}px` : undefined,
    paddingTop: style.paddingY != null ? `${style.paddingY}px` : undefined,
    paddingBottom: style.paddingY != null ? `${style.paddingY}px` : undefined,
    paddingLeft: style.paddingX != null ? `${style.paddingX}px` : undefined,
    paddingRight: style.paddingX != null ? `${style.paddingX}px` : undefined,
  };

  const livePos = dragPos || (hasFreePosition ? { x: style.posX, y: style.posY } : null);
  const wrapperStyle = livePos
    ? { position: "absolute", left: `${livePos.x}%`, top: `${livePos.y}%`, transform: "translate(-50%, -50%)", zIndex: 15 }
    : { order };

  return (
    <span
      ref={wrapperRef}
      className={`${wrapperClassName?.includes("w-full") ? "flex" : "inline-flex"} ${!livePos ? "relative" : ""} ${dragPos ? "opacity-80" : ""} ${!livePos ? wrapperClassName || "" : ""}`}
      style={wrapperStyle}
    >
      <span className={`relative ${wrapperClassName?.includes("w-full") ? "flex w-full" : "inline-flex"}`}>
        <button
          onClick={onClick}
          disabled={disabled}
          title={title}
          style={btnStyle}
          // Marque un bouton qui a SA propre couleur : la règle de panneau
          // "Fond des boutons" l'ignore alors, sinon son !important
          // écraserait le réglage individuel, pourtant plus précis.
          data-pcp-btn-custom={style.bgColor || style.textColor || style.transparent ? "" : undefined}
          className={className}
        >
          {label}
        </button>
        {isEditMode && (
          <>
            <button
              onPointerDown={handlePointerDown}
              title="Maintenir, glisser n'importe où dans la carte, relâcher pour positionner ce bouton (s'applique à toutes les cartes du même type)"
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
              <input type="color" value={style.bgColor || "#F77515"} onChange={(e) => update({ bgColor: e.target.value })} className="w-8 h-6 bg-transparent cursor-pointer" />
            </label>
            <label className="flex items-center justify-between mb-2">
              Texte
              <input type="color" value={style.textColor || "#14181C"} onChange={(e) => update({ textColor: e.target.value })} className="w-8 h-6 bg-transparent cursor-pointer" />
            </label>
            <label className="flex items-center justify-between mb-2">
              <span>Fond transparent</span>
              <input type="checkbox" checked={!!style.transparent} onChange={(e) => update({ transparent: e.target.checked })} />
            </label>
            <label className="flex items-center justify-between mb-2">
              Couleur du contour
              <input
                type="color"
                value={style.borderColor || "#F77515"}
                onChange={(e) => update({ borderColor: e.target.value })}
                className="w-8 h-6 bg-transparent cursor-pointer"
              />
            </label>
            {style.borderColor && (
              <button onClick={() => update({ borderColor: null })} className="w-full text-left text-felt-cream/40 hover:text-felt-cream mb-1">
                Retirer la couleur de contour
              </button>
            )}
            <label className="flex items-center justify-between mb-2">
              Taille du texte (px)
              <input
                type="number"
                value={style.fontSize || ""}
                placeholder="auto"
                onChange={(e) => update({ fontSize: Number(e.target.value) || null })}
                className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream placeholder:text-felt-cream/30"
              />
            </label>
            <label className="flex items-center justify-between mb-2">
              Taille verticale (hauteur, px)
              <input
                type="number"
                value={style.paddingY ?? ""}
                placeholder="auto"
                onChange={(e) => update({ paddingY: e.target.value === "" ? null : Number(e.target.value) })}
                className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream placeholder:text-felt-cream/30"
              />
            </label>
            <label className="flex items-center justify-between mb-2">
              Taille horizontale (largeur, px)
              <input
                type="number"
                value={style.paddingX ?? ""}
                placeholder="auto"
                onChange={(e) => update({ paddingX: e.target.value === "" ? null : Number(e.target.value) })}
                className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream placeholder:text-felt-cream/30"
              />
            </label>
            {hasFreePosition && (
              <button onClick={() => update({ posX: null, posY: null })} className="w-full text-left text-felt-cream/40 hover:text-felt-cream mb-1">
                Remettre à la position d'origine
              </button>
            )}
            <button
              onClick={() =>
                update({
                  label: null,
                  bgColor: null,
                  textColor: null,
                  borderColor: null,
                  transparent: null,
                  fontSize: null,
                  paddingX: null,
                  paddingY: null,
                  posX: null,
                  posY: null,
                })
              }
              className="w-full text-left text-felt-cream/40 hover:text-felt-cream"
            >
              Réinitialiser ce bouton
            </button>
          </div>
        )}
      </span>
    </span>
  );
}
