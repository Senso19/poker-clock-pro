import { useEffect, useState } from "react";
import { Pencil, Trash2, Merge, Search, UserPlus, Mail, Download, Copy, Lock, LockOpen } from "lucide-react";
import {
  fetchAllAccounts,
  updateAccountRole,
  deleteAccount,
  adminUpdateAccount,
  adminCreateAccount,
  mergeAccounts,
  fetchClubSettings,
  setAccountClubName,
  ROLE_LABELS,
  PERMISSION_LABELS,
  DEFAULT_ROLE_PERMISSIONS,
} from "../lib/auth.js";
import { supabase } from "../lib/supabase.js";
import { useTheme } from "../context/ThemeContext.jsx";
import AvatarCropper from "./AvatarCropper.jsx";
import CustomizablePanel from "./CustomizablePanel.jsx";
import EditableButton from "./EditableButton.jsx";
import { useConfirm } from "../context/ConfirmContext.jsx";

/**
 * AccountsAdmin — gestion des membres façon BlindValet : recherche, tri,
 * ajout, invitation (code du club), export CSV, et pour chaque membre :
 * modifier, fusionner avec un doublon, supprimer. Réservé à l'admin.
 */
export default function AccountsAdmin() {
  const confirmAction = useConfirm();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name_asc");
  const [editingAccount, setEditingAccount] = useState(null);
  const [mergingAccount, setMergingAccount] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

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
      setAccounts((list) => list.map((a) => (a.id === id ? { ...a, role, club_name: role === "club_manager" ? a.club_name : null } : a)));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleClubNameChange(id, clubName) {
    try {
      await setAccountClubName(id, clubName);
      setAccounts((list) => list.map((a) => (a.id === id ? { ...a, club_name: clubName?.trim() || null } : a)));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id, pseudo) {
    if (!(await confirmAction(`Supprimer le compte de ${pseudo} ?`))) return;
    try {
      await deleteAccount(id);
      setAccounts((list) => list.filter((a) => a.id !== id));
    } catch (e) {
      setError(e.message);
    }
  }

  function downloadCsv() {
    const header = "Pseudo,Prénom,Nom,Email,Rôle\n";
    const rows = accounts
      .map((a) => [a.pseudo, a.first_name, a.last_name, a.email || "", ROLE_LABELS[a.role] || a.role].map((v) => `"${(v || "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "membres-19pokerclub.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading) {
    return <div className="p-6 text-felt-cream/60 font-body">Chargement…</div>;
  }

  const filtered = accounts
    .filter((a) => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return (
        a.pseudo?.toLowerCase().includes(q) ||
        a.first_name?.toLowerCase().includes(q) ||
        a.last_name?.toLowerCase().includes(q) ||
        a.email?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === "name_desc") return b.pseudo.localeCompare(a.pseudo);
      if (sortBy === "recent") return new Date(b.created_at) - new Date(a.created_at);
      return a.pseudo.localeCompare(b.pseudo);
    });

  return (
    <div className="p-4 sm:p-6 font-body text-white h-full overflow-y-auto">
      <div className="w-full">
      <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40 mb-6">Membres</div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-felt-cream/40" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full bg-felt-panel border border-felt-cream/10 rounded-lg pl-9 pr-4 py-2.5 text-white placeholder:text-felt-cream/40"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="bg-felt-panel border border-felt-cream/10 rounded-lg px-3 py-2.5 text-sm text-white"
        >
          <option value="name_asc">Nom A-Z</option>
          <option value="name_desc">Nom Z-A</option>
          <option value="recent">Plus récents</option>
        </select>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-felt-gold hover:text-felt-gold/80"
        >
          <UserPlus size={16} /> Ajouter membre
        </button>
        <button
          onClick={() => setShowInvite(true)}
          className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-felt-gold hover:text-felt-gold/80"
        >
          <Mail size={16} /> Inviter un membre
        </button>
        <button
          onClick={downloadCsv}
          className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-felt-gold hover:text-felt-gold/80"
        >
          <Download size={16} /> Télécharger (CSV)
        </button>
      </div>

      {error && <div className="text-felt-alert text-sm mb-3">{error}</div>}

      <CustomizablePanel panelKey="members-list" defaultWidth="1 1 768px" defaultMaxWidth="768px" className="divide-y divide-felt-cream/5 border-t border-felt-cream/5">
        {filtered.map((a) => (
          <div
            key={a.id}
            style={{ backgroundColor: "var(--pcp-cell-bg)", color: "var(--pcp-cell-text)" }}
            className="flex flex-wrap items-center gap-3 py-3"
          >
            {a.avatar_data ? (
              <img src={a.avatar_data} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-felt-panel flex items-center justify-center text-felt-cream/40 font-display shrink-0">
                {a.pseudo?.[0]?.toUpperCase()}
              </div>
            )}
            <button onClick={() => setEditingAccount(a)} className="min-w-0 flex-1 text-left basis-32">
              <div className="pcp-title text-felt-gold hover:text-felt-gold/80 font-medium truncate">{a.pseudo}</div>
              {(a.first_name || a.last_name) && (
                <div className="pcp-body text-xs text-felt-cream/40 truncate">
                  {a.first_name} {a.last_name}
                </div>
              )}
              {a.club_name && a.role !== "club_manager" && (
                <div className="pcp-body text-[11px] text-felt-cream/40 truncate italic">Membre du {a.club_name}</div>
              )}
            </button>
            {a.role === "club_manager" && (
              <input
                defaultValue={a.club_name || ""}
                onBlur={(e) => e.target.value.trim() !== (a.club_name || "") && handleClubNameChange(a.id, e.target.value)}
                placeholder="Nom du club affilié"
                title="Nom du club affilié à ce gestionnaire de club"
                className="pcp-value w-36 shrink-0 bg-felt-bg border border-felt-gold/30 rounded-md px-2 py-1.5 text-sm text-felt-cream placeholder:text-felt-cream/30"
              />
            )}
            <div className="flex items-center gap-3 shrink-0 ml-auto sm:ml-0">
              {a.is_owner ? (
                <span
                  title="Le rôle de ce compte (fondateur du club) ne peut pas être changé ici : donnez le rôle admin à quelqu'un d'autre puis supprimez ce compte pour transférer l'accès."
                  className="pcp-value flex items-center gap-1.5 bg-felt-bg border border-felt-cream/10 rounded-md px-2 py-1.5 text-sm text-felt-gold shrink-0"
                >
                  <Lock size={13} /> Admin
                </span>
              ) : (
                <select
                  value={a.role}
                  onChange={(e) => handleRoleChange(a.id, e.target.value)}
                  className="pcp-value bg-felt-bg border border-felt-cream/10 rounded-md px-2 py-1.5 text-sm text-felt-gold shrink-0"
                >
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              )}
              <div className="flex items-center gap-3 shrink-0 text-felt-cream/50">
                <button onClick={() => setEditingAccount(a)} title="Modifier" className="hover:text-white">
                  <Pencil size={16} />
                </button>
                <button onClick={() => handleDelete(a.id, a.pseudo)} title="Supprimer" className="hover:text-felt-alert">
                  <Trash2 size={16} />
                </button>
                <button onClick={() => setMergingAccount(a)} title="Fusionner avec un autre compte" className="hover:text-white">
                  <Merge size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="text-sm text-felt-cream/50 py-6">Aucun membre ne correspond.</div>}
      </CustomizablePanel>

      <RolePermissionsMatrix />
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

      {mergingAccount && (
        <MergeAccountModal
          account={mergingAccount}
          accounts={accounts}
          onClose={() => setMergingAccount(null)}
          onMerged={async () => {
            setMergingAccount(null);
            await load();
          }}
        />
      )}

      {showAdd && (
        <AddAccountModal
          onClose={() => setShowAdd(false)}
          onCreated={(created) => {
            setAccounts((list) => [created, ...list]);
            setShowAdd(false);
          }}
        />
      )}

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}

function MergeAccountModal({ account, accounts, onClose, onMerged }) {
  const confirmAction = useConfirm();
  const [targetId, setTargetId] = useState("");
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState(null);
  const others = accounts.filter((a) => a.id !== account.id);

  async function handleConfirm() {
    if (!targetId) return;
    const target = others.find((a) => a.id === targetId);
    if (
      !(await confirmAction(
        `Fusionner "${target.pseudo}" dans "${account.pseudo}" ? Les inscriptions et points de "${target.pseudo}" seront transférés à "${account.pseudo}", puis "${target.pseudo}" sera supprimé. Cette action est irréversible.`
      ))
    )
      return;
    setMerging(true);
    setError(null);
    try {
      await mergeAccounts(account.id, targetId);
      onMerged();
    } catch (e) {
      setError(e.message);
    }
    setMerging(false);
  }

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm p-6 font-body text-felt-cream">
        <div className="font-display text-lg mb-2">Fusionner un doublon</div>
        <p className="text-sm text-felt-cream/50 mb-4">
          Choisissez le compte doublon de <span className="text-white">{account.pseudo}</span> à fusionner. Ses
          inscriptions et points de championnat seront transférés ici, puis il sera supprimé.
        </p>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="w-full bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream mb-4"
        >
          <option value="">Choisir un compte…</option>
          {others.map((a) => (
            <option key={a.id} value={a.id}>
              {a.pseudo} ({a.first_name} {a.last_name})
            </option>
          ))}
        </select>
        {error && <div className="text-felt-alert text-sm mb-3">{error}</div>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-felt-cream/60 hover:text-felt-cream">
            Annuler
          </button>
          <button
            onClick={handleConfirm}
            disabled={!targetId || merging}
            className="flex-1 px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
          >
            {merging ? "Fusion…" : "Fusionner"}
          </button>
        </div>
      </div>
    </div>
  );
}

function InviteModal({ onClose }) {
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetchClubSettings()
      .then((s) => setCode(s?.registration_code || ""))
      .catch(() => {});
  }, []);

  function copy() {
    navigator.clipboard?.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm p-6 font-body text-felt-cream text-center">
        <div className="font-display text-lg mb-2">Inviter un membre</div>
        <p className="text-sm text-felt-cream/50 mb-4">
          Partagez ce code secret : la personne le saisit à l'inscription pour rejoindre le club.
        </p>
        {code ? (
          <div className="flex items-center gap-2 bg-felt-bg border border-felt-cream/10 rounded-md px-4 py-3 mb-4">
            <div className="flex-1 font-display text-xl text-felt-gold tracking-widest">{code}</div>
            <button onClick={copy} className="text-felt-cream/50 hover:text-white" title="Copier">
              <Copy size={18} />
            </button>
          </div>
        ) : (
          <div className="text-sm text-felt-cream/40 mb-4">Aucun code défini — configurez-le dans Paramètres du club.</div>
        )}
        {copied && <div className="text-xs text-felt-gold mb-2">Copié !</div>}
        <button onClick={onClose} className="w-full px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display">
          Fermer
        </button>
      </div>
    </div>
  );
}

function AddAccountModal({ onClose, onCreated }) {
  const [pseudo, setPseudo] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("player");
  const [clubName, setClubName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleCreate() {
    if (!pseudo.trim() || !firstName.trim() || !lastName.trim() || !password.trim()) {
      setError("Pseudo, prénom, nom et mot de passe sont obligatoires.");
      return;
    }
    if (role === "club_manager" && !clubName.trim()) {
      setError("Le nom du club affilié est obligatoire pour un gestionnaire de club.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await adminCreateAccount({
        pseudo: pseudo.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password: password.trim(),
        role,
        clubName,
      });
      onCreated(created);
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm p-6 font-body text-felt-cream">
        <div className="font-display text-lg mb-4">Ajouter un membre</div>
        <div className="space-y-3">
          <Field label="Pseudo" value={pseudo} onChange={setPseudo} />
          <div className="flex gap-2">
            <Field label="Prénom" value={firstName} onChange={setFirstName} />
            <Field label="Nom" value={lastName} onChange={setLastName} />
          </div>
          <Field label="Email" value={email} onChange={setEmail} placeholder="optionnel" />
          <Field label="Mot de passe" value={password} onChange={setPassword} />
          <label className="block flex-1 text-xs text-felt-cream/50">
            Rôle
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream"
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {role === "club_manager" && (
            <Field label="Nom du club affilié" value={clubName} onChange={setClubName} placeholder="Ex : Poker Club de Brive" />
          )}
        </div>
        {error && <div className="text-felt-alert text-sm mt-3">{error}</div>}
        <div className="flex gap-2 mt-5">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-felt-cream/60 hover:text-felt-cream">
            Annuler
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="flex-1 px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
          >
            {saving ? "Création…" : "Créer"}
          </button>
        </div>
      </div>
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
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm p-6 font-body text-felt-cream max-h-[85vh] overflow-y-auto">
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
          <EditableButton
            groupKey="account-edit-modal"
            id="save"
            wrapperClassName="flex-1"
            onClick={handleSave}
            disabled={saving}
            className="w-full px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
          >
            {saving ? "Sauvegarde…" : "Enregistrer"}
          </EditableButton>
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

/**
 * RolePermissionsMatrix — tableau des droits par rôle, modifiable à
 * volonté par l'administrateur (cases à cocher), avec un cadenas en bout
 * de ligne pour figer un rôle (empêcher toute modification accidentelle
 * de ses droits). Stocké dans club_settings.theme.rolePermissions /
 * rolePermissionsLocked, et lu par les fonctions can*() de lib/auth.js
 * partout dans l'app.
 */
function RolePermissionsMatrix() {
  const { theme, setTheme } = useTheme();
  const perms = { ...DEFAULT_ROLE_PERMISSIONS, ...(theme.rolePermissions || {}) };
  const locked = theme.rolePermissionsLocked || {};
  // "club_manager" n'apparaît pas ici : ses droits sont toujours
  // circonscrits aux tournois interclubs et à son propre club (voir
  // lib/auth.js), jamais globaux — aucune case à cocher ne doit pouvoir lui
  // donner un droit sur tous les tournois ou tous les membres.
  const roles = Object.keys(ROLE_LABELS).filter((r) => r !== "admin" && r !== "club_manager");
  const permKeys = Object.keys(PERMISSION_LABELS);

  async function persist(next) {
    setTheme(next);
    const { data: existing } = await supabase.from("club_settings").select("id").limit(1).maybeSingle();
    const payload = { club_name: "19PokerClub", theme: next };
    if (existing) await supabase.from("club_settings").update(payload).eq("id", existing.id);
    else await supabase.from("club_settings").insert(payload);
  }

  function toggle(role, key) {
    if (locked[role]) return;
    const nextPerms = { ...perms, [role]: { ...perms[role], [key]: !perms[role]?.[key] } };
    persist({ ...theme, rolePermissions: nextPerms });
  }

  function toggleLock(role) {
    const nextLocked = { ...locked, [role]: !locked[role] };
    persist({ ...theme, rolePermissionsLocked: nextLocked });
  }

  return (
    <div className="mt-8 bg-felt-panel border border-felt-cream/10 rounded-md p-4 max-w-2xl mx-auto">
      <div className="font-display text-base mb-1">Droits par rôle</div>
      <div className="text-xs text-felt-cream/50 mb-4">
        Modifiable uniquement par l'administrateur. « Invité » a les mêmes droits que « Joueur » par défaut. Le rôle
        Administrateur a toujours tous les droits (non modifiable). Cliquez le cadenas pour figer un rôle et éviter
        toute modification accidentelle.
      </div>
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-felt-cream/40 text-xs">
              <th className="py-1.5 pr-3 font-normal">Rôle</th>
              {permKeys.map((k) => (
                <th key={k} className="py-1.5 px-2 font-normal text-center">
                  {PERMISSION_LABELS[k]}
                </th>
              ))}
              <th className="py-1.5 pl-2 font-normal text-center">Figer</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role} className="border-t border-felt-cream/5">
                <td className="py-2 pr-3 text-felt-cream/80">{ROLE_LABELS[role]}</td>
                {permKeys.map((k) => (
                  <td key={k} className="py-2 px-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!perms[role]?.[k]}
                      disabled={!!locked[role]}
                      onChange={() => toggle(role, k)}
                      className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </td>
                ))}
                <td className="py-2 pl-2 text-center">
                  <button
                    onClick={() => toggleLock(role)}
                    title={locked[role] ? "Déverrouiller ce rôle" : "Figer ce rôle"}
                    className={locked[role] ? "text-felt-gold" : "text-felt-cream/30 hover:text-felt-cream/60"}
                  >
                    {locked[role] ? <Lock size={15} /> : <LockOpen size={15} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Sur mobile, la matrice illisible en tableau devient une carte par
          rôle : une liste verticale de permissions, plus simple à lire et
          à toucher qu'un tableau compressé horizontalement. */}
      <div className="sm:hidden space-y-3">
        {roles.map((role) => (
          <div key={role} className="bg-felt-bg border border-felt-cream/10 rounded-md p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="font-display text-sm text-felt-cream/80">{ROLE_LABELS[role]}</div>
              <button
                onClick={() => toggleLock(role)}
                title={locked[role] ? "Déverrouiller ce rôle" : "Figer ce rôle"}
                className={`flex items-center gap-1 text-xs ${locked[role] ? "text-felt-gold" : "text-felt-cream/30 hover:text-felt-cream/60"}`}
              >
                {locked[role] ? <Lock size={14} /> : <LockOpen size={14} />}
                {locked[role] ? "Figé" : "Figer"}
              </button>
            </div>
            <div className="space-y-1.5">
              {permKeys.map((k) => (
                <label key={k} className="flex items-center justify-between gap-3 py-1 text-sm text-felt-cream/70">
                  <span>{PERMISSION_LABELS[k]}</span>
                  <input
                    type="checkbox"
                    checked={!!perms[role]?.[k]}
                    disabled={!!locked[role]}
                    onChange={() => toggle(role, k)}
                    className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 shrink-0"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
