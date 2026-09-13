import { useEffect, useState } from "react";
import { fetchAllAccounts, updateAccountRole, deleteAccount, adminUpdateAccount, ROLE_LABELS } from "../lib/auth.js";
import AvatarCropper from "./AvatarCropper.jsx";

/**
 * AccountsAdmin — gestion des comptes, attribution des rôles et édition
 * complète des informations d'un membre (pseudo, nom, email, mot de passe,
 * avatar). Réservé à l'administrateur (voir canManageAccounts).
 */
export default function AccountsAdmin() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingAccount, setEditingAccount] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setAccounts(await fetchAllAccounts());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handleRoleChange(id, role) {
    try {
      await updateAccountRole(id, role);
      setAccounts((list) => list.map((a) => (a.id === id ? { ...a, role } : a)));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id, pseudo) {
    if (!confirm(`Supprimer le compte de ${pseudo} ?`)) return;
    try {
      await deleteAccount(id);
      setAccounts((list) => list.filter((a) => a.id !== id));
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) {
    return <div className="p-6 text-felt-cream/60 font-body">Chargement…</div>;
  }

  return (
    <div className="p-4 sm:p-6 font-body text-felt-cream h-full overflow-y-auto">
      <div className="font-display text-xl mb-4">Comptes ({accounts.length})</div>
      {error && <div className="text-felt-alert text-sm mb-3">{error}</div>}

      <div className="space-y-2">
        {accounts.map((a) => (
          <div
            key={a.id}
            className="flex flex-wrap items-center gap-3 bg-felt-panel border border-felt-cream/10 rounded-md px-4 py-3"
          >
            <button onClick={() => setEditingAccount(a)} className="shrink-0" title="Voir / modifier ce membre">
              {a.avatar_data ? (
                <img src={a.avatar_data} alt="" className="w-10 h-10 rounded-full object-cover" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-felt-bg flex items-center justify-center text-felt-cream/40 font-display">
                  {a.pseudo?.[0]?.toUpperCase()}
                </div>
              )}
            </button>
            <button onClick={() => setEditingAccount(a)} className="flex-1 min-w-0 text-left">
              <div className="font-medium truncate hover:text-felt-gold">
                {a.pseudo}{" "}
                <span className="text-felt-cream/40 text-sm font-normal">
                  ({a.first_name} {a.last_name})
                </span>
              </div>
              <div className="text-xs text-felt-cream/40 truncate">{a.email || "—"}</div>
            </button>
            <select
              value={a.role}
              onChange={(e) => handleRoleChange(a.id, e.target.value)}
              className="bg-felt-bg border border-felt-cream/10 rounded-md px-2 py-1.5 text-sm text-felt-cream"
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              onClick={() => handleDelete(a.id, a.pseudo)}
              className="text-xs px-2 py-1 text-felt-alert/70 hover:text-felt-alert"
            >
              🗑
            </button>
          </div>
        ))}
      </div>

      {editingAccount && (
        <EditAccountModal
          account={editingAccount}
          onClose={() => setEditingAccount(null)}
          onSaved={(updated) => {
            setAccounts((list) => list.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
            setEditingAccount(null);
          }}
        />
      )}
    </div>
  );
}

function EditAccountModal({ account, onClose, onSaved }) {
  const [pseudo, setPseudo] = useState(account.pseudo || "");
  const [firstName, setFirstName] = useState(account.first_name || "");
  const [lastName, setLastName] = useState(account.last_name || "");
  const [email, setEmail] = useState(account.email || "");
  const [password, setPassword] = useState("");
  const [avatarData, setAvatarData] = useState(account.avatar_data || null);
  const [croppingFile, setCroppingFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  function handleAvatarChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCroppingFile(file);
    e.target.value = "";
  }

  async function handleSave() {
    if (!pseudo.trim() || !firstName.trim() || !lastName.trim()) {
      setError("Pseudo, prénom et nom sont obligatoires.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const updated = await adminUpdateAccount(account.id, {
        pseudo: pseudo.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        avatarData,
        password: password.trim(),
      });
      onSaved(updated);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm p-6 font-body text-felt-cream max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="font-display text-lg">Modifier le membre</div>
          <button onClick={onClose} className="text-felt-cream/50 hover:text-felt-cream">
            ✕
          </button>
        </div>

        <div className="flex flex-col items-center mb-5">
          {avatarData ? (
            <img src={avatarData} alt="" className="w-20 h-20 rounded-full object-cover mb-3" />
          ) : (
            <div className="w-20 h-20 rounded-full bg-felt-bg flex items-center justify-center text-felt-cream/40 font-display text-xl mb-3">
              {pseudo?.[0]?.toUpperCase()}
            </div>
          )}
          <label className="px-3 py-1.5 text-xs bg-felt-bg border border-felt-cream/10 rounded-md cursor-pointer hover:text-felt-gold">
            Changer l'avatar
            <input type="file" accept="image/*" onChange={handleAvatarChange} className="hidden" />
          </label>
        </div>

        <div className="space-y-3">
          <Field label="Pseudo" value={pseudo} onChange={setPseudo} />
          <div className="flex gap-2">
            <Field label="Prénom" value={firstName} onChange={setFirstName} />
            <Field label="Nom" value={lastName} onChange={setLastName} />
          </div>
          <Field label="Email" value={email} onChange={setEmail} placeholder="optionnel" />
          <Field
            label="Nouveau mot de passe"
            value={password}
            onChange={setPassword}
            placeholder="laisser vide pour ne pas changer"
            type="text"
          />
        </div>

        {error && <div className="text-felt-alert text-sm mt-3">{error}</div>}

        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-felt-cream/60 hover:text-felt-cream">
            Annuler
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
          >
            {saving ? "Sauvegarde…" : "Enregistrer"}
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
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <label className="block flex-1 text-xs text-felt-cream/50">
      {label}
      <input
        value={value}
        type={type}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/30"
      />
    </label>
  );
}
