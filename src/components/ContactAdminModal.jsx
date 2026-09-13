import { useState } from "react";
import { useAccount } from "../context/AccountContext.jsx";
import { submitContactMessage } from "../lib/auth.js";

/**
 * ContactAdminModal — formulaire "Contacter l'administrateur" : Nom,
 * Prénom, Description. Le message est enregistré directement dans l'app
 * (table contact_messages) et consultable par l'admin/TD via la cloche —
 * pas d'envoi d'e-mail.
 */
export default function ContactAdminModal({ onClose }) {
  const { account } = useAccount();
  const [lastName, setLastName] = useState(account?.last_name || "");
  const [firstName, setFirstName] = useState(account?.first_name || "");
  const [description, setDescription] = useState("");
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSend() {
    if (!lastName.trim() || !firstName.trim() || !description.trim()) {
      setError("Merci de remplir tous les champs.");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await submitContactMessage({
        accountId: account?.id,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        description: description.trim(),
      });
      setSent(true);
    } catch (e) {
      setError(e.message);
    }
    setSending(false);
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm p-6 font-body text-felt-cream">
        <div className="flex items-center justify-between mb-5">
          <div className="font-display text-lg">Contacter l'administrateur</div>
          <button onClick={onClose} className="text-felt-cream/50 hover:text-felt-cream">
            ✕
          </button>
        </div>

        {sent ? (
          <div className="text-center py-4">
            <div className="text-3xl mb-2">✓</div>
            <div className="text-sm text-felt-cream/70 mb-5">
              Votre message a bien été envoyé à l'administrateur.
            </div>
            <button onClick={onClose} className="w-full px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display">
              Fermer
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              <label className="block text-xs text-felt-cream/50">
                Nom
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream"
                />
              </label>
              <label className="block text-xs text-felt-cream/50">
                Prénom
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream"
                />
              </label>
              <label className="block text-xs text-felt-cream/50">
                Description de la demande
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream resize-none"
                />
              </label>
            </div>

            {error && <div className="text-felt-alert text-sm mt-3">{error}</div>}

            <div className="flex gap-2 mt-5">
              <button onClick={onClose} className="flex-1 px-4 py-2 text-felt-cream/60 hover:text-felt-cream">
                Annuler
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex-1 px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
              >
                {sending ? "Envoi…" : "Envoyer"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
