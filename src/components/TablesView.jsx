import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import ClubLoader from "./ClubLoader.jsx";
import CustomizablePanel from "./CustomizablePanel.jsx";
import { playerLabel } from "../lib/players.js";
import { eliminatePlayer } from "../lib/eliminations.js";
import EliminationPicker from "./EliminationPicker.jsx";
import { useTableBalance } from "../context/TableBalanceContext.jsx";

/**
 * TablesView — onglet "Tables" : les joueurs regroupés par table, une
 * carte par table, lisible de loin et au doigt sur un téléphone.
 *
 * Une ligne par PLACE : numéro de siège, avatar, pseudo, puis le menu ⋮
 * des actions de placement. Les sièges inoccupés apparaissent en "Libre".
 *
 * Seuls les joueurs encore en jeu y figurent : un éliminé n'occupe plus
 * sa place, et son siège est justement celui qu'on peut réattribuer.
 *
 * Les montants de jetons ne figurent pas ici — cet écran sert à savoir
 * qui est assis où ; les tapis, rebuys et éliminations restent dans
 * l'onglet Joueurs.
 *
 * La vue se relit toute seule pour rester juste pendant la partie.
 */
export default function TablesView({ tournamentId, manage = false }) {
  // Les joueurs viennent de la page du tournoi, pas d'une lecture propre à
  // cet onglet : une seule sonde pour les onglets Joueurs et Tables, qui
  // ne peuvent donc plus se contredire, et une élimination faite ici est
  // vue tout de suite par la surveillance de l'équilibre des tables —
  // avant, il fallait passer par l'onglet Joueurs pour que le message
  // d'équilibrage ou de casse finisse par sortir.
  const { registrations, eliminatedIds, perTable, trackKnockouts, dataReady, recharger } = useTableBalance();
  const [openMenuId, setOpenMenuId] = useState(null);
  const [movingReg, setMovingReg] = useState(null);
  const [eliminatingReg, setEliminatingReg] = useState(null);
  const [winnerName, setWinnerName] = useState(null);

  // Un clic n'importe où ailleurs referme le menu ⋮ ouvert, comme dans
  // l'onglet Joueurs.
  useEffect(() => {
    if (!openMenuId) return undefined;
    const close = () => setOpenMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenuId]);

  async function deplacer(regId, table, seat) {
    await supabase.from("registrations").update({ table_number: table, seat_number: seat }).eq("id", regId);
    setMovingReg(null);
    setOpenMenuId(null);
    recharger();
  }

  // Sans suivi des knockouts, le "éliminé par qui ?" n'alimente plus
  // aucun compte : on sort le joueur directement.
  function demanderElimination(reg) {
    setOpenMenuId(null);
    if (trackKnockouts) setEliminatingReg(reg.id);
    else eliminer(reg, null);
  }

  async function eliminer(reg, eliminatedByRegId) {
    const stillIn = registrations.filter((r) => !eliminatedIds.has(r.id));
    const res = await eliminatePlayer({ tournamentId, reg, stillIn, eliminatedByRegId });
    setEliminatingReg(null);
    setOpenMenuId(null);
    if (res.winnerName) setWinnerName(res.winnerName);
    // On relit tout de suite : c'est cette relecture qui fait apparaître,
    // le cas échéant, le message « équilibrage » ou « la table casse » —
    // sans attendre le prochain tour de sonde ni un changement d'onglet.
    await recharger();
  }

  if (!dataReady) return <ClubLoader />;

  // Un joueur éliminé n'occupe plus sa place : son siège doit ressortir
  // comme libre, puisque c'est exactement celui qu'on peut réattribuer.
  // On le retire donc avant de composer les tables plutôt que de
  // l'afficher barré.
  const enJeu = registrations.filter((r) => !eliminatedIds.has(r.id));
  const assis = enJeu.filter((r) => r.table_number);
  // Les joueurs encore en jeu mais sans table sont regroupés à part
  // plutôt que masqués : un joueur non placé est justement ce qu'on
  // cherche à repérer ici.
  const sansTable = enJeu.filter((r) => !r.table_number);
  const numerosTables = [...new Set(assis.map((r) => r.table_number))].sort((a, b) => a - b);

  if (numerosTables.length === 0 && sansTable.length === 0) {
    // Distinguer les deux cas : une table vide en début de tournoi et une
    // table vidée par les éliminations ne demandent pas la même chose.
    return (
      <div className="p-6 text-felt-cream/60 font-body">
        {registrations.length === 0 ? "Aucun joueur inscrit." : "Plus aucun joueur en jeu."}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 font-body text-white h-full overflow-y-auto">
      {/* Une carte par table : autant par rangée qu'il en tient, centrées.
          Une grille à nombre de colonnes fixe laissait une table seule
          coincée en haut à gauche d'un écran PC, les deux tiers de la
          largeur vides — vu en 1920. Ici chaque carte fait entre la
          largeur disponible et 560 px : une table seule est centrée à une
          taille lisible, trois remplissent un 1920 et quatre un 2560.
          Le plafond de 560 px n'est pas arbitraire : à 620 px, trois
          tables ne tenaient plus que deux par rangée sur un écran 1920.
          Le min(100%, 380px) est là pour les téléphones étroits : un
          minimum fixe déborderait sous cette largeur.
          Elles suivent les réglages 🎨 du tableau comme partout ailleurs. */}
      <CustomizablePanel
        panelKey="tables-view"
        defaultWidth="1 1 100%"
        className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,380px),560px))] justify-center gap-4 sm:gap-6 items-start"
      >
        {numerosTables.map((num) => {
          const joueurs = assis.filter((r) => r.table_number === num);
          return (
            <CarteTable
              key={num}
              titre={`Table ${num}`}
              sousTitre={`${joueurs.length} joueur${joueurs.length > 1 ? "s" : ""} sur ${perTable} place${perTable > 1 ? "s" : ""}`}
              sieges={construireSieges(joueurs, perTable)}
              manage={manage}
              openMenuId={openMenuId}
              setOpenMenuId={setOpenMenuId}
              onDeplacer={(reg) => setMovingReg(reg)}
              onEliminer={demanderElimination}
              eliminatingReg={eliminatingReg}
              onConfirmElimination={eliminer}
              onCancelElimination={() => setEliminatingReg(null)}
              adversaires={enJeu}
            />
          );
        })}

        {sansTable.length > 0 && (
          <CarteTable
            titre="Sans table"
            sousTitre={`${sansTable.length} joueur${sansTable.length > 1 ? "s" : ""} à placer`}
            sieges={sansTable.map((r) => ({ numero: null, joueur: r }))}
            manage={manage}
            alerte
            openMenuId={openMenuId}
            setOpenMenuId={setOpenMenuId}
            onDeplacer={(reg) => setMovingReg(reg)}
            onEliminer={demanderElimination}
            eliminatingReg={eliminatingReg}
            onConfirmElimination={eliminer}
            onCancelElimination={() => setEliminatingReg(null)}
            adversaires={enJeu}
          />
        )}
      </CustomizablePanel>

      {winnerName && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setWinnerName(null)}>
          <div className="bg-felt-panel border border-felt-gold rounded-lg p-8 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl mb-3">🏆</div>
            <div className="font-display text-2xl text-felt-gold mb-1">{winnerName}</div>
            <div className="text-felt-cream/60 text-sm mb-5">a gagné le tournoi !</div>
            <button onClick={() => setWinnerName(null)} className="px-5 py-2 bg-felt-gold text-felt-bg rounded-md font-display">
              Fermer
            </button>
          </div>
        </div>
      )}

      {/* ModalePlacement reçoit les joueurs encore EN JEU, pas tous les
          inscrits : un siège libéré par une élimination doit ressortir
          comme libre, sinon il reste impossible à réattribuer. */}
      {movingReg && (
        <ModalePlacement
          reg={movingReg}
          registrations={enJeu}
          perTable={perTable}
          numerosTables={numerosTables}
          onClose={() => setMovingReg(null)}
          onConfirm={deplacer}
        />
      )}
    </div>
  );
}

/**
 * construireSieges — une entrée par PLACE de la table, pas par joueur,
 * pour que les sièges vides apparaissent au lieu d'être sautés.
 *
 * On va jusqu'au plus grand des deux : la capacité réglée du tournoi et
 * le plus haut siège réellement occupé. Sans ça, un joueur assis au siège
 * 9 d'une table réglée à 8 disparaîtrait purement et simplement.
 *
 * Un siège peut porter plusieurs joueurs : ça n'est pas censé arriver,
 * mais ça arrive (deux inscriptions tombées sur la même place), et c'est
 * précisément ce que cet écran doit donner à voir plutôt que d'en cacher
 * un. Les joueurs d'une table sans numéro de siège sont ajoutés à la fin.
 */
function construireSieges(joueurs, perTable) {
  const siegeMax = Math.max(perTable || 0, ...joueurs.map((r) => r.seat_number || 0));
  const sieges = [];
  for (let n = 1; n <= siegeMax; n++) {
    const occupants = joueurs.filter((r) => r.seat_number === n);
    if (occupants.length === 0) sieges.push({ numero: n, joueur: null });
    else occupants.forEach((joueur) => sieges.push({ numero: n, joueur }));
  }
  joueurs.filter((r) => !r.seat_number).forEach((joueur) => sieges.push({ numero: null, joueur }));
  return sieges;
}

function CarteTable({ titre, sousTitre, sieges, manage, alerte, openMenuId, setOpenMenuId, onDeplacer, onEliminer, eliminatingReg, onConfirmElimination, onCancelElimination, adversaires }) {
  return (
    <div
      style={{ backgroundColor: "var(--pcp-cell-bg, #171C24)", color: "var(--pcp-cell-text, inherit)" }}
      className={`pcp-card-hover rounded-2xl border px-4 sm:px-6 py-5 ${alerte ? "border-felt-alert/40" : "border-felt-cream/10"}`}
    >
      <div className="mb-4">
        <div className="pcp-title font-display text-2xl sm:text-3xl text-felt-cream">{titre}</div>
        <div className="pcp-body text-sm text-felt-cream/40 mt-0.5">{sousTitre}</div>
      </div>

      <div>
        {sieges.map((s, i) =>
          s.joueur ? (
            <LigneJoueur
              key={s.joueur.id}
              reg={s.joueur}
              numeroSiege={s.numero}
              manage={manage}
              menuOuvert={openMenuId === s.joueur.id}
              setOpenMenuId={setOpenMenuId}
              onDeplacer={onDeplacer}
              onEliminer={onEliminer}
              eliminatingReg={eliminatingReg}
              onConfirmElimination={onConfirmElimination}
              onCancelElimination={onCancelElimination}
              adversaires={adversaires}
            />
          ) : (
            <LigneSiegeLibre key={`libre-${s.numero}-${i}`} numeroSiege={s.numero} />
          )
        )}
      </div>
    </div>
  );
}

function LigneJoueur({ reg, numeroSiege, manage, menuOuvert, setOpenMenuId, onDeplacer, onEliminer, eliminatingReg, onConfirmElimination, onCancelElimination, adversaires }) {
  const nom = playerLabel(reg) || "?";
  return (
    <div>
    <div className="relative flex items-center gap-4 py-3">
      <div className="flex items-center gap-2 shrink-0 w-14">
        <IconeSiege />
        <span className="pcp-value font-display text-xl text-felt-gold tabular-nums">{numeroSiege ?? "—"}</span>
      </div>

      {reg.accounts?.avatar_data ? (
        <img
          src={reg.accounts.avatar_data}
          alt=""
          className="w-12 h-12 rounded-full object-cover shrink-0 ring-2 ring-felt-gold/70"
        />
      ) : (
        <span className="w-12 h-12 rounded-full bg-felt-bg/60 flex items-center justify-center text-base text-felt-cream/50 shrink-0 ring-2 ring-felt-gold/40">
          {nom[0]?.toUpperCase() || "?"}
        </span>
      )}

      <span className="pcp-body flex-1 min-w-0 truncate text-lg font-medium">{nom}</span>

      {manage && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(menuOuvert ? null : reg.id);
          }}
          title="Actions sur ce joueur"
          className="shrink-0 px-2 text-felt-cream/50 hover:text-felt-cream text-xl leading-none"
        >
          ⋮
        </button>
      )}

      {menuOuvert && (
        <div className="absolute right-2 top-12 z-20 bg-felt-bg border border-felt-gold/40 rounded-md shadow-lg py-1 w-52 text-sm">
          <ElementMenu onClick={() => onDeplacer(reg)}>Changer de table / siège</ElementMenu>
          <ElementMenu alerte onClick={() => onEliminer(reg)}>
            Éliminé
          </ElementMenu>
        </div>
      )}
    </div>

    {eliminatingReg === reg.id && (
      <EliminationPicker
        candidates={adversaires.filter((r) => r.id !== reg.id)}
        onConfirm={(byId) => onConfirmElimination(reg, byId)}
        onCancel={onCancelElimination}
      />
    )}
    </div>
  );
}

/**
 * Siège inoccupé. Volontairement discret — même hauteur qu'une ligne
 * occupée pour que la table garde sa forme, mais sans rien qui accroche
 * l'œil : ce sont les joueurs qu'on vient lire, la place libre n'est
 * qu'une information de fond.
 */
function LigneSiegeLibre({ numeroSiege }) {
  return (
    <div className="flex items-center gap-4 py-3 opacity-30">
      <div className="flex items-center gap-2 shrink-0 w-14">
        <IconeSiege />
        <span className="pcp-value font-display text-xl text-felt-cream tabular-nums">{numeroSiege}</span>
      </div>
      <span className="w-12 h-12 rounded-full border border-dashed border-felt-cream/40 shrink-0" />
      <span className="pcp-body flex-1 min-w-0 truncate text-lg italic text-felt-cream/70">Libre</span>
      {/* Réserve la place du menu ⋮ pour que les pseudos des lignes
          occupées restent alignés avec ceux des lignes libres. */}
      <span className="shrink-0 px-2 text-xl leading-none invisible">⋮</span>
    </div>
  );
}

function ElementMenu({ children, onClick, alerte }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`w-full text-left px-3 py-2 hover:bg-felt-panel ${alerte ? "text-felt-alert" : "text-felt-cream/80"}`}
    >
      {children}
    </button>
  );
}

/**
 * Petite chaise, en SVG plutôt qu'en emoji : les emojis de mobilier ne
 * sont pas rendus de la même façon d'un appareil à l'autre, et certains
 * apparaissent en couleur au milieu d'une ligne monochrome.
 *
 * Tracé vu de face (dossier plein, assise, deux pieds) : comparé à
 * quatre autres dans le navigateur, c'est le seul qui reste identifiable
 * à 20 px — les versions de profil se réduisent à des traits illisibles.
 */
function IconeSiege() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0 text-felt-cream/70" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 4h10v7H7z" />
      <path d="M5 11h14" />
      <path d="M5 11v3h14v-3" />
      <path d="M7 14v6" />
      <path d="M17 14v6" />
    </svg>
  );
}

/**
 * Choix de la table et du siège. Les sièges déjà pris sont désactivés :
 * placer deux joueurs au même siège est la faute que cet écran doit
 * rendre impossible, pas seulement signaler après coup.
 */
function ModalePlacement({ reg, registrations, perTable, numerosTables, onClose, onConfirm }) {
  const [table, setTable] = useState(reg.table_number || numerosTables[0] || 1);
  const [siege, setSiege] = useState(reg.seat_number || 1);

  const occupes = new Set(
    registrations
      .filter((r) => r.id !== reg.id && r.table_number === Number(table) && r.seat_number)
      .map((r) => r.seat_number)
  );

  // Une table de plus que celles existantes, pour pouvoir en ouvrir une.
  const tablesProposees = [...new Set([...numerosTables, (numerosTables[numerosTables.length - 1] || 0) + 1])];
  const siegeLibre = !occupes.has(Number(siege));

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-felt-panel border border-felt-gold/40 rounded-lg p-5 w-80 max-w-full" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-lg text-felt-cream mb-1">Placer {playerLabel(reg) || "ce joueur"}</div>
        <div className="text-xs text-felt-cream/50 mb-4">
          {reg.table_number ? `Actuellement table ${reg.table_number}, siège ${reg.seat_number || "—"}` : "Pas encore placé"}
        </div>

        <label className="block text-sm text-felt-cream/70 mb-1">Table</label>
        <select
          value={table}
          onChange={(e) => setTable(Number(e.target.value))}
          className="w-full bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-sm mb-3 text-felt-cream"
        >
          {tablesProposees.map((t) => (
            <option key={t} value={t}>
              Table {t}
              {numerosTables.includes(t) ? "" : " (nouvelle)"}
            </option>
          ))}
        </select>

        <label className="block text-sm text-felt-cream/70 mb-1">Siège</label>
        <select
          value={siege}
          onChange={(e) => setSiege(Number(e.target.value))}
          className="w-full bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-sm text-felt-cream"
        >
          {Array.from({ length: perTable }, (_, i) => i + 1).map((s) => (
            <option key={s} value={s} disabled={occupes.has(s)}>
              Siège {s}
              {occupes.has(s) ? " — occupé" : ""}
            </option>
          ))}
        </select>

        {!siegeLibre && <div className="text-xs text-felt-alert mt-2">Ce siège est déjà occupé.</div>}

        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-felt-cream/60 hover:text-felt-cream">
            Annuler
          </button>
          <button
            onClick={() => onConfirm(reg.id, Number(table), Number(siege))}
            disabled={!siegeLibre}
            className="px-4 py-1.5 text-sm bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
          >
            Placer
          </button>
        </div>
      </div>
    </div>
  );
}
