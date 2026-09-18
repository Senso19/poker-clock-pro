/**
 * ToastStack — les messages en bas de page.
 *
 * Remplace les fenêtres qui s'ouvraient d'elles-mêmes pour proposer un
 * équilibrage ou une casse de table : une fenêtre modale interrompt ce
 * qu'on est en train de faire alors que la proposition, elle, peut
 * attendre. Le message se pose en bas, ne bloque rien, et s'ouvre en
 * fenêtre si on le touche.
 *
 * Les messages restent au-dessus de la barre du navigateur mobile grâce à
 * env(safe-area-inset-bottom), sinon les derniers passent dessous sur
 * iPhone.
 */
export default function ToastStack({ toasts, onDismiss }) {
  if (!toasts || toasts.length === 0) return null;
  return (
    <div
      className="fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-3 pointer-events-none"
      style={{ bottom: "calc(16px + env(safe-area-inset-bottom))" }}
    >
      {toasts.map((t) => {
        const cliquable = typeof t.onClick === "function";
        return (
          <div
            key={t.id}
            role={cliquable ? "button" : undefined}
            tabIndex={cliquable ? 0 : undefined}
            onClick={cliquable ? t.onClick : undefined}
            onKeyDown={cliquable ? (e) => (e.key === "Enter" || e.key === " ") && t.onClick() : undefined}
            className={`pointer-events-auto w-full max-w-md flex items-center gap-4 rounded-xl border px-5 py-3.5 shadow-lg bg-felt-panel ${
              t.accent ? "border-felt-gold/50" : "border-felt-cream/10"
            } ${cliquable ? "cursor-pointer hover:border-felt-gold" : ""}`}
          >
            <span className="pcp-body flex-1 min-w-0 text-felt-cream text-[15px] leading-snug">{t.text}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDismiss(t.id);
              }}
              className="shrink-0 text-felt-gold text-[15px] font-display hover:text-felt-gold/80"
            >
              Fermer
            </button>
          </div>
        );
      })}
    </div>
  );
}
