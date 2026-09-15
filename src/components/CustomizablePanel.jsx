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

  const [dragging, setDragging] = useState(false);
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

  function swapWith(targetKey) {
    if (!targetKey || targetKey === panelKey) return;
    const targetStyle = theme.panelStyles?.[targetKey] || {};
    const targetOrder = targetStyle.order ?? 0;
    const nextPanelStyles = {
      ...(theme.panelStyles || {}),
      [panelKey]: { ...style, order: targetOrder },
      [targetKey]: { ...targetStyle, order },
    };
    const nextTheme = { ...theme, panelStyles: nextPanelStyles };
    setTheme(nextTheme);
    persist(nextTheme);
  }

  // Déplacement au pointeur (souris + tactile) plutôt qu'en drag-and-drop
  // HTML5 natif, qui ne fonctionne pas du tout sur écrans tactiles :
  // on maintient la poignée ⠿, on glisse, et au relâchement on repère
  // quel tableau se trouve sous le doigt/curseur pour échanger les places.
  function handlePointerDown(e) {
    e.preventDefault();
    setDragging(true);
    function onMove() {}
    function onUp(ev) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragging(false);
      const el = document.elementFromPoint(ev.clientX, ev.clientY);
      const targetEl = el?.closest("[data-pcp-panel-key]");
      if (targetEl) swapWith(targetEl.getAttribute("data-pcp-panel-key"));
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
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
  if (style.rowDirection) forcedCssRules.push(`#${panelDomId} .pcp-row{flex-direction:${style.rowDirection} !important;}`);
  if (style.btnBgColor) forcedCssRules.push(`#${panelDomId} .pcp-btn{background-color:${style.btnBgColor} !important; border-color:${style.btnBgColor} !important;}`);
  if (style.btnTextColor) forcedCssRules.push(`#${panelDomId} .pcp-btn{color:${style.btnTextColor} !important;}`);
  if (style.spaceHeight) forcedCssRules.push(`#${panelDomId} .pcp-space{height:${style.spaceHeight}px !important; display:block !important;}`);
  if (style.spaceHeight2) forcedCssRules.push(`#${panelDomId} .pcp-space-2{height:${style.spaceHeight2}px !important; display:block !important;}`);
  if (style.dividerColor) forcedCssRules.push(`#${panelDomId} > * + *{border-top-color:${style.dividerColor} !important;}`);
  if (style.rowWidth) forcedCssRules.push(`#${panelDomId} > *{max-width:${style.rowWidth}px !important; margin-left:auto !important; margin-right:auto !important;}`);
  if (style.rowHeight) forcedCssRules.push(`#${panelDomId} > *{min-height:${style.rowHeight}px !important;}`);
  if (style.zebra) forcedCssRules.push(`#${panelDomId} > *:nth-child(even){background-color:${style.zebraColor || "rgba(255,255,255,0.03)"} !important;}`);

  return (
    <div
      className="relative"
      style={{ flex: flexBasis, width: style.width || undefined, maxWidth: style.width || undefined, order, minWidth: 0 }}
    >
      {forcedCssRules.length > 0 && <style>{forcedCssRules.join("")}</style>}
      {isEditMode && (
        <div className="absolute top-3 right-3 z-20 flex gap-2">
          <button
            onPointerDown={handlePointerDown}
            title="Maintenir, glisser sur un autre tableau, relâcher pour échanger leur place"
            style={{ touchAction: "none" }}
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
        data-pcp-panel-key={panelKey}
        style={{
          backgroundColor: style.bgColor || theme.panelBgColor || undefined,
          color: style.textColor || undefined,
          "--pcp-cell-bg": style.cellBgColor || undefined,
          "--pcp-cell-text": style.cellTextColor || undefined,
          "--pcp-banner-height": style.bannerHeight ? `${style.bannerHeight}px` : undefined,
          gridTemplateColumns: style.cardWidth ? `repeat(auto-fill, minmax(${style.cardWidth}px, 1fr))` : undefined,
          gridAutoRows: style.cardHeight ? `${style.cardHeight}px` : undefined,
        }}
        className={`${dragging ? "opacity-60" : ""} ${className || ""}`}
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
      <label className="flex items-center justify-between mb-2">
        Disposition icône / texte
        <select
          value={style.rowDirection || ""}
          onChange={(e) => onChange({ rowDirection: e.target.value || null })}
          className="bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream"
        >
          <option value="">Par défaut</option>
          <option value="row">Icône puis texte</option>
          <option value="row-reverse">Texte puis icône</option>
          <option value="column">Icône au-dessus</option>
          <option value="column-reverse">Texte au-dessus</option>
        </select>
      </label>
      <div className="text-[10px] text-felt-cream/40 mb-2 -mt-1">
        S'applique aux lignes icône + chiffre/texte de ce tableau qui prennent en charge ce réglage (ex. compteur de
        joueurs, badges).
      </div>
      <div className="border-t border-felt-cream/10 my-2 pt-2 text-felt-cream/50">Boutons des cartes</div>
      <label className="flex items-center justify-between mb-2">
        Fond des boutons
        <input
          type="color"
          value={style.btnBgColor || "#C9A15A"}
          onChange={(e) => onChange({ btnBgColor: e.target.value })}
          className="w-8 h-6 bg-transparent cursor-pointer"
        />
      </label>
      <label className="flex items-center justify-between mb-2">
        Texte des boutons
        <input
          type="color"
          value={style.btnTextColor || "#14181C"}
          onChange={(e) => onChange({ btnTextColor: e.target.value })}
          className="w-8 h-6 bg-transparent cursor-pointer"
        />
      </label>
      {(style.btnBgColor || style.btnTextColor) && (
        <button
          onClick={() => onChange({ btnBgColor: null, btnTextColor: null })}
          className="w-full text-left px-0 text-felt-cream/40 hover:text-felt-cream mb-2"
        >
          Réinitialiser les boutons
        </button>
      )}
      <div className="border-t border-felt-cream/10 my-2 pt-2 text-felt-cream/50">Espacement</div>
      <label className="flex items-center justify-between mb-2">
        Espace 1 — après les badges (px)
        <input
          type="number"
          value={style.spaceHeight || ""}
          placeholder="0"
          onChange={(e) => onChange({ spaceHeight: Number(e.target.value) || null })}
          className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream placeholder:text-felt-cream/30"
        />
      </label>
      <label className="flex items-center justify-between mb-2">
        Espace 2 — avant les boutons (px)
        <input
          type="number"
          value={style.spaceHeight2 || ""}
          placeholder="0"
          onChange={(e) => onChange({ spaceHeight2: Number(e.target.value) || null })}
          className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream placeholder:text-felt-cream/30"
        />
      </label>
      <div className="text-[10px] text-felt-cream/40 mb-2 -mt-1">
        S'applique aux emplacements d'espacement disponibles dans ce type de carte (là où le curseur le permet).
      </div>
      <div className="border-t border-felt-cream/10 my-2 pt-2 text-felt-cream/50">Lignes de liste</div>
      <label className="flex items-center justify-between mb-2">
        Couleur du trait de séparation
        <input
          type="color"
          value={style.dividerColor || "#EDEAE3"}
          onChange={(e) => onChange({ dividerColor: e.target.value })}
          className="w-8 h-6 bg-transparent cursor-pointer"
        />
      </label>
      <label className="flex items-center justify-between mb-2">
        Largeur des lignes (px)
        <input
          type="number"
          value={style.rowWidth || ""}
          placeholder="auto"
          onChange={(e) => onChange({ rowWidth: Number(e.target.value) || null })}
          className="w-20 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream placeholder:text-felt-cream/30"
        />
      </label>
      <label className="flex items-center justify-between mb-2">
        Hauteur des lignes (px)
        <input
          type="number"
          value={style.rowHeight || ""}
          placeholder="auto"
          onChange={(e) => onChange({ rowHeight: Number(e.target.value) || null })}
          className="w-20 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream placeholder:text-felt-cream/30"
        />
      </label>
      <label className="flex items-center justify-between mb-2">
        Lignes alternées
        <input type="checkbox" checked={!!style.zebra} onChange={(e) => onChange({ zebra: e.target.checked })} />
      </label>
      {style.zebra && (
        <label className="flex items-center justify-between mb-2">
          Couleur des lignes alternées
          <input
            type="color"
            value={style.zebraColor || "#FFFFFF"}
            onChange={(e) => onChange({ zebraColor: e.target.value })}
            className="w-8 h-6 bg-transparent cursor-pointer"
          />
        </label>
      )}
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
            rowDirection: null,
            btnBgColor: null,
            btnTextColor: null,
            spaceHeight: null,
            spaceHeight2: null,
            dividerColor: null,
            rowWidth: null,
            rowHeight: null,
            zebra: null,
            zebraColor: null,
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
