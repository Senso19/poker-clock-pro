import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePolling } from "../lib/usePolling.js";
import { supabase } from "../lib/supabase.js";
import { sortByPlayerLabel } from "../lib/players.js";
import { computeBreakMoves, computeRebalanceMoves, applyTableMoves } from "../lib/tableBalance.js";
import ToastStack from "../components/ToastStack.jsx";
import TableMovesDialog from "../components/TableMovesDialog.jsx";

/**
 * TableBalanceContext — les inscriptions, les éliminations, et la
 * surveillance de l'équilibre des tables, au niveau de la PAGE du tournoi.
 *
 * Avant, tout ça vivait dans l'onglet Joueurs. Comme cet onglet n'est
 * monté que lorsqu'il est affiché, la proposition d'équilibrage ou de
 * casse n'apparaissait qu'en y entrant : éliminer un joueur depuis
 * l'onglet Tables ne déclenchait rien tant qu'on n'était pas repassé par
 * Joueurs, et même dans Joueurs il fallait souvent sortir puis revenir
 * pour que le message sorte.
 *
 * Ici, la surveillance tourne tant que la page du tournoi est ouverte,
 * quel que soit l'onglet affiché. Le message du bas de page et les
 * fenêtres de déplacement sont rendus par ce fournisseur lui-même, donc
 * au-dessus de n'importe quel onglet.
 *
 * Les onglets Joueurs et Tables lisent leurs joueurs ici plutôt que
 * chacun de leur côté : une seule sonde au lieu de deux, et les deux
 * écrans ne peuvent plus se contredire.
 */
const TableBalanceContext = createContext(null);

export function useTableBalance() {
  return useContext(TableBalanceContext);
}

export function TableBalanceProvider({ tournamentId, tournament, surveiller = false, actif = true, children }) {
  const [registrations, setRegistrations] = useState([]);
  const [eliminations, setEliminations] = useState([]);
  // Les suggestions d'équilibrage ne doivent pas se prononcer avant que
  // les éliminations soient connues : tant qu'elles manquent, TOUS les
  // inscrits encore assis comptent comme en jeu, y compris ceux sortis il
  // y a deux heures dont le siège n'a jamais été libéré.
  const [dataReady, setDataReady] = useState(false);
  const [breakProposal, setBreakProposal] = useState(null);
  const [rebalanceProposal, setRebalanceProposal] = useState(null);
  const [balancing, setBalancing] = useState(false);
  // Messages du bas de page. Deux familles : les propositions
  // (équilibrage, casse), qui restent tant qu'elles ont lieu d'être et
  // s'ouvrent au clic ; et les comptes rendus de déplacement, qui
  // s'effacent tout seuls.
  const [toasts, setToasts] = useState([]);

  const perTable = tournament?.players_per_table || 9;
  const finalTableSize = tournament?.final_table_size || perTable;

  const eliminatedIds = useMemo(
    () => new Set(eliminations.map((e) => e.registration_id)),
    [eliminations]
  );

  // Identifiant stable pour une proposition, afin de ne jamais empiler
  // deux fois le même message tant qu'il est à l'écran.
  const poserToast = useCallback((t) => {
    setToasts((prev) => (prev.some((x) => x.id === t.id) ? prev : [...prev, t]));
    if (t.duree) setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== t.id)), t.duree);
  }, []);

  const retirerToast = useCallback((id) => {
    // On renvoie prev tel quel quand il n'y a rien à retirer : la sonde
    // appelle cette fonction toutes les 5 secondes pour les propositions
    // qui n'ont plus lieu d'être, et un nouveau tableau à chaque passage
    // provoquerait un rendu pour rien.
    setToasts((prev) => (prev.some((t) => t.id === id) ? prev.filter((t) => t.id !== id) : prev));
  }, []);

  const chargerInscriptions = useCallback(async () => {
    const { data } = await supabase
      .from("registrations")
      .select("*, players(id, full_name, first_name, last_name, club, pseudo), accounts(avatar_data, pseudo, club_name)")
      .eq("tournament_id", tournamentId)
      .order("registered_at", { ascending: true });
    // Tri alphabétique sur le nom affiché. Il se fait ici et pas en SQL :
    // le libellé vient de plusieurs tables jointes (pseudo du joueur, à
    // défaut celui du compte, à défaut le nom complet), et localeCompare
    // gère les accents, que l'ordre SQL par défaut classe mal.
    const triees = sortByPlayerLabel(data);
    setRegistrations(triees);
    return triees;
  }, [tournamentId]);

  const chargerEliminations = useCallback(async () => {
    const { data } = await supabase
      .from("eliminations")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("undone", false)
      .order("eliminated_at", { ascending: true });
    const lignes = data || [];
    setEliminations(lignes);
    return lignes;
  }, [tournamentId]);

  // En parallèle plutôt qu'à la suite : enchaînés, il existait un rendu
  // intermédiaire où les inscriptions étaient là et les éliminations pas
  // encore — de quoi croire à un déséquilibre qui n'existait pas.
  // Renvoie ce qui vient d'être lu : un appelant qui enchaîne un calcul
  // juste après (placer un joueur puis rééquilibrer) travaillerait sinon
  // sur l'état du rendu précédent, c'est-à-dire d'avant son écriture.
  const recharger = useCallback(async () => {
    const [regs, elims] = await Promise.all([chargerInscriptions(), chargerEliminations()]);
    setDataReady(true);
    return { registrations: regs, eliminations: elims };
  }, [chargerInscriptions, chargerEliminations]);

  useEffect(() => {
    setDataReady(false);
    recharger();
  }, [recharger]);

  // Les écritures en masse (import, tirage des places, application d'un
  // déplacement) suspendent la sonde le temps qu'elles durent : sans ça
  // elle lit un état à moitié appliqué.
  const suspensionsRef = useRef(new Set());
  const suspendre = useCallback((cle, suspendu) => {
    if (suspendu) suspensionsRef.current.add(cle);
    else suspensionsRef.current.delete(cle);
  }, []);

  // On ne relit pas non plus pendant qu'une proposition est affichée :
  // les déplacements montrés ont été calculés sur l'état courant, et les
  // voir bouger sous les yeux n'aiderait personne.
  useEffect(() => {
    suspendre("proposition", !!(breakProposal || rebalanceProposal || balancing));
  }, [breakProposal, rebalanceProposal, balancing, suspendre]);

  usePolling(
    () => {
      if (suspensionsRef.current.size > 0) return;
      recharger();
    },
    5000,
    { actif: actif && !!tournamentId, immediat: false }
  );

  // "donnees" permet de calculer sur ce que recharger() vient de renvoyer
  // plutôt que sur l'état du rendu en cours ; sans argument, on prend
  // l'état courant.
  const calculerCasse = useCallback(
    (donnees) =>
      computeBreakMoves({
        registrations: donnees?.registrations || registrations,
        eliminations: donnees?.eliminations || eliminatedIds,
        perTable,
        finalTableSize,
      }),
    [registrations, eliminatedIds, perTable, finalTableSize]
  );
  const calculerEquilibrage = useCallback(
    (donnees) =>
      computeRebalanceMoves({
        registrations: donnees?.registrations || registrations,
        eliminations: donnees?.eliminations || eliminatedIds,
        perTable,
      }),
    [registrations, eliminatedIds, perTable]
  );

  const appliquerDeplacements = useCallback(
    async (moves, kind, label) => {
      if (!moves || moves.length === 0) return;
      setBalancing(true);
      try {
        const appliques = await applyTableMoves({ tournamentId, moves, kind, label });
        appliques.forEach((m) => {
          // Un message par joueur déplacé : c'est ce qu'on lit à voix
          // haute à la table. Il s'efface seul après vingt secondes, le
          // temps de faire passer le joueur.
          poserToast({
            id: `deplacement-${m.regId}-${Date.now()}`,
            text: `${m.nom} : (Table ${m.toTable} · Place ${m.toSeat})`,
            duree: 20000,
          });
        });
        await recharger();
      } finally {
        setBalancing(false);
      }
    },
    [tournamentId, poserToast, recharger]
  );

  // Le message du bas de page garde la fonction qu'on lui a donnée au
  // moment où il est apparu, et il peut rester à l'écran plusieurs
  // minutes. On passe donc par une référence tenue à jour : au clic, les
  // déplacements proposés sont recalculés sur les joueurs d'AUJOURD'HUI,
  // pas sur ceux d'il y a cinq éliminations.
  const calculRef = useRef({ casse: calculerCasse, equilibrage: calculerEquilibrage });
  useEffect(() => {
    calculRef.current = { casse: calculerCasse, equilibrage: calculerEquilibrage };
  }, [calculerCasse, calculerEquilibrage]);

  const proposerCasse = useCallback(() => {
    const moves = calculRef.current.casse();
    if (moves.length > 0) setBreakProposal(moves);
    return moves.length > 0;
  }, []);

  const proposerEquilibrage = useCallback(() => {
    const moves = calculRef.current.equilibrage();
    if (moves.length > 0) setRebalanceProposal(moves);
    return moves.length > 0;
  }, []);

  // Dès que "Casser une table" ou "Équilibrer les tables" devient
  // possible (transition, pas à chaque rendu), un message apparaît en bas
  // de page. Il est cliquable : il ouvre la fenêtre des déplacements
  // proposés. Comme ce fournisseur vit au niveau de la page, le message
  // sort immédiatement, sur n'importe quel onglet.
  const wasNeedingBreakRef = useRef(false);
  const wasNeedingRebalanceRef = useRef(false);
  useEffect(() => {
    // Tant que tout n'est pas chargé, on ne calcule rien ET on ne touche
    // pas aux refs : sinon la première mesure, faussée, servirait de
    // point de comparaison aux suivantes.
    if (!surveiller || !dataReady) return;

    const breakMoves = calculerCasse();
    const needsBreak = breakMoves.length > 0;
    if (needsBreak && !wasNeedingBreakRef.current && !breakProposal) {
      poserToast({
        id: "casse",
        accent: true,
        text: `💥 La table casse : ${breakMoves[0].fromTable}`,
        onClick: () => {
          retirerToast("casse");
          proposerCasse();
        },
      });
    }
    // Le message disparaît de lui-même quand la situation se résout
    // autrement (une élimination, un déplacement manuel).
    if (!needsBreak) retirerToast("casse");
    wasNeedingBreakRef.current = needsBreak;

    const needsRebalance = calculerEquilibrage().length > 0;
    if (needsRebalance && !wasNeedingRebalanceRef.current && !rebalanceProposal && !needsBreak) {
      poserToast({
        id: "equilibrage",
        accent: true,
        text: "⚖ Équilibrage recommandé — toucher pour voir le déplacement",
        onClick: () => {
          retirerToast("equilibrage");
          proposerEquilibrage();
        },
      });
    }
    if (!needsRebalance || needsBreak) retirerToast("equilibrage");
    wasNeedingRebalanceRef.current = needsRebalance;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrations, eliminations, dataReady, surveiller]);

  const valeur = useMemo(
    () => ({
      registrations,
      eliminations,
      eliminatedIds,
      dataReady,
      perTable,
      finalTableSize,
      balancing,
      recharger,
      suspendre,
      poserToast,
      retirerToast,
      calculerCasse,
      calculerEquilibrage,
      proposerCasse,
      proposerEquilibrage,
      appliquerDeplacements,
    }),
    [
      registrations,
      eliminations,
      eliminatedIds,
      dataReady,
      perTable,
      finalTableSize,
      balancing,
      recharger,
      suspendre,
      poserToast,
      retirerToast,
      calculerCasse,
      calculerEquilibrage,
      proposerCasse,
      proposerEquilibrage,
      appliquerDeplacements,
    ]
  );

  return (
    <TableBalanceContext.Provider value={valeur}>
      {children}
      {breakProposal && (
        <TableMovesDialog
          kind="break"
          moves={breakProposal}
          tableNumber={breakProposal[0]?.fromTable}
          busy={balancing}
          onConfirm={async () => {
            await appliquerDeplacements(breakProposal, "balance", "Casser une table");
            setBreakProposal(null);
          }}
          onClose={() => setBreakProposal(null)}
        />
      )}
      {rebalanceProposal && (
        <TableMovesDialog
          kind="balance"
          moves={rebalanceProposal}
          busy={balancing}
          onConfirm={async () => {
            await appliquerDeplacements(rebalanceProposal, "balance", "Équilibrer les tables");
            setRebalanceProposal(null);
          }}
          onClose={() => setRebalanceProposal(null)}
        />
      )}
      <ToastStack toasts={toasts} onDismiss={retirerToast} />
    </TableBalanceContext.Provider>
  );
}
