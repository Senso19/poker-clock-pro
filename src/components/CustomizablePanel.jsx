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
 * couleur de cellule choisie (voir StructureEditor / TournamentDetail),
 * et les classes pcp-title / pcp-body / pcp-value pour que leur texte
 * suive les réglages Titre / Texte secondaire / Valeurs (voir
 * TournamentCard / ActiveChampionshipCard par exemple).
 *
 * Le bouton 🎨 et son popover de réglages sont rendus HORS du conteneur
 * ciblé par les règles de style forcées, pour ne jamais être affectés
 * par les tailles/couleurs qu'on y choisit.
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

  const forcedCssRules = [];
  if (style.titleSize) forcedCssRules.push(`#${panelDomId} .pcp-title{font-size:${style.titleSize}px !important;}`);
  if (style.titleColor) forcedCssRules.push(`#${panelDomId} .pcp-title{color:${style.titleColor} !important;}`);
  if (style.bodySize) forcedCssRules.push(`#${panelDomId} .pcp-body{font-size:${style.bodySize}px !important;}`);
  if (style.bodyColor) forcedCssRules.push(`#${panelDomId} .pcp-body{color:${style.bodyColor} !important;}`);
  if (style.valueSize) forcedCssRules.push(`#${panelDomId} .pcp-value{font-size:${style.valueSize}px !important;}`);
  if (style.valueColor) forcedCssRules.push(`#${panelDomId} .pcp-value{color:${style.valueColor} !important;}`);
  if (style.textAlign) forcedCssRules.push(`#${panelDomId} .pcp-title,#${panelDomId} .pcp-body{text-align:${style.textAlign} !important;}`);

  return (
    <div
      className="relative"
      style={{ flex: flexBasis, width: style.width || undefined, maxWidth: style.width || undefined, order, minWidth: 0 }}
    >
      {forcedCssRules.length > 0 && <style>{forcedCssRules.join("")}</style>}
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
      <div
        id={panelDomId}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{
          backgroundColor: style.bgColor || theme.panelBgColor || undefined,
          color: style.textColor || undefined,
          "--pcp-cell-bg": style.cellBgColor || undefined,
          "--pcp-cell-text": style.cellTextColor || undefined,
          "--pcp-banner-height": style.bannerHeight ? `${style.bannerHeight}px` : undefined,
          gridTemplateColumns: style.cardWidth ? `repeat(auto-fill, minmax(${style.cardWidth}px, 1fr))` : undefined,
          gridAutoRows: style.cardHeight ? `${style.cardHeight}px` : undefined,
        }}
        className={`${dragOver ? "ring-2 ring-felt-gold" : ""} ${className || ""}`}
      >
        {children}
      </div>
    </div>
  );
}

function SizeColorRow({ label, sizeValue, colorValue, onSizeChange, onColorChange }) {
  return (
    <div className="mb-2">
      <div className="text-felt-cream/70 mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <input
          type="number"
          value={sizeValue || ""}
          placeholder="taille (px)"
          onChange={(e) => onSizeChange(Number(e.target.value) || null)}
          className="w-24 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream placeholder:text-felt-cream/30"
        />
        <input type="color" value={colorValue || "#EDEAE3"} onChange={(e) => onColorChange(e.target.value)} className="w-8 h-6 bg-transparent cursor-pointer" />
      </div>
    </div>
  );
}

function PanelStyleEditor({ style, onChange, onClose }) {
  return (
    <div
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="absolute top-12 right-3 z-30 bg-felt-bg border border-felt-gold/40 rounded-md p-3 w-64 text-xs text-felt-cream shadow-lg max-h-[28rem] overflow-y-auto"
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
        Hauteur du bandeau image (px)
        <input
          type="number"
          value={style.bannerHeight || ""}
          placeholder="auto"
          onChange={(e) => onChange({ bannerHeight: Number(e.target.value) || null })}
          className="w-20 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream placeholder:text-felt-cream/30"
        />
      </label>
      <div className="border-t border-felt-cream/10 my-2 pt-2 text-felt-cream/50">Texte des cartes, par rôle</div>
      <SizeColorRow
        label="Titre"
        sizeValue={style.titleSize}
        colorValue={style.titleColor}
        onSizeChange={(v) => onChange({ titleSize: v })}
        onColorChange={(v) => onChange({ titleColor: v })}
      />
      <SizeColorRow
        label="Texte secondaire (sous-titre, description, dates)"
        sizeValue={style.bodySize}
        colorValue={style.bodyColor}
        onSizeChange={(v) => onChange({ bodySize: v })}
        onColorChange={(v) => onChange({ bodyColor: v })}
      />
      <SizeColorRow
        label="Valeurs / chiffres mis en avant"
        sizeValue={style.valueSize}
        colorValue={style.valueColor}
        onSizeChange={(v) => onChange({ valueSize: v })}
        onColorChange={(v) => onChange({ valueColor: v })}
      />
      <label className="flex items-center justify-between mb-2 mt-2">
        Alignement (titre + texte secondaire)
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
            bannerHeight: null,
            titleSize: null,
            titleColor: null,
            bodySize: null,
            bodyColor: null,
            valueSize: null,
            valueColor: null,
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
