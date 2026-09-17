import { useEffect, useState } from "react";
import ClubLoader from "./ClubLoader.jsx";
import { UserPlus, Pencil, Trash2 } from "lucide-react";
import { useAccount } from "../context/AccountContext.jsx";
import { fetchClubMembers, createClubMember, adminUpdateAccount, deleteAccount } from "../lib/auth.js";
import { useConfirm } from "../context/ConfirmContext.jsx";
import AvatarCropper from "./AvatarCropper.jsx";

/**
 * ClubMembersManager — "Mon club", réservé au rôle "gestionnaire de club".
 * Permet de créer/gérer les comptes membres de son propre club (affilié par
 * l'administrateur) : chaque membre créé ici hérite automatiquement du nom
 * du club. Ces membres pourront ensuite être inscrits dans les tournois
 * interclubs (jusqu'à 10 par tournoi) depuis l'écran "Joueurs" du tournoi,
 * qui filtre déjà la liste sur ce même club.
 */
export default function ClubMembersManager() {
  const { account } = useAccount();
  const confirmAction = useConfirm();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editingMember, setEditingMember] = useState(null);

  useEffect(() => {
    load();
  }, [account?.club_name]);

  async function load() {
    setLoading(true);
    try {
      setMembers(await fetchClubMembers(account?.club_name));
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handleDelete(id, pseudo) {
    if (!(await confirmAction(`Supprimer le compte de ${pseudo} ?`))) return;
    try {
      await deleteAccount(id);
      setMembers((list) => list.filter((m) => m.id !== id));
    } catch (e) {
      setError(e.message);
    }
  }

  if (!account?.club_name) {
    return (
      <div className="p-6 text-felt-cream/60 font-body">
        Aucun club ne vous est affilié pour le moment — contactez l'administrateur.
      </div>
    );
  }

  if (loading) {
    return <ClubLoader />;
  }

  return (
    <div className="p-4 sm:p-6 font-body text-white h-full overflow-y-auto">
      <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40 mb-1">Mon club</div>
      <div className="font-display text-xl text-felt-gold mb-6">{account.club_name}</div>

      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-2.5 text-sm text-felt-gold hover:text-felt-gold/80"
        >
          <UserPlus size={16} /> Ajouter un membre
        </button>
      </div>

      {error && <div className="text-felt-alert text-sm mb-3">{error}</div>}

      <div className="max-w-2xl divide-y divide-felt-cream/5 border-t border-felt-cream/5">
        {members.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-3 py-3">
            {m.avatar_data ? (
              <img src={m.avatar_data} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-felt-panel flex items-center justify-center text-felt-cream/40 font-display shrink-0">
                {m.pseudo?.[0]?.toUpperCase()}
              </div>
            )}
            <div className="min-w-0 flex-1 basis-32">
              <div className="text-white font-medium truncate">{m.pseudo}</div>
              {(m.first_name || m.last_name) && (
                <div className="text-xs text-felt-cream/40 truncate">
                  {m.first_name} {m.last_name}
                </div>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-auto text-felt-cream/50">
              <button onClick={() => setEditingMember(m)} title="Modifier" className="hover:text-white">
                <Pencil size={16} />
              </button>
              <button onClick={() => handleDelete(m.id, m.pseudo)} title="Supprimer" className="hover:text-felt-alert">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        {members.length === 0 && <div className="text-sm text-felt-cream/50 py-6">Aucun membre pour l'instant.</div>}
      </div>

      {showAdd && (
        <AddClubMemberModal
          managerAccount={account}
          onClose={() => setShowAdd(false)}
          onCreated={(created) => {
            setMembers((list) => [...list, created].sort((a, b) => a.pseudo.localeCompare(b.pseudo)));
            setShowAdd(false);
          }}
        />
      )}

      {editingMember && (
        <EditClubMemberModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSaved={(updated) => {
            setMembers((list) => list.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)));
            setEditingMember(null);
          }}
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

function AddClubMemberModal({ managerAccount, onClose, onCreated }) {
  const [pseudo, setPseudo] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function handleCreate() {
    if (!pseudo.trim() || !firstName.trim() || !lastName.trim() || !password.trim()) {
      setError("Pseudo, prénom, nom et mot de passe sont obligatoires.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const created = await createClubMember(managerAccount, {
        pseudo: pseudo.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password: password.trim(),
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
        <div className="font-display text-lg mb-1">Ajouter un membre</div>
        <div className="text-xs text-felt-cream/40 mb-4">Club : {managerAccount.club_name}</div>
        <div className="space-y-3">
          <Field label="Pseudo" value={pseudo} onChange={setPseudo} />
          <div className="flex gap-2">
            <Field label="Prénom" value={firstName} onChange={setFirstName} />
            <Field label="Nom" value={lastName} onChange={setLastName} />
          </div>
          <Field label="Email" value={email} onChange={setEmail} placeholder="optionnel" />
          <Field label="Mot de passe" value={password} onChange={setPassword} />
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

function EditClubMemberModal({ member, onClose, onSaved }) {
  const [pseudo, setPseudo] = useState(member.pseudo || "");
  const [firstName, setFirstName] = useState(member.first_name || "");
  const [lastName, setLastName] = useState(member.last_name || "");
  const [email, setEmail] = useState(member.email || "");
  const [password, setPassword] = useState("");
  const [avatarData, setAvatarData] = useState(member.avatar_data || null);
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
      const updated = await adminUpdateAccount(member.id, {
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
        <div className="font-display text-lg mb-5">Modifier le membre</div>

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
          <Field label="Nouveau mot de passe" value={password} onChange={setPassword} placeholder="laisser vide pour ne pas changer" />
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
