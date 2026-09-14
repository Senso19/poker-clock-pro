/**
 * TicketModal — fenêtre d'affichage d'un ticket imprimable (TicketPrint en
 * enfant). Réutilisée dans la fiche d'un tournoi et dans le Registre
 * d'inscription (après validation d'un joueur).
 */
export default function TicketModal({ children, onClose }) {
  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 print:bg-white print:static">
      <div onClick={(e) => e.stopPropagation()} className="bg-felt-panel rounded-lg p-6 relative print:bg-transparent print:p-0">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 text-felt-cream/50 hover:text-felt-cream text-sm print:hidden"
        >
          ✕ Fermer
        </button>
        {children}
      </div>
    </div>
  );
}
