import { useState } from "react";

const ADMIN_EMAIL = "19pokerclub@gmail.com";

/**
 * ContactAdminModal — formulaire "Contacter l'administrateur" : Nom,
 * Prénom, Description. "Envoyer" compose un e-mail (via le client mail de
 * l'appareil, faute de service d'envoi côté serveur) adressé à
 * 19pokerclub@gmail.com avec ces informations.
 */
export default function ContactAdminModal({ onClose }) {
  const [lastName, setLastName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState(null);

  function handleSend() {
    if (!lastName.trim() || !firstName.trim() || !description.trim()) {
      setError("Merci de remplir tous les champs.");
      return;
    }
    const subject = `Demande de ${firstName.trim()} ${lastName.trim()} — PokerClock Pro`;
    const body = `Nom : ${lastName.trim()}\nPrénom : ${firstName.trim()}\n\nDemande :\n${description.trim()}`;
    const url = `mailto:${ADMIN_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = url;
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[60] p-4">
      <div className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm p-6 font-body text-felt-cream">
        <div className="flex items-center justify-between mb-5">
          <div className="font-display text-lg">Contacter l'administrateur</div>
          <button onClick={onClose} className="text-felt-cream/50 hover:text-felt-cream">
            ✕
          </button>
        </div>

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
          <button onClick={handleSend} className="flex-1 px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display">
            Envoyer
          </button>
        </div>
      </div>
    </div>
  );
}
