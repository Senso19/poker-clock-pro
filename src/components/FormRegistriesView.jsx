import { useEffect, useState } from "react";
import { fetchFormRegistries, createFormRegistry, deleteFormRegistry } from "../lib/forms.js";
import { useConfirm } from "../context/ConfirmContext.jsx";
import CustomizablePanel from "./CustomizablePanel.jsx";
import FormRegistryDetail from "./FormRegistryDetail.jsx";

/**
 * FormRegistriesView — liste des registres d'inscription (Festival/Open) :
 * un registre par événement, chacun avec son propre formulaire public et
 * son propre registre de soumissions à valider.
 */
export default function FormRegistriesView() {
  const confirmAction = useConfirm();
  const [registries, setRegistries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setRegistries(await fetchFormRegistries());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const created = await createFormRegistry(newName.trim());
      setNewName("");
      setCreating(false);
      await load();
      setOpenId(created.id);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDelete(id, name) {
    if (!(await confirmAction(`Supprimer le registre "${name}" et toutes ses inscriptions ?`))) return;
    try {
      await deleteFormRegistry(id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (openId) {
    return <FormRegistryDetail registryId={openId} onBack={() => { setOpenId(null); load(); }} />;
  }

  if (loading) {
    return <div className="p-6 text-felt-cream/60 font-body">Chargement…</div>;
  }

  return (
    <div className="p-4 sm:p-6 font-body text-white h-full overflow-y-auto">
      <div className="flex items-baseline justify-between mb-6">
        <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40">
          Inscriptions Festival et Open
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2.5 bg-felt-gold text-felt-bg rounded-lg text-sm font-display hover:bg-felt-gold/90"
        >
          + Nouveau registre
        </button>
      </div>

      {error && <div className="text-felt-alert text-sm mb-3">{error}</div>}

      {creating && (
        <div className="mb-6 max-w-sm flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ex : Festival 2026"
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="flex-1 bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/30"
          />
          <button onClick={handleCreate} className="px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display text-sm">
            Créer
          </button>
        </div>
      )}

      {registries.length === 0 ? (
        <div className="text-sm text-felt-cream/50">Aucun registre pour le moment.</div>
      ) : (
        <CustomizablePanel
          panelKey="form-registries-grid"
          defaultWidth="1 1 100%"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {registries.map((r) => (
            <button
              key={r.id}
              onClick={() => setOpenId(r.id)}
              className="text-left bg-felt-panel border border-felt-cream/10 rounded-xl p-6 hover:border-felt-cream/30 transition-colors"
            >
              <div className="font-display text-2xl text-white mb-2 truncate">{r.name}</div>
              <div className="text-sm text-felt-cream/40 mb-4">/inscription/{r.slug}</div>
              <div className="flex items-center gap-2 mb-4">
                <span
                  className={`text-sm px-3 py-1.5 rounded-full ${
                    r.is_open ? "bg-emerald-500/15 text-emerald-400" : "bg-felt-bg text-felt-cream/50"
                  }`}
                >
                  {r.is_open ? "Ouvert" : "Fermé"}
                </span>
                {r.tournaments?.name ? (
                  <span className="text-sm px-3 py-1.5 rounded-full bg-felt-gold/10 text-felt-gold truncate">
                    {r.tournaments.name}
                  </span>
                ) : (
                  <span className="text-sm px-3 py-1.5 rounded-full bg-felt-bg text-felt-cream/40">Aucun tournoi lié</span>
                )}
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete(r.id, r.name);
                }}
                className="text-xs text-felt-alert/60 hover:text-felt-alert"
              >
                🗑 Supprimer
              </button>
            </button>
          ))}
        </CustomizablePanel>
      )}
    </div>
  );
}
