import { useEffect, useState } from "react";
import {
  fetchPendingAccounts,
  approveAccount,
  rejectAccount,
  fetchContactMessages,
  markContactMessageRead,
  deleteContactMessage,
} from "../lib/auth.js";
import { useConfirm } from "../context/ConfirmContext.jsx";

/**
 * PendingAccountsModal — cloche de notifications de l'admin/TD : deux
 * sections, les nouvelles inscriptions en attente de validation, et les
 * messages "Contacter l'administrateur" reçus (gérés directement dans
 * l'app, sans e-mail).
 */
export default function PendingAccountsModal({ onClose, onChanged }) {
  const confirmAction = useConfirm();
  const [pending, setPending] = useState([]);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      setPending(await fetchPendingAccounts());
      setMessages(await fetchContactMessages());
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handleApprove(id) {
    setBusyId(id);
    try {
      await approveAccount(id);
      setPending((list) => list.filter((a) => a.id !== id));
      onChanged?.();
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  }

  async function handleReject(id, pseudo) {
    if (!(await confirmAction(`Refuser et supprimer l'inscription de ${pseudo} ?`))) return;
    setBusyId(id);
    try {
      await rejectAccount(id);
      setPending((list) => list.filter((a) => a.id !== id));
      onChanged?.();
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  }

  async function handleMarkRead(id) {
    setBusyId(id);
    try {
      await markContactMessageRead(id);
      setMessages((list) => list.map((m) => (m.id === id ? { ...m, status: "read" } : m)));
      onChanged?.();
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  }

  async function handleDeleteMessage(id) {
    if (!(await confirmAction("Supprimer ce message ?"))) return;
    setBusyId(id);
    try {
      await deleteContactMessage(id);
      setMessages((list) => list.filter((m) => m.id !== id));
      onChanged?.();
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  }

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-md p-6 font-body text-felt-cream max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="font-display text-lg">Notifications</div>
          <button onClick={onClose} className="text-felt-cream/50 hover:text-felt-cream">
            ✕
          </button>
        </div>

        {error && <div className="text-felt-alert text-sm mb-3">{error}</div>}

        <div className="flex-1 overflow-y-auto space-y-6">
          {loading ? (
            <div className="text-felt-cream/50 text-sm">Chargement…</div>
          ) : (
            <>
              <div>
                <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40 mb-2">
                  Inscriptions en attente
                </div>
                {pending.length === 0 ? (
                  <div className="text-felt-cream/50 text-sm">Aucune inscription en attente.</div>
                ) : (
                  <div className="space-y-2">
                    {pending.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2.5">
                        {a.avatar_data ? (
                          <img src={a.avatar_data} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-felt-panel flex items-center justify-center text-felt-cream/40 font-display shrink-0">
                            {a.pseudo?.[0]?.toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-white truncate">{a.pseudo}</div>
                          <div className="text-xs text-felt-cream/40 truncate">
                            {a.first_name} {a.last_name}
                          </div>
                        </div>
                        <button
                          onClick={() => handleReject(a.id, a.pseudo)}
                          disabled={busyId === a.id}
                          title="Refuser"
                          className="w-8 h-8 rounded-md bg-felt-bg border border-felt-alert/30 text-felt-alert flex items-center justify-center disabled:opacity-40"
                        >
                          ✕
                        </button>
                        <button
                          onClick={() => handleApprove(a.id)}
                          disabled={busyId === a.id}
                          title="Valider"
                          className="w-8 h-8 rounded-md bg-felt-gold text-felt-bg flex items-center justify-center disabled:opacity-40"
                        >
                          ✓
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40 mb-2">Messages reçus</div>
                {messages.length === 0 ? (
                  <div className="text-felt-cream/50 text-sm">Aucun message.</div>
                ) : (
                  <div className="space-y-2">
                    {messages.map((m) => (
                      <div
                        key={m.id}
                        className={`bg-felt-bg border rounded-md px-3 py-2.5 ${
                          m.status === "new" ? "border-felt-gold/40" : "border-felt-cream/10"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="text-white text-sm">
                            {m.first_name} {m.last_name}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {m.status === "new" && (
                              <button
                                onClick={() => handleMarkRead(m.id)}
                                disabled={busyId === m.id}
                                className="text-xs text-felt-gold hover:text-felt-gold/80"
                              >
                                Marquer lu
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteMessage(m.id)}
                              disabled={busyId === m.id}
                              className="text-xs text-felt-alert/60 hover:text-felt-alert"
                            >
                              🗑
                            </button>
                          </div>
                        </div>
                        <div className="text-xs text-felt-cream/60 whitespace-pre-line">{m.description}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="pt-4 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 text-felt-cream/60 hover:text-felt-cream">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
