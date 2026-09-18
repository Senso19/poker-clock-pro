import { useEffect, useState } from "react";
import { saveClubTheme } from "../lib/clubSettings.js";
import { useTheme } from "../context/ThemeContext.jsx";
import { fetchClubSettings, setRegistrationCode, setChatSettings, setSiteUrl } from "../lib/auth.js";
import { QRCodeSVG } from "qrcode.react";
import TicketModal from "./TicketModal.jsx";
import JoinPosterPrint from "./JoinPosterPrint.jsx";
import { uploadImageToStorage } from "../lib/imageUtils.js";
import { compterImagesEnBase64, migrerImagesVersStockage } from "../lib/mediaMigration.js";

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
  // Adresse publique du site, QR code et affiche d'adhésion. L'adresse est
  // enregistrée plutôt que devinée : celle depuis laquelle on administre
  // n'est pas forcément celle qu'on donne aux joueurs.
  const [clubName, setClubName] = useState("");
  const [siteUrl, setSiteUrlState] = useState("");
  const [siteUrlSaved, setSiteUrlSaved] = useState(false);
  const [lienCopie, setLienCopie] = useState(false);
  const [afficheOuverte, setAfficheOuverte] = useState(false);
  const [afficheTitre, setAfficheTitre] = useState("Rejoignez le club");
  const [afficheMessage, setAfficheMessage] = useState("Scannez ce code pour créer votre compte\net suivre les tournois en direct.");

  useEffect(() => {
    fetchClubSettings()
      .then((s) => {
        setJoinCode(s?.registration_code || "");
        setChatMaxLength(s?.chat_max_length || 200);
        setChatCooldown(s?.chat_cooldown_seconds || 0);
        setClubName(s?.club_name || "");
        // Rien d'enregistré : on propose l'adresse courante, c'est presque
        // toujours la bonne.
        setSiteUrlState(s?.site_url || window.location.origin);
      })
      .catch(() => {});
  }, []);

  async function handleSaveSiteUrl() {
    setError(null);
    try {
      await setSiteUrl(siteUrl.trim());
      setSiteUrlSaved(true);
      setTimeout(() => setSiteUrlSaved(false), 2000);
    } catch (e) {
      setError(e.message);
    }
  }

  function copierLien() {
    navigator.clipboard?.writeText(lienAdhesion).then(() => {
      setLienCopie(true);
      setTimeout(() => setLienCopie(false), 1500);
    });
  }

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
    const url = await uploadImageToStorage(file, { maxSize: 1440, quality: 0.78, folder: "page-backgrounds" });
    const next = { ...theme, background: { type: "image", value: url } };
    setTheme(next);
    await persist(next);
  }

  // Reprise des images stockées en base64 dans les colonnes JSON. Elle se
  // lance à la main : c'est une opération lourde (envoi de plusieurs Mo)
  // et il vaut mieux la faire au calme qu'au milieu d'un tournoi.
  const [reprise, setReprise] = useState(null); // null | "encours" | résultat
  const [lignesAReprendre, setLignesAReprendre] = useState(0);

  useEffect(() => {
    compterImagesEnBase64().then(setLignesAReprendre).catch(() => {});
  }, []);

  async function lancerReprise() {
    setReprise("encours");
    try {
      const res = await migrerImagesVersStockage();
      setReprise(res);
      setLignesAReprendre(await compterImagesEnBase64());
    } catch (e) {
      setReprise({ images: 0, octets: 0, erreurs: [e.message] });
    }
  }

  async function handleLogoUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    // Vers le bucket et non en base64 : ce logo vit dans club_settings.theme,
    // qui est relu et réécrit en entier au moindre réglage d'affichage.
    const url = await uploadImageToStorage(file, { maxSize: 300, folder: "logos" });
    const next = { ...theme, logoData: url };
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
    // Vers le bucket et non en base64 : ce logo vit dans club_settings.theme,
    // qui est relu et réécrit en entier au moindre réglage d'affichage.
    const url = await uploadImageToStorage(file, { maxSize: 300, folder: "logos" });
    const next = { ...theme, partnerLogoData: url };
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

  async function updateSidebarDividerWidth(value) {
    const next = { ...theme, sidebarDividerWidth: Number(value) || null };
    setTheme(next);
    await persist(next);
  }

  async function updateSidebarDividerColor(value) {
    const next = { ...theme, sidebarDividerColor: value };
    setTheme(next);
    await persist(next);
  }

  async function persist(next) {
    setSaving(true);
    setError(null);
    try {
      await saveClubTheme(next);
      setSavedAt(new Date());
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  // Ce qui est encodé dans le QR et imprimé sur l'affiche. Une adresse
  // sans schéma ne s'ouvrirait pas depuis un téléphone : on complète.
  const lienAdhesion = (() => {
    const brut = (siteUrl || "").trim();
    if (!brut) return window.location.origin;
    return /^https?:\/\//i.test(brut) ? brut : `https://${brut}`;
  })();

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
        <div className="font-medium mb-1">Montants abrégés (10000 → 10K)</div>
        <div className="text-xs text-felt-cream/50 mb-3">
          Abrège les blindes, antes et tapis à l'affichage : 10000 devient « 10K », 1500 « 1,5K ». Pratique quand les
          montants s'allongent en fin de tournoi. Les champs de saisie de la structure gardent la forme longue, et les
          valeurs enregistrées ne changent pas.
        </div>
        <label className="flex items-center gap-2 text-sm text-felt-cream/70">
          <input
            type="checkbox"
            checked={!!theme.compactChips}
            onChange={(e) => {
              // persist() n'écrit qu'en base : sans setTheme l'affichage ne
              // suivrait pas avant un rechargement (voir les autres réglages).
              const next = { ...theme, compactChips: e.target.checked };
              setTheme(next);
              persist(next);
            }}
          />
          Abréger les montants
        </label>
      </div>

      {(lignesAReprendre > 0 || reprise) && (
        <div className="mb-6 bg-felt-panel border border-felt-cream/10 rounded-md px-4 py-3">
          <div className="font-medium mb-1">Alléger la base</div>
          <div className="text-xs text-felt-cream/50 mb-3">
            Des images sont encore enregistrées à l'intérieur des réglages, en texte. Elles sont relues et
            réécrites en entier au moindre changement — un simple déplacement de panneau réécrit près d'un
            mégaoctet. Les déplacer vers le stockage de fichiers ne change rien à l'affichage, mais allège
            durablement chaque enregistrement. À faire au calme, pas pendant un tournoi.
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={lancerReprise}
              disabled={reprise === "encours" || lignesAReprendre === 0}
              className="px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display text-sm disabled:opacity-40"
            >
              {reprise === "encours" ? "Déplacement…" : "Déplacer les images"}
            </button>
            <span className="text-xs text-felt-cream/50">
              {reprise === "encours"
                ? "Ne fermez pas la page."
                : reprise
                ? `${reprise.images} image${reprise.images > 1 ? "s" : ""} déplacée${reprise.images > 1 ? "s" : ""}` +
                  ` (${Math.round(reprise.octets / 1024)} ko retirés de la base)` +
                  (reprise.erreurs?.length ? ` — ${reprise.erreurs.length} erreur(s)` : "")
                : `${lignesAReprendre} enregistrement${lignesAReprendre > 1 ? "s" : ""} concerné${lignesAReprendre > 1 ? "s" : ""}`}
            </span>
          </div>
          {reprise?.erreurs?.length > 0 && (
            <ul className="mt-2 text-xs text-felt-alert list-disc pl-5">
              {reprise.erreurs.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="mb-6 bg-felt-panel border border-felt-cream/10 rounded-md px-4 py-3">
        <div className="font-medium mb-1">Couleur de fond des cartes</div>
        <div className="text-xs text-felt-cream/50 mb-3">
          S'applique par défaut à toutes les cartes/tableaux personnalisables du site (tournois, championnats,
          registres, membres, etc.), sauf si une couleur différente a été choisie pour un tableau en particulier via
          son propre bouton 🎨.
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
        <div className="font-medium mb-1">Barre de séparation (menu / contenu)</div>
        <div className="text-xs text-felt-cream/50 mb-3">
          La fine barre verticale entre le menu de gauche et l'écran principal, qui sert à réduire ou redimensionner
          le menu.
        </div>
        <label className="flex items-center justify-between mb-3">
          Largeur (px)
          <input
            type="number"
            value={theme.sidebarDividerWidth || ""}
            placeholder="12"
            onChange={(e) => updateSidebarDividerWidth(e.target.value)}
            className="w-20 bg-felt-bg border border-felt-cream/10 rounded px-2 py-1 text-felt-cream placeholder:text-felt-cream/30"
          />
        </label>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={theme.sidebarDividerColor || "#C9A15A"}
            onChange={(e) => updateSidebarDividerColor(e.target.value)}
            className="w-10 h-10 rounded-md border-2 border-felt-cream/10 bg-transparent cursor-pointer"
          />
          {(theme.sidebarDividerColor || theme.sidebarDividerWidth) && (
            <button
              onClick={() => {
                updateSidebarDividerColor(null);
                updateSidebarDividerWidth(null);
              }}
              className="text-xs text-felt-cream/40 hover:text-felt-cream"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      <div className="mb-6 bg-felt-panel border border-felt-cream/10 rounded-md px-4 py-3">
        <div className="font-medium mb-1">Adhésion au club</div>
        <div className="text-xs text-felt-cream/50 mb-3">
          Le lien et le QR code à donner aux joueurs pour rejoindre le club et suivre les tournois.
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Fond blanc sous le QR : sur le feutre sombre de l'application,
              un code sans marge claire n'est pas lisible par un téléphone. */}
          <div className="bg-white p-2 rounded-md shrink-0 self-start">
            <QRCodeSVG value={lienAdhesion} size={116} level="M" />
          </div>
          {/* L'adresse sur sa propre ligne, les actions en dessous : cet
              écran fait 512 px de large, un champ coincé entre deux
              boutons n'y montrait qu'un bout du lien. */}
          <div className="flex-1 min-w-0">
            <input
              value={siteUrl}
              onChange={(e) => setSiteUrlState(e.target.value)}
              placeholder="https://..."
              className="w-full bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream text-sm"
            />
            <div className="text-[11px] text-felt-cream/35 mt-1.5">
              Laissez l'adresse proposée si vous n'avez pas de nom de domaine à vous.
            </div>
            <div className="flex flex-wrap gap-2 mt-2.5">
              <button
                onClick={handleSaveSiteUrl}
                className="px-4 py-1.5 bg-felt-gold text-felt-bg rounded-md font-display text-sm"
              >
                {siteUrlSaved ? "✓ Enregistré" : "Enregistrer"}
              </button>
              <button
                onClick={copierLien}
                title="Copier le lien"
                className="px-3 py-1.5 bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream text-sm"
              >
                {lienCopie ? "Copié !" : "⧉ Copier"}
              </button>
              <button
                onClick={() => setAfficheOuverte(true)}
                className="px-3 py-1.5 bg-felt-bg border border-felt-cream/10 rounded-md text-sm text-felt-cream/80 hover:text-felt-cream"
              >
                🖨 Imprimer l'affiche
              </button>
            </div>
          </div>
        </div>
      </div>

      {afficheOuverte && (
        <TicketModal onClose={() => setAfficheOuverte(false)}>
          <div className="print:hidden mb-4 space-y-2 max-w-[420px] mx-auto">
            <input
              value={afficheTitre}
              onChange={(e) => setAfficheTitre(e.target.value)}
              placeholder="Titre de l'affiche"
              className="w-full bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream text-sm"
            />
            <textarea
              value={afficheMessage}
              onChange={(e) => setAfficheMessage(e.target.value)}
              rows={2}
              placeholder="Message (facultatif)"
              className="w-full bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream text-sm"
            />
          </div>
          <JoinPosterPrint
            url={lienAdhesion}
            clubName={clubName}
            titre={afficheTitre}
            message={afficheMessage}
            code={joinCode}
          />
        </TicketModal>
      )}

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
