import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useTheme } from "../context/ThemeContext.jsx";
import { fetchClubSettings, setRegistrationCode, setChatSettings } from "../lib/auth.js";
import { compressImageFile } from "../lib/imageUtils.js";

const PRESETS = [
  { name: "Feutre (défaut)", value: "#14181C" },
  { name: "Vert bouteille", value: "#0F1F16" },
  { name: "Anthracite chaud", value: "#1C1917" },
  { name: "Bordeaux profond", value: "#1F1315" },
];

/**
 * LayoutSettings — personnalisation du fond et mode d'affichage, chat du
 * club affiché en direct, et paramètres du chat (délai entre messages,
 * longueur max). Sauvegardé dans club_settings (une seule ligne, réutilisée
 * par tout le club).
 */
export default function LayoutSettings() {
  const { theme, setTheme } = useTheme();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [error, setError] = useState(null);
  const [joinCode, setJoinCode] = useState("");
  const [joinCodeSaved, setJoinCodeSaved] = useState(false);
  const [chatMaxLength, setChatMaxLength] = useState(200);
  const [chatCooldown, setChatCooldown] = useState(0);
  const [chatSettingsSaved, setChatSettingsSaved] = useState(false);
  const [chatSettingsError, setChatSettingsError] = useState(null);

  useEffect(() => {
    fetchClubSettings()
      .then((s) => {
        setJoinCode(s?.registration_code || "");
        setChatMaxLength(s?.chat_max_length || 200);
        setChatCooldown(s?.chat_cooldown_seconds || 0);
      })
      .catch(() => {});
  }, []);

  async function handleSaveJoinCode() {
    setError(null);
    try {
      await setRegistrationCode(joinCode.trim().toUpperCase());
      setJoinCodeSaved(true);
      setTimeout(() => setJoinCodeSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleSaveChatSettings() {
    setChatSettingsError(null);
    try {
      await setChatSettings(chatMaxLength, chatCooldown);
      setChatSettingsSaved(true);
      setTimeout(() => setChatSettingsSaved(false), 2000);
    } catch (e) {
      setChatSettingsError(e.message);
    }
  }

  async function updateBackground(value) {
    const next = { ...theme, background: { type: "color", value } };
    setTheme(next);
    await persist(next);
  }

  async function handleBackgroundImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImageFile(file, { maxSize: 1440, quality: 0.78 });
    const next = { ...theme, background: { type: "image", value: dataUrl } };
    setTheme(next);
    await persist(next);
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImageFile(file, { maxSize: 300 });
    const next = { ...theme, logoData: dataUrl };
    setTheme(next);
    await persist(next);
  }

  async function removeLogo() {
    const next = { ...theme, logoData: null };
    setTheme(next);
    await persist(next);
  }

  async function handlePartnerLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImageFile(file, { maxSize: 300 });
    const next = { ...theme, partnerLogoData: dataUrl };
    setTheme(next);
    await persist(next);
  }

  async function removePartnerLogo() {
    const next = { ...theme, partnerLogoData: null };
    setTheme(next);
    await persist(next);
  }

  async function updateTicketLogoHeight(value) {
    const next = { ...theme, ticketLogoHeight: Number(value) || null };
    setTheme(next);
    await persist(next);
  }

  async function updatePanelBorderColor(value) {
    const next = { ...theme, panelBorderColor: value };
    setTheme(next);
    await persist(next);
  }

  async function togglePanelBorderTransparent() {
    const isTransparent = theme.panelBorderColor === "transparent";
    const next = { ...theme, panelBorderColor: isTransparent ? null : "transparent" };
    setTheme(next);
    await persist(next);
  }

  async function updatePanelBgColor(value) {
    const next = { ...theme, panelBgColor: value };
    setTheme(next);
    await persist(next);
  }

  async function persist(next) {
    setSaving(true);
    setError(null);
    const { data: existing } = await supabase
      .from("club_settings")
      .select("id")
      .limit(1)
      .maybeSingle();

    const payload = { club_name: "19PokerClub", theme: next };
    const { error } = existing
      ? await supabase.from("club_settings").update(payload).eq("id", existing.id)
      : await supabase.from("club_settings").insert(payload);

    if (error) setError(error.message);
    else setSavedAt(new Date());
    setSaving(false);
  }

  return (
    <div className="p-4 sm:p-6 font-body text-felt-cream h-full overflow-y-auto max-w-lg">
      <div className="font-display text-xl mb-6">Réglages d'affichage</div>

      {error && <div className="text-felt-alert text-sm mb-3">Erreur : {error}</div>}

      <div className="mb-6 bg-felt-panel border border-felt-cream/10 rounded-md px-4 py-3">
        <div className="font-medium mb-1">Paramètres du chat</div>
        <div className="text-xs text-felt-cream/50 mb-3">
          Le chat du club est affiché directement dans la barre latérale. L'administrateur peut
          y supprimer un message précis (icône 🗑 au survol du message).
        </div>
        <div className="flex flex-wrap gap-4 mb-3">
          <label className="text-xs text-felt-cream/50">
            Délai entre deux messages d'un même joueur (s)
            <input
              type="number"
              min="0"
              value={chatCooldown}
              onChange={(e) => setChatCooldown(e.target.value)}
              className="block mt-1 w-36 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream"
            />
          </label>
          <label className="text-xs text-felt-cream/50">
            Longueur max d'un message (caractères)
            <input
              type="number"
              min="1"
              value={chatMaxLength}
              onChange={(e) => setChatMaxLength(e.target.value)}
              className="block mt-1 w-36 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream"
            />
          </label>
        </div>
        {chatSettingsError && <div className="text-felt-alert text-sm mb-2">Erreur : {chatSettingsError}</div>}
        <button
          onClick={handleSaveChatSettings}
          className="px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display text-sm"
        >
          {chatSettingsSaved ? "✓ Enregistré" : "Enregistrer"}
        </button>
      </div>

      <div className="mb-6 bg-felt-panel border border-felt-cream/10 rounded-md px-4 py-3">
        <div className="font-medium mb-1">Logo du club</div>
        <div className="text-xs text-felt-cream/50 mb-3">
          Affiché en haut de la barre des onglets, à la place de l'icône par défaut.
        </div>
        <div className="flex items-center gap-3">
          {theme.logoData ? (
            <img src={theme.logoData} alt="" className="h-12 w-auto max-w-[140px] object-contain" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-felt-gold/15 border border-felt-gold/40 flex items-center justify-center text-felt-gold text-lg">
              ♠
            </div>
          )}
          <label className="cursor-pointer px-3 py-1.5 text-sm bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display">
            {theme.logoData ? "Changer le logo" : "Importer un logo"}
            <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
          </label>
          {theme.logoData && (
            <button onClick={removeLogo} className="text-xs text-felt-alert/70 hover:text-felt-alert">
              Retirer
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 bg-felt-panel border border-felt-cream/10 rounded-md px-4 py-3">
        <div className="font-medium mb-1">Logo partenaire (ex : Winamax)</div>
        <div className="text-xs text-felt-cream/50 mb-3">
          Téléversez ici le fichier logo officiel fourni par votre partenaire — il s'affichera tel quel sur les tickets
          imprimables. Utilisez uniquement un fichier dont vous avez l'autorisation d'usage.
        </div>
        <div className="flex items-center gap-3">
          {theme.partnerLogoData && <img src={theme.partnerLogoData} alt="" className="h-12 w-auto max-w-[140px] object-contain" />}
          <label className="cursor-pointer px-3 py-1.5 text-sm bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display">
            {theme.partnerLogoData ? "Changer le logo" : "Importer un logo"}
            <input type="file" accept="image/*" onChange={handlePartnerLogoUpload} className="hidden" />
          </label>
          {theme.partnerLogoData && (
            <button onClick={removePartnerLogo} className="text-xs text-felt-alert/70 hover:text-felt-alert">
              Retirer
            </button>
          )}
        </div>
        <label className="flex items-center justify-between mt-3 pt-3 border-t border-felt-cream/10 text-sm">
          Taille des logos sur le ticket (px)
          <input
            type="number"
            value={theme.ticketLogoHeight || 48}
            onChange={(e) => updateTicketLogoHeight(e.target.value)}
            className="w-20 bg-felt-bg border border-felt-cream/10 rounded px-2 py-1 text-felt-cream"
          />
        </label>
      </div>

      <div className="mb-6">
        <div className="text-sm text-felt-cream/60 mb-2">Fond — couleur</div>
        <div className="flex flex-wrap gap-2 mb-3">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => updateBackground(p.value)}
              className={`w-10 h-10 rounded-md border-2 ${
                theme.background?.type === "color" && theme.background?.value === p.value
                  ? "border-felt-gold"
                  : "border-felt-cream/10"
              }`}
              style={{ backgroundColor: p.value }}
              title={p.name}
            />
          ))}
          <input
            type="color"
            value={theme.background?.type === "color" ? theme.background.value : "#14181C"}
            onChange={(e) => updateBackground(e.target.value)}
            className="w-10 h-10 rounded-md border-2 border-felt-cream/10 bg-transparent cursor-pointer"
            title="Couleur personnalisée"
          />
        </div>

        <div className="text-sm text-felt-cream/60 mb-2">Fond — image</div>
        <div className="flex items-center gap-3">
          {theme.background?.type === "image" && (
            <img
              src={theme.background.value}
              alt=""
              className="w-16 h-10 object-cover rounded border border-felt-gold"
            />
          )}
          <label className="cursor-pointer px-3 py-1.5 text-sm bg-felt-panel border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display">
            {theme.background?.type === "image" ? "Changer l'image" : "Importer une image"}
            <input type="file" accept="image/*" onChange={handleBackgroundImage} className="hidden" />
          </label>
          {theme.background?.type === "image" && (
            <button
              onClick={() => updateBackground(PRESETS[0].value)}
              className="text-xs text-felt-alert/70 hover:text-felt-alert"
            >
              Retirer
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 bg-felt-panel border border-felt-cream/10 rounded-md px-4 py-3">
        <div className="font-medium mb-1">Couleur de contour des panneaux</div>
        <div className="text-xs text-felt-cream/50 mb-3">
          S'applique aux bordures de tous les panneaux de l'horloge (hors mode réorganisation).
        </div>
        <div className="flex items-center gap-3">
          <input
            type="color"
            disabled={theme.panelBorderColor === "transparent"}
            value={theme.panelBorderColor && theme.panelBorderColor !== "transparent" ? theme.panelBorderColor : "#3A3F47"}
            onChange={(e) => updatePanelBorderColor(e.target.value)}
            className="w-10 h-10 rounded-md border-2 border-felt-cream/10 bg-transparent cursor-pointer disabled:opacity-30"
          />
          <label className="flex items-center gap-2 text-sm text-felt-cream/70">
            <input
              type="checkbox"
              checked={theme.panelBorderColor === "transparent"}
              onChange={togglePanelBorderTransparent}
            />
            Contour transparent
          </label>
          {theme.panelBorderColor && theme.panelBorderColor !== "transparent" && (
            <button
              onClick={() => updatePanelBorderColor(null)}
              className="text-xs text-felt-cream/40 hover:text-felt-cream"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 bg-felt-panel border border-felt-cream/10 rounded-md px-4 py-3">
        <div className="font-medium mb-1">Couleur de fond des tableaux</div>
        <div className="text-xs text-felt-cream/50 mb-3">
          S'applique aux cartes des onglets Structure des blinds et Joueurs (paramètres et tableau).
        </div>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={theme.panelBgColor || "#1B2027"}
            onChange={(e) => updatePanelBgColor(e.target.value)}
            className="w-10 h-10 rounded-md border-2 border-felt-cream/10 bg-transparent cursor-pointer"
          />
          {theme.panelBgColor && (
            <button onClick={() => updatePanelBgColor(null)} className="text-xs text-felt-cream/40 hover:text-felt-cream">
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 bg-felt-panel border border-felt-cream/10 rounded-md px-4 py-3">
        <div className="font-medium mb-1">Code secret de validation des comptes</div>
        <div className="text-xs text-felt-cream/50 mb-3">
          Les joueurs doivent connaître ce code pour créer leur compte (le tout premier compte
          créé devient automatiquement administrateur, sans code).
        </div>
        <div className="flex gap-2">
          <input
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            placeholder="Ex : 7KYQ"
            className="flex-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream uppercase tracking-widest font-mono"
          />
          <button
            onClick={handleSaveJoinCode}
            className="px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display"
          >
            {joinCodeSaved ? "✓" : "Enregistrer"}
          </button>
        </div>
      </div>

      <div className="text-xs text-felt-cream/40">
        {saving ? "Sauvegarde…" : savedAt ? `Sauvegardé à ${savedAt.toLocaleTimeString()}` : ""}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button
      onClick={onChange}
      className={`w-11 h-6 rounded-full transition-colors relative ${
        checked ? "bg-felt-gold" : "bg-felt-bg border border-felt-cream/20"
      }`}
    >
      <span
        className={`absolute top-0.5 w-5 h-5 rounded-full bg-felt-cream transition-transform ${
          checked ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
