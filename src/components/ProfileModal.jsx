import { useState } from "react";
import { useAccount } from "../context/AccountContext.jsx";
import { updateOwnProfile } from "../lib/auth.js";
import AvatarCropper from "./AvatarCropper.jsx";
import InstallAppPrompt from "./InstallAppPrompt.jsx";
import { useIsMobile } from "../lib/useIsMobile.js";
import { isStandalone } from "../lib/installPrompt.js";

/**
 * ProfileModal — édition du profil (pseudo, nom, prénom, email, avatar).
 * Volontairement épuré par rapport à BlindValet : pas d'abonnement,
 * de moyens de paiement ni de langue (hors périmètre de cet outil interne).
 */
export default function ProfileModal({ onClose }) {
  const { account, refresh } = useAccount();
  const [pseudo, setPseudo] = useState(account.pseudo);
  const [firstName, setFirstName] = useState(account.first_name);
  const [lastName, setLastName] = useState(account.last_name);
  const [email, setEmail] = useState(account.email || "");
  const [avatarData, setAvatarData] = useState(account.avatar_data);
  const [croppingFile, setCroppingFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showInstall, setShowInstall] = useState(false);
  const isMobile = useIsMobile();

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCroppingFile(file);
    e.target.value = "";
  }

  async function handleConfirm() {
    if (!pseudo.trim() || !firstName.trim() || !lastName.trim()) {
      setError("Pseudo, prénom et nom sont obligatoires.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateOwnProfile(account.id, {
        pseudo: pseudo.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        avatarData,
      });
      await refresh();
      onClose();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm p-6 font-body text-felt-cream">
        <div className="flex items-center justify-between mb-5">
          <div className="font-display text-lg">Profil</div>
          <button onClick={onClose} className="text-felt-cream/50 hover:text-felt-cream">
            ✕
          </button>
        </div>

        <div className="flex flex-col items-center mb-5">
          {avatarData ? (
            <img src={avatarData} alt="" className="w-24 h-24 rounded-full object-cover mb-3" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-felt-bg flex items-center justify-center text-felt-cream/40 font-display text-2xl mb-3">
              {pseudo?.[0]?.toUpperCase()}
            </div>
          )}
          <div className="flex gap-2">
            <label className="px-3 py-1.5 text-xs bg-felt-bg border border-felt-cream/10 rounded-md cursor-pointer hover:text-felt-gold">
              Changer
              <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
            </label>
            {avatarData && (
              <button
                onClick={() => setAvatarData(null)}
                className="px-3 py-1.5 text-xs bg-felt-bg border border-felt-cream/10 rounded-md text-felt-alert/70 hover:text-felt-alert"
              >
                Retirer
              </button>
            )}
          </div>
        </div>

        <div className="space-y-3">
          <Field label="Pseudo" value={pseudo} onChange={setPseudo} />
          <div className="flex gap-2">
            <Field label="Prénom" value={firstName} onChange={setFirstName} />
            <Field label="Nom" value={lastName} onChange={setLastName} />
          </div>
          <Field label="Email" value={email} onChange={setEmail} placeholder="optionnel" />
        </div>

        {isMobile && !isStandalone() && (
          <button
            onClick={() => setShowInstall(true)}
            className="w-full mt-4 px-3 py-2 text-sm bg-felt-bg border border-felt-gold/30 rounded-md text-felt-gold hover:bg-felt-gold/10"
          >
            📲 Installer l'application sur l'écran d'accueil
          </button>
        )}

        {error && <div className="text-felt-alert text-sm mt-3">{error}</div>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-felt-cream/60 hover:text-felt-cream">
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
          >
            {saving ? "Sauvegarde…" : "Confirmer"}
          </button>
        </div>
      </div>

      {croppingFile && (
        <AvatarCropper
          file={croppingFile}
          onConfirm={(dataUrl) => {
            setAvatarData(dataUrl);
            setCroppingFile(null);
          }}
          onCancel={() => setCroppingFile(null)}
        />
      )}

      {showInstall && <InstallAppPrompt onClose={() => setShowInstall(false)} />}
    </div>
  );
}

function Field({ label, value, onChange, placeholder }) {
  return (
    <label className="block flex-1 text-xs text-felt-cream/50">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/30"
      />
    </label>
  );
}
