import { useMemo, useState } from "react";

const AVATAR_COLORS = ["#C9A15A", "#8C3A3A", "#3A6B8C", "#3A8C5E", "#8C5A3A", "#6B3A8C"];

function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function initials(name) {
  const parts = (name || "").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/**
 * RegisterPlayerModal — "Inscrire un joueur" façon BlindValet : deux onglets,
 * "Membre du club" (recherche parmi les joueurs déjà connus du club) et
 * "Ajouter nouveau" (créer un joueur qui n'existe pas encore).
 */
export default function RegisterPlayerModal({
  registeredCount,
  members,
  registeredMemberIds,
  onRegisterExisting,
  onRegisterNew,
  onClose,
}) {
  const [tab, setTab] = useState("club");
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);

  const available = useMemo(() => {
    const q = search.trim().toLowerCase();
    return members
      .filter((m) => !registeredMemberIds.has(m.id))
      .filter((m) => !q || m.pseudo.toLowerCase().includes(q))
      .sort((a, b) => a.pseudo.localeCompare(b.pseudo));
  }, [members, registeredMemberIds, search]);

  async function handlePick(member) {
    setBusy(true);
    await onRegisterExisting(member);
    setBusy(false);
  }

  async function handleAddNew() {
    if (!newName.trim()) return;
    setBusy(true);
    await onRegisterNew(newName.trim());
    setBusy(false);
    setNewName("");
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-md font-body text-felt-cream max-h-[85vh] flex flex-col">
        <div className="px-6 py-5 border-b border-felt-cream/10">
          <div className="font-display text-lg">
            Inscrire un joueur <span className="text-felt-gold">({registeredCount})</span>
          </div>
          <div className="text-felt-cream/50 text-sm mt-1">Choisir un membre du club ou ajouter un nouveau joueur</div>
        </div>

        <div className="flex border-b border-felt-cream/10 shrink-0">
          <button
            onClick={() => setTab("club")}
            className={`flex-1 py-3 text-sm font-display text-center border-b-2 -mb-px ${
              tab === "club" ? "border-felt-gold text-felt-gold" : "border-transparent text-felt-cream/50 hover:text-felt-cream"
            }`}
          >
            Membre du club
          </button>
          <button
            onClick={() => setTab("new")}
            className={`flex-1 py-3 text-sm font-display text-center border-b-2 -mb-px ${
              tab === "new" ? "border-felt-gold text-felt-gold" : "border-transparent text-felt-cream/50 hover:text-felt-cream"
            }`}
          >
            Ajouter nouveau
          </button>
        </div>

        {tab === "club" ? (
          <>
            <div className="px-4 pt-3 shrink-0">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔍 Rechercher"
                autoFocus
                className="w-full bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-sm text-felt-cream placeholder:text-felt-cream/40"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-2">
              {available.length === 0 ? (
                <div className="text-felt-cream/40 text-sm py-6 text-center">
                  {search ? "Aucun membre ne correspond." : "Tous les membres du club sont déjà inscrits."}
                </div>
              ) : (
                available.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 py-2.5 border-b border-felt-cream/5">
                    {m.avatar_data ? (
                      <img src={m.avatar_data} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-display text-felt-cream shrink-0"
                        style={{ backgroundColor: avatarColor(m.pseudo) }}
                      >
                        {initials(m.pseudo)}
                      </div>
                    )}
                    <div className="flex-1 min-w-0 truncate">{m.pseudo}</div>
                    <button
                      onClick={() => handlePick(m)}
                      disabled={busy}
                      title="Inscrire ce membre"
                      className="w-8 h-8 rounded-md bg-felt-bg border border-felt-cream/10 flex items-center justify-center text-felt-cream/70 hover:text-felt-gold hover:border-felt-gold/40 disabled:opacity-40"
                    >
                      👤
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 px-6 py-5">
            <label className="block text-xs text-felt-cream/50 mb-1.5">
              Nom du joueur
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddNew()}
                placeholder="Prénom Nom"
                autoFocus
                className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
              />
            </label>
            <button
              onClick={handleAddNew}
              disabled={!newName.trim() || busy}
              className="mt-4 w-full px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
            >
              {busy ? "Inscription…" : "+ Inscrire"}
            </button>
          </div>
        )}

        <div className="px-6 py-4 border-t border-felt-cream/10 flex justify-end shrink-0">
          <button onClick={onClose} className="px-4 py-2 text-felt-cream/60 hover:text-felt-cream">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
