import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useTheme } from "../context/ThemeContext.jsx";
import { useEditMode } from "../context/EditModeContext.jsx";

/**
 * CustomizablePanel — enveloppe générique et réutilisable pour rendre
 * N'IMPORTE QUEL tableau/panneau de l'app personnalisable par l'admin :
 * largeur, couleur de fond, couleur de texte, couleur des cellules, ET
 * position (glisser la poignée ⠿ sur un autre tableau pour échanger leur
 * ordre). Le réglage se fait via une icône 🎨 qui n'apparaît qu'en "mode
 * personnalisation" (activé par l'admin via le bouton flottant en bas à
 * droite), et est mémorisé par panelKey dans club_settings.theme.
 *
 * Les enfants peuvent utiliser les variables CSS --pcp-cell-bg et
 * --pcp-cell-text pour que leurs propres cellules/champs suivent la
 * couleur de cellule choisie (voir StructureEditor / TournamentDetail).
 */
export default function CustomizablePanel({ panelKey, defaultWidth = "1 1 0%", defaultOrder = 0, className, children }) {
  const { theme, setTheme } = useTheme();
  const { isEditMode } = useEditMode();
  const [open, setOpen] = useState(false);

  // Ferme le popover de réglages dès qu'on clique ailleurs sur la page.
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const [dragOver, setDragOver] = useState(false);
  const style = theme.panelStyles?.[panelKey] || {};
  const order = style.order ?? defaultOrder;

  async function persist(nextTheme) {
    const { data: existing } = await supabase.from("club_settings").select("id").limit(1).maybeSingle();
    const payload = { club_name: "19PokerClub", theme: nextTheme };
    if (existing) await supabase.from("club_settings").update(payload).eq("id", existing.id);
    else await supabase.from("club_settings").insert(payload);
  }

  function update(patch) {
    const nextStyle = { ...style, ...patch };
    const nextTheme = { ...theme, panelStyles: { ...(theme.panelStyles || {}), [panelKey]: nextStyle } };
    setTheme(nextTheme);
    persist(nextTheme);
  }

  function handleDragStart(e) {
    e.dataTransfer.setData("text/plain", `${panelKey}|${order}`);
    e.dataTransfer.effectAllowed = "move";
  }
  function handleDragOver(e) {
    if (!isEditMode) return;
    e.preventDefault();
    setDragOver(true);
  }
  function handleDragLeave() {
    setDragOver(false);
  }
  function handleDrop(e) {
    if (!isEditMode) return;
    e.preventDefault();
    setDragOver(false);
    const data = e.dataTransfer.getData("text/plain");
    if (!data) return;
    const [sourceKey, sourceOrderStr] = data.split("|");
    if (!sourceKey || sourceKey === panelKey) return;
    const sourceOrder = Number(sourceOrderStr);
    const nextPanelStyles = {
      ...(theme.panelStyles || {}),
      [panelKey]: { ...(theme.panelStyles?.[panelKey] || {}), order: sourceOrder },
      [sourceKey]: { ...(theme.panelStyles?.[sourceKey] || {}), order },
    };
    const nextTheme = { ...theme, panelStyles: nextPanelStyles };
    setTheme(nextTheme);
    persist(nextTheme);
  }

  const flexBasis = style.width ? `0 0 ${style.width}` : defaultWidth;
  const panelDomId = `pcp-${panelKey.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <div
      id={panelDomId}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        flex: flexBasis,
        width: style.width || undefined,
        maxWidth: style.width || undefined,
        order,
        minWidth: 0,
        backgroundColor: style.bgColor || theme.panelBgColor || undefined,
        color: style.textColor || undefined,
        "--pcp-cell-bg": style.cellBgColor || undefined,
        "--pcp-cell-text": style.cellTextColor || undefined,
        "--pcp-card-text-size": style.cardTextSize ? `${style.cardTextSize}px` : undefined,
        "--pcp-card-text-color": style.cardTextColor || undefined,
        gridTemplateColumns: style.cardWidth ? `repeat(auto-fill, minmax(${style.cardWidth}px, 1fr))` : undefined,
        gridAutoRows: style.cardHeight ? `${style.cardHeight}px` : undefined,
      }}
      className={`relative ${dragOver ? "ring-2 ring-felt-gold" : ""} ${className || ""}`}
    >
      {(style.cardTextSize || style.textAlign) && (
        <style>
          {`#${panelDomId} *{${style.cardTextSize ? `font-size:${style.cardTextSize}px !important;` : ""}${
            style.textAlign ? `text-align:${style.textAlign} !important;` : ""
          }}`}
        </style>
      )}
      {isEditMode && (
        <div className="absolute top-3 right-3 z-20 flex gap-2">
          <button
            draggable
            onDragStart={handleDragStart}
            title="Glisser sur un autre tableau pour échanger leur place"
            className="w-8 h-8 rounded-md bg-felt-bg border border-felt-gold/40 text-felt-gold flex items-center justify-center text-sm shadow cursor-move"
          >
            ⠿
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen((v) => !v);
            }}
            title="Personnaliser ce tableau"
            className="w-8 h-8 rounded-md bg-felt-gold text-felt-bg flex items-center justify-center text-sm shadow"
          >
            🎨
          </button>
        </div>
      )}
      {open && <PanelStyleEditor style={style} onChange={update} onClose={() => setOpen(false)} />}
      {children}
    </div>
  );
}

function PanelStyleEditor({ style, onChange, onClose }) {
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-12 right-3 z-30 bg-felt-bg border border-felt-gold/40 rounded-md p-3 w-64 text-xs text-felt-cream shadow-lg max-h-96 overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-display">Personnaliser ce tableau</span>
        <button onClick={onClose} className="text-felt-cream/40 hover:text-felt-cream">
          ✕
        </button>
      </div>
      <label className="flex items-center justify-between mb-2">
        Largeur (ex : 50%, 400px)
        <input
          type="text"
          value={style.width || ""}
          placeholder="auto"
          onChange={(e) => onChange({ width: e.target.value || null })}
          className="w-24 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream placeholder:text-felt-cream/30"
        />
      </label>
      <label className="flex items-center justify-between mb-2">
        Fond du tableau
        <input
          type="color"
          value={style.bgColor || "#1B2027"}
          onChange={(e) => onChange({ bgColor: e.target.value })}
          className="w-8 h-6 bg-transparent cursor-pointer"
        />
      </label>
      <label className="flex items-center justify-between mb-2">
        Couleur du texte
        <input
          type="color"
          value={style.textColor || "#EDEAE3"}
          onChange={(e) => onChange({ textColor: e.target.value })}
          className="w-8 h-6 bg-transparent cursor-pointer"
        />
      </label>
      <div className="border-t border-felt-cream/10 my-2 pt-2 text-felt-cream/50">Cellules / champs</div>
      <label className="flex items-center justify-between mb-2">
        Fond des cellules
        <input
          type="color"
          value={style.cellBgColor || "#14181C"}
          onChange={(e) => onChange({ cellBgColor: e.target.value })}
          className="w-8 h-6 bg-transparent cursor-pointer"
        />
      </label>
      <label className="flex items-center justify-between mb-2">
        Texte des cellules
        <input
          type="color"
          value={style.cellTextColor || "#EDEAE3"}
          onChange={(e) => onChange({ cellTextColor: e.target.value })}
          className="w-8 h-6 bg-transparent cursor-pointer"
        />
      </label>
      <div className="border-t border-felt-cream/10 my-2 pt-2 text-felt-cream/50">
        Cartes individuelles (grilles uniquement)
      </div>
      <label className="flex items-center justify-between mb-2">
        Largeur d'une carte (px)
        <input
          type="number"
          value={style.cardWidth || ""}
          placeholder="auto"
          onChange={(e) => onChange({ cardWidth: Number(e.target.value) || null })}
          className="w-20 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream placeholder:text-felt-cream/30"
        />
      </label>
      <label className="flex items-center justify-between mb-2">
        Hauteur d'une carte (px)
        <input
          type="number"
          value={style.cardHeight || ""}
          placeholder="auto"
          onChange={(e) => onChange({ cardHeight: Number(e.target.value) || null })}
          className="w-20 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream placeholder:text-felt-cream/30"
        />
      </label>
      <label className="flex items-center justify-between mb-2">
        Taille du texte (px)
        <input
          type="number"
          value={style.cardTextSize || ""}
          placeholder="auto"
          onChange={(e) => onChange({ cardTextSize: Number(e.target.value) || null })}
          className="w-20 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream placeholder:text-felt-cream/30"
        />
      </label>
      <div className="text-[10px] text-felt-cream/40 mb-2 -mt-1">
        S'applique à tout le texte de ce tableau, quelle que soit la carte.
      </div>
      <label className="flex items-center justify-between mb-2">
        Alignement du texte
        <select
          value={style.textAlign || ""}
          onChange={(e) => onChange({ textAlign: e.target.value || null })}
          className="bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream"
        >
          <option value="">Par défaut</option>
          <option value="left">Gauche</option>
          <option value="center">Centré</option>
          <option value="right">Droite</option>
        </select>
      </label>
      <label className="flex items-center justify-between mb-2">
        Couleur du texte des cartes
        <input
          type="color"
          value={style.cardTextColor || "#EDEAE3"}
          onChange={(e) => onChange({ cardTextColor: e.target.value })}
          className="w-8 h-6 bg-transparent cursor-pointer"
        />
      </label>
      <button
        onClick={() =>
          onChange({
            width: null,
            bgColor: null,
            textColor: null,
            cellBgColor: null,
            cellTextColor: null,
            cardWidth: null,
            cardHeight: null,
            cardTextSize: null,
            cardTextColor: null,
            textAlign: null,
            order: null,
          })
        }
        className="w-full text-center text-felt-cream/40 hover:text-felt-cream mt-1 py-1"
      >
        Réinitialiser ce tableau
      </button>
    </div>
  );
}
