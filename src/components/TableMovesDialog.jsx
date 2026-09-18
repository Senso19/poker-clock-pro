import { playerLabel } from "../lib/players.js";

/**
 * TableMovesDialog — la fenêtre des déplacements proposés, pour une casse
 * de table comme pour un rééquilibrage.
 *
 * Une seule fenêtre pour les deux : elles disaient la même chose avec deux
 * mises en page différentes. Ce qui change est l'illustration, le titre et
 * le nombre mis en avant.
 *
 * Chaque ligne se lit d'un coup d'œil : l'avatar et le pseudo, puis le
 * trajet "S6 → T1/S6" — départ effacé, arrivée en gras, parce que c'est
 * l'arrivée qu'on va annoncer au joueur.
 */
export default function TableMovesDialog({ kind, moves, tableNumber, busy, onConfirm, onClose }) {
  const casse = kind === "break";
  const titre = casse ? "La table casse" : "Équilibrage des tables";
  const libelleConfirmer = casse ? "Casser la table" : "Déplacer";

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-felt-panel border border-felt-cream/10 rounded-2xl p-6 w-full max-w-md max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-display text-2xl text-felt-cream mb-5">{titre}</div>

        <div className="flex items-center justify-center gap-8 mb-6">
          {casse ? <IllustrationCasse /> : <IllustrationBalance />}
          <div className="text-center">
            <div className="text-sm text-felt-cream/50 font-body">{casse ? "Table" : "Joueurs"}</div>
            <div className="font-display text-5xl text-felt-cream leading-none mt-1">
              {casse ? tableNumber ?? "—" : moves.length}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto -mx-1 px-1">
          {moves.map((m) => (
            <div key={m.reg.id} className="flex items-center gap-3 py-3 border-t border-felt-cream/10 first:border-t-0">
              {m.reg.accounts?.avatar_data ? (
                <img src={m.reg.accounts.avatar_data} alt="" className="w-10 h-10 rounded-full object-cover shrink-0" />
              ) : (
                <span className="w-10 h-10 rounded-full bg-felt-bg/60 flex items-center justify-center text-sm text-felt-cream/50 shrink-0">
                  {(playerLabel(m.reg) || "?")[0]?.toUpperCase()}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="pcp-body text-felt-cream truncate">{playerLabel(m.reg) || "?"}</div>
                <div className="text-sm text-felt-cream/50 font-body tabular-nums">
                  {m.fromSeat ? `S${m.fromSeat}` : "—"}
                  <span className="text-felt-gold mx-2">→</span>
                  <span className="text-felt-cream font-medium">
                    T{m.toTable}/S{m.toSeat}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end items-center gap-4 pt-5">
          <button onClick={onClose} className="text-felt-cream/60 hover:text-felt-cream font-display">
            Fermer
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="px-5 py-2 bg-felt-gold text-felt-bg rounded-lg font-display disabled:opacity-40"
          >
            {busy ? "Application…" : libelleConfirmer}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Table barrée d'un éclair. Comparée à deux autres tracés dans le
 * navigateur à sa taille réelle : le plateau, le pied et le socle ne
 * deviennent lisibles qu'à partir d'une opacité de 0,55, et l'éclair doit
 * traverser la table en diagonale plutôt que de se poser dessus, sinon il
 * la masque au lieu de la casser.
 */
function IllustrationCasse() {
  return (
    <svg viewBox="0 0 64 64" className="w-20 h-20 shrink-0" aria-hidden="true">
      <g fill="none" stroke="#EDEAE3" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round">
        <ellipse cx="32" cy="26" rx="24" ry="9" />
        <path d="M32 35v16M20 55h24" />
      </g>
      <path d="M44 2 32 22h8L30 42l20-24h-9z" fill="#F77515" />
    </svg>
  );
}

/**
 * Balance PENCHÉE, pas à l'équilibre : cette fenêtre s'ouvre justement
 * parce que les tables ne le sont pas. Une balance droite illustrerait
 * l'état visé, pas celui qu'on vient corriger.
 */
function IllustrationBalance() {
  return (
    <svg viewBox="0 0 64 64" className="w-20 h-20 shrink-0" aria-hidden="true">
      <g fill="none" stroke="#EDEAE3" strokeOpacity="0.55" strokeWidth="3" strokeLinecap="round">
        <path d="M32 12v40M22 54h20" />
        <path d="M9 14l46 10" />
      </g>
      <g fill="none" stroke="#F77515" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 16a9 7 0 0 0 14 0zM48 26a9 7 0 0 0 14 0z" />
      </g>
    </svg>
  );
}
