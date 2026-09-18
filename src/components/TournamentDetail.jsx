import { useEffect, useRef, useState } from "react";
import ClubLoader from "./ClubLoader.jsx";
import { supabase } from "../lib/supabase.js";

import { importPlayersFromFile, exportResultsToExcel } from "./SheetsSync.jsx";
import { computeTournamentPoints, fetchChampionships, computeFinishPositions } from "../lib/points.js";
import { selectTournament } from "../lib/tournaments.js";
import { fetchAllAccounts, assignTableCaptain, fetchTableCaptainAssignments, canParticipate, isClubManager, MAX_CLUB_REGS_PER_INTERCLUB } from "../lib/auth.js";
import { useAccount } from "../context/AccountContext.jsx";
import TicketPrint from "./TicketPrint.jsx";
import TicketModal from "./TicketModal.jsx";
import SeatPickerModal from "./SeatPickerModal.jsx";
import RegisterPlayerModal from "./RegisterPlayerModal.jsx";
import TableSeatingModal from "./TableSeatingModal.jsx";
import ActionJournalModal from "./ActionJournalModal.jsx";
import CustomizablePanel from "./CustomizablePanel.jsx";
import EditableButton from "./EditableButton.jsx";
import { useConfirm } from "../context/ConfirmContext.jsx";
import { logEvent } from "../lib/events.js";
import { useTableBalance } from "../context/TableBalanceContext.jsx";
import { groupActiveByTable, findFreeSeat } from "../lib/tableBalance.js";
import { eliminatePlayer } from "../lib/eliminations.js";
import EliminationPicker from "./EliminationPicker.jsx";
import { playerLabel } from "../lib/players.js";
import { addAnnouncement } from "../lib/announcements.js";
import { useIsMobile } from "../lib/useIsMobile.js";

/**
 * TournamentDetail — gestion complète d'UN tournoi précis (admin/TD), façon
 * BlindValet : colonne de gauche avec les paramètres du tournoi (max
 * joueurs, joueurs par table, table finale, places réservées, inscriptions),
 * colonne de droite avec la liste des joueurs inscrits (place/nom/tapis) et
 * un menu d'actions par joueur (ticket, rebuy, addon, changer de table,
 * éliminer, désinscrire).
 */
export default function TournamentDetail({ tournamentId, onBack }) {
  const confirmAction = useConfirm();
  const { account } = useAccount();
  const isMobile = useIsMobile();
  // Un gestionnaire de club (dans un tournoi interclubs) ne peut inscrire
  // que les membres de son propre club, jusqu'à MAX_CLUB_REGS_PER_INTERCLUB.
  const isClubMgr = isClubManager(account?.role);
  const [mobileSubTab, setMobileSubTab] = useState("params"); // "params" | "table" — sous-onglets mobile uniquement
  const [tournament, setTournament] = useState(null);
  // Les inscriptions, les éliminations et la surveillance de l'équilibre
  // des tables appartiennent à la page du tournoi (TableBalanceContext) et
  // non plus à cet onglet : cet onglet-ci n'existe que pendant qu'on le
  // regarde, si bien que la proposition de casser ou d'équilibrer
  // n'apparaissait qu'en y entrant. Le message du bas de page et les
  // fenêtres de déplacement sont rendus là-haut, au-dessus de tous les
  // onglets.
  const {
    registrations,
    eliminations,
    dataReady,
    balancing,
    recharger,
    suspendre,
    calculerCasse,
    calculerEquilibrage,
    proposerCasse,
    proposerEquilibrage,
    appliquerDeplacements,
  } = useTableBalance();
  const [championships, setChampionships] = useState([]);
  const [clubPlayers, setClubPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showRegister, setShowRegister] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [showTableSeating, setShowTableSeating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showPasteImport, setShowPasteImport] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [eliminatingReg, setEliminatingReg] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editingStackId, setEditingStackId] = useState(null);
  const [stackDraft, setStackDraft] = useState("");
  const [movingReg, setMovingReg] = useState(null);
  const [shuffling, setShuffling] = useState(false);
  const [winnerAnnounce, setWinnerAnnounce] = useState(null);
  const [captainAccounts, setCaptainAccounts] = useState([]);
  const [tableCaptains, setTableCaptains] = useState([]);
  const fileInputRef = useRef(null);
  const isFreezeout = tournament?.structure_config?.tournamentType === "freezeout";

  useEffect(() => {
    selectTournament(tournamentId);
    loadEverything();
    fetchChampionships().then(setChampionships).catch(() => {});
    fetchAllAccounts().then(setCaptainAccounts).catch(() => {});
    supabase
      .from("players")
      .select("id, full_name")
      .order("full_name", { ascending: true })
      .then(({ data }) => setClubPlayers(data || []));
  }, [tournamentId]);

  // La sonde qui relit les joueurs tourne au niveau de la page. On la
  // suspend seulement pendant nos écritures en masse, pour qu'elle ne
  // lise pas un état à moitié appliqué.
  useEffect(() => {
    suspendre("detail", importing || shuffling);
  }, [importing, shuffling, suspendre]);

  // Ferme le menu ⋮ d'un joueur dès qu'on clique ailleurs sur la page.
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenuId]);

  async function loadEverything() {
    setLoading(true);
    try {
      const { data: t, error: tErr } = await supabase
        .from("tournaments")
        .select("*, championships(name)")
        .eq("id", tournamentId)
        .single();
      if (tErr) throw tErr;
      setTournament(t);
      fetchTableCaptainAssignments(tournamentId).then(setTableCaptains).catch(() => {});
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function updateSetting(field, raw) {
    const num = Math.max(0, Number(raw) || 0);
    setTournament((t) => ({ ...t, [field]: num }));
    await supabase.from("tournaments").update({ [field]: num }).eq("id", tournamentId);
  }

  async function updateRegistrationOpen(open) {
    setTournament((t) => ({ ...t, registration_open: open }));
    await supabase.from("tournaments").update({ registration_open: open }).eq("id", tournamentId);
  }

  // Attribution du prochain siège vraiment libre : on vérifie les sièges
  // réellement occupés par des joueurs ENCORE EN JEU (les éliminés libèrent
  // leur place) plutôt que de se fier à un simple compteur, qui pouvait
  // retomber sur un siège déjà pris dès que des places avaient été
  // déplacées manuellement, rééquilibrées, ou que le compteur se
  // désynchronisait pendant un import en lot.
  function computeOccupiedSeats(regs) {
    const eliminatedNow = new Set(eliminations.map((e) => e.registration_id));
    return new Set(regs.filter((r) => !eliminatedNow.has(r.id)).map((r) => `${r.table_number}-${r.seat_number}`));
  }
  function nextFreeSeat(occupied, perTable) {
    let table = 1;
    while (table < 1000) {
      for (let seat = 1; seat <= perTable; seat++) {
        const key = `${table}-${seat}`;
        if (!occupied.has(key)) return { table, seat, key };
      }
      table += 1;
    }
    return { table, seat: 1, key: `${table}-1` };
  }

  // Répare les sièges où plusieurs joueurs ENCORE EN JEU se retrouvent au
  // même siège (données existantes d'avant ce correctif, ou déplacements
  // manuels antérieurs) : garde le premier, déplace les autres vers le
  // prochain siège libre.
  async function repairDuplicateSeats() {
    const eliminatedNow = new Set(eliminations.map((e) => e.registration_id));
    const bySeat = {};
    registrations.forEach((r) => {
      if (eliminatedNow.has(r.id)) return;
      const key = `${r.table_number}-${r.seat_number}`;
      if (!bySeat[key]) bySeat[key] = [];
      bySeat[key].push(r);
    });
    const occupied = computeOccupiedSeats(registrations);
    const perTable = tournament?.players_per_table || 9;
    const updates = [];
    Object.values(bySeat).forEach((group) => {
      for (let i = 1; i < group.length; i++) {
        const { table, seat, key } = nextFreeSeat(occupied, perTable);
        occupied.add(key);
        updates.push(supabase.from("registrations").update({ table_number: table, seat_number: seat }).eq("id", group[i].id));
      }
    });
    if (updates.length === 0) return;
    await Promise.all(updates);
    await recharger();
  }

  async function findOrCreatePlayer(name) {
    const existing = clubPlayers.find((p) => p.full_name.trim().toLowerCase() === name.trim().toLowerCase());
    if (existing) return existing;
    const { data: created, error: pErr } = await supabase
      .from("players")
      .insert({ full_name: name })
      .select()
      .single();
    if (pErr) throw pErr;
    setClubPlayers((prev) => [...prev, created]);
    return created;
  }

  async function registerOnePlayer(name, accountId = null) {
    const player = await findOrCreatePlayer(name);

    // Un joueur ne peut être inscrit qu'une fois au même tournoi. Le
    // contrôle interroge la base plutôt que l'état local : pendant un
    // import en masse, `registrations` n'est pas rafraîchi entre deux
    // lignes, et deux fois le même nom dans le même fichier passeraient
    // tous les deux.
    const { data: dejaInscrit } = await supabase
      .from("registrations")
      .select("id, account_id")
      .eq("tournament_id", tournamentId)
      .eq("player_id", player.id)
      .limit(1)
      .maybeSingle();
    if (dejaInscrit) {
      // Cas courant : le directeur a inscrit le joueur à la main (donc
      // sans compte lié), et on le réinscrit ensuite en le désignant par
      // son compte. On rattache le compte à la ligne existante au lieu
      // d'en créer une seconde.
      if (accountId && !dejaInscrit.account_id) {
        await supabase.from("registrations").update({ account_id: accountId }).eq("id", dejaInscrit.id);
      }
      const err = new Error(`${player.full_name} est déjà inscrit à ce tournoi.`);
      err.code = "DEJA_INSCRIT";
      throw err;
    }

    // Plus d'attribution automatique de table/siège à l'inscription (quel
    // que soit l'état du tournoi) — ça se fait désormais uniquement via
    // "Tirer les places" (tous les joueurs) ou le bouton individuel
    // "Attribuer un siège" (un joueur sans siège après un tirage déjà fait).
    const { data: reg, error: regErr } = await supabase
      .from("registrations")
      .insert({
        tournament_id: tournamentId,
        player_id: player.id,
        account_id: accountId,
        table_number: null,
        seat_number: null,
        stack: tournament.starting_stack,
      })
      .select("*, players(id, full_name, first_name, last_name, club, pseudo), accounts(avatar_data, pseudo, club_name)")
      .single();
    if (regErr) throw regErr;

    logEvent(tournamentId, "register", player.full_name, { registrationId: reg.id, playerId: player.id, accountId });
    return reg;
  }

  async function assignSeatTo(reg) {
    try {
      const perTable = tournament?.players_per_table || 9;
      const { byTable } = groupActiveByTable(registrations, eliminations);
      const usedTables = Object.keys(byTable).map(Number);
      const withRoom = usedTables.filter((t) => byTable[t].length < perTable);

      if (withRoom.length > 0) {
        // Une place existe déjà quelque part : on l'utilise directement.
        const table = withRoom[Math.floor(Math.random() * withRoom.length)];
        const occupied = computeOccupiedSeats(registrations);
        const seat = findFreeSeat(occupied, table, perTable) || 1;
        await supabase.from("registrations").update({ table_number: table, seat_number: seat }).eq("id", reg.id);
        addAnnouncement(tournamentId, `${reg.players?.pseudo || reg.players?.full_name} placé Table ${table} Siège ${seat}`, "move");
        await recharger();
      } else {
        // Plus aucune place nulle part : on ouvre une nouvelle table pour ce
        // joueur, puis on rééquilibre pour récupérer des joueurs déjà assis
        // et optimiser la répartition sur toutes les tables (y compris la
        // nouvelle), plutôt que de le laisser seul à sa table.
        const newTable = usedTables.length > 0 ? Math.max(...usedTables) + 1 : 1;
        await supabase.from("registrations").update({ table_number: newTable, seat_number: 1 }).eq("id", reg.id);
        addAnnouncement(tournamentId, `${reg.players?.pseudo || reg.players?.full_name} placé Table ${newTable} Siège 1 (nouvelle table)`, "move");
        const frais = await recharger();
        const moves = calculerEquilibrage(frais);
        if (moves.length > 0) await appliquerDeplacements(moves, "balance", "Nouvelle table + équilibrage");
      }
    } catch (e) {
      setError(e.message);
    }
    setOpenMenuId(null);
  }

  // Une inscription en cours de tournoi (places déjà tirées) reçoit
  // directement un siège : sans ça le joueur restait sans place jusqu'à ce
  // qu'on pense à le placer à la main. Avant le tirage, on ne touche à
  // rien — c'est "Tirer les places" qui répartit tout le monde.
  async function seatIfTournamentUnderway(reg) {
    if (reg && tournament?.seats_drawn) await assignSeatTo(reg);
    else await recharger();
  }

  // Nombre de membres du club du gestionnaire déjà inscrits à CE tournoi
  // interclubs (utilisé pour plafonner à MAX_CLUB_REGS_PER_INTERCLUB).
  function myClubRegistrationsCount() {
    if (!isClubMgr || !account?.club_name) return 0;
    return registrations.filter((r) => r.accounts?.club_name === account.club_name).length;
  }

  // "Membre du club" = un vrai compte de l'app (pas n'importe quel nom déjà
  // tapé lors d'un tournoi précédent). On lie la registration à ce compte.
  async function handleRegisterExisting(pickedAccount) {
    if (isClubMgr && tournament?.is_interclub && myClubRegistrationsCount() >= MAX_CLUB_REGS_PER_INTERCLUB) {
      setError(`Vous avez déjà inscrit ${MAX_CLUB_REGS_PER_INTERCLUB} membres de votre club à ce tournoi interclubs (maximum).`);
      return;
    }
    try {
      const reg = await registerOnePlayer(pickedAccount.pseudo, pickedAccount.id);
      await seatIfTournamentUnderway(reg);
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleRegisterNew(name) {
    // Un gestionnaire de club ne peut inscrire que des membres existants de
    // son club (voir "Mon club") — jamais un joueur ajouté au vol, qui
    // n'appartiendrait à aucun club et échapperait au plafond.
    if (isClubMgr && tournament?.is_interclub) return;
    try {
      const reg = await registerOnePlayer(name);
      await seatIfTournamentUnderway(reg);
    } catch (e) {
      setError(e.message);
    }
  }

  function messageIgnores(n) {
    return n > 1
      ? `${n} joueurs étaient déjà inscrits à ce tournoi : ils ont été ignorés.`
      : "1 joueur était déjà inscrit à ce tournoi : il a été ignoré.";
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const players = await importPlayersFromFile(file);
      let ignores = 0;
      for (const p of players) {
        if (!p.fullName?.trim()) continue;
        // Un déjà-inscrit ne doit pas interrompre l'import : on le passe
        // et on le signale à la fin, sinon une liste de cinquante noms
        // s'arrêterait au premier joueur déjà présent.
        try {
          await registerOnePlayer(p.fullName.trim());
        } catch (err) {
          if (err.code !== "DEJA_INSCRIT") throw err;
          ignores += 1;
        }
      }
      await recharger();
      if (ignores > 0) setError(messageIgnores(ignores));
    } catch (e) {
      setError(e.message);
    }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handlePasteImport(text) {
    // Une ligne par joueur (copié/collé depuis BlindValet ou ailleurs, tant
    // qu'aucun export de fichier n'est disponible, ex: en cours de tournoi).
    // Le copié-collé d'un écran BlindValet inclut aussi les initiales des
    // avatars (ex: "F", "MR") et les stacks isolés (ex: "25000") comme des
    // lignes séparées — on les filtre pour ne garder que de vrais noms.
    const names = text
      .split("\n")
      .map((l) => l.replace(/^[\d.)\-•\s]+/, "").trim()) // retire numéros de liste, tirets, puces
      .filter(Boolean)
      .filter((l) => !/^\d+$/.test(l)) // stack isolé, ex: "25000"
      .filter((l) => !/^[A-ZÀ-Ý]{1,3}$/.test(l)); // initiales d'avatar, ex: "F", "MR"
    if (names.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      let ignores = 0;
      for (const name of names) {
        try {
          await registerOnePlayer(name);
        } catch (err) {
          if (err.code !== "DEJA_INSCRIT") throw err;
          ignores += 1;
        }
      }
      await recharger();
      if (ignores > 0) setError(messageIgnores(ignores));
    } catch (e) {
      setError(e.message);
    }
    setImporting(false);
  }

  async function addRebuy(reg) {
    await supabase
      .from("registrations")
      .update({ rebuys: (reg.rebuys || 0) + 1 })
      .eq("id", reg.id);
    await recharger();
    setTicket({ type: "rebuy", reg });
    setOpenMenuId(null);
  }

  async function addAddon(reg) {
    await supabase
      .from("registrations")
      .update({ addons: (reg.addons || 0) + 1 })
      .eq("id", reg.id);
    await recharger();
    setTicket({ type: "addon", reg });
    setOpenMenuId(null);
  }

  function startEditStack(reg) {
    setEditingStackId(reg.id);
    setStackDraft(String(reg.stack ?? 0));
    setOpenMenuId(null);
  }

  async function commitStack(reg) {
    const val = Math.max(0, Number(stackDraft) || 0);
    setEditingStackId(null);
    await supabase.from("registrations").update({ stack: val }).eq("id", reg.id);
    await recharger();
  }

  function startMoveTable(reg) {
    setMovingReg(reg);
    setOpenMenuId(null);
  }

  async function commitSeatMove(table, seat) {
    if (!movingReg) return;
    const reg = movingReg;
    setMovingReg(null);
    try {
      await supabase.from("registrations").update({ table_number: table, seat_number: seat }).eq("id", reg.id);
      await recharger();
    } catch (e) {
      setError(e.message);
    }
  }

  async function moveSeatDirect(regId, table, seat) {
    try {
      await supabase.from("registrations").update({ table_number: table, seat_number: seat }).eq("id", regId);
      await recharger();
    } catch (e) {
      setError(e.message);
    }
  }

  async function updateStackDirect(regId, stack) {
    try {
      await supabase.from("registrations").update({ stack }).eq("id", regId);
      await recharger();
    } catch (e) {
      setError(e.message);
    }
  }

  async function unregisterPlayer(reg) {
    setOpenMenuId(null);
    if (!(await confirmAction(`Désinscrire ${reg.players?.full_name} ?`))) return;
    try {
      await supabase.from("registrations").delete().eq("id", reg.id);
      await recharger();
    } catch (e) {
      setError(e.message);
    }
  }

  async function shuffleSeats() {
    setShuffling(true);
    setError(null);
    try {
      const perTable = tournament?.players_per_table || 9;
      // Instantané des places AVANT tirage, pour pouvoir annuler cette
      // action précisément depuis le Journal de tournoi.
      const before = registrations.map((r) => ({ registrationId: r.id, table_number: r.table_number, seat_number: r.seat_number }));
      const shuffled = [...registrations].sort(() => Math.random() - 0.5);
      await Promise.all(
        shuffled.map((reg, i) => {
          const table = Math.floor(i / perTable) + 1;
          const seat = (i % perTable) + 1;
          return supabase.from("registrations").update({ table_number: table, seat_number: seat }).eq("id", reg.id);
        })
      );
      await supabase.from("tournaments").update({ seats_drawn: true }).eq("id", tournamentId);
      setTournament((t) => ({ ...t, seats_drawn: true }));
      logEvent(tournamentId, "shuffle", "Tirage des places", { before });
      // Liste triée alphabétiquement par pseudo, pour le défilement vertical
      // continu du panneau Annonces (remplace le mode "ticker" normal
      // jusqu'à ce que l'admin l'arrête explicitement).
      const drawList = shuffled
        .map((reg, i) => ({
          pseudo: reg.players?.pseudo || reg.players?.full_name || "?",
          table: Math.floor(i / perTable) + 1,
          seat: (i % perTable) + 1,
        }))
        .sort((a, b) => a.pseudo.localeCompare(b.pseudo));
      addAnnouncement(tournamentId, JSON.stringify(drawList), "draw");
      await recharger();
    } catch (e) {
      setError(e.message);
    }
    setShuffling(false);
  }

  // Les deux boutons de la barre d'outils : ils ouvrent la même fenêtre
  // de propositions que le message du bas de page, à ceci près qu'ici
  // c'est l'utilisateur qui demande. Le calcul, lui, vit dans
  // lib/tableBalance.js et tourne au niveau de la page.
  async function autoBreakTable() {
    if (!(await confirmAction("Casser la table la plus haute et répartir ses joueurs. Continuer ?"))) return;
    proposerCasse();
  }

  async function autoRebalanceTables() {
    if (!(await confirmAction("Un joueur va être déplacé pour équilibrer les tables. Continuer ?"))) return;
    proposerEquilibrage();
  }

  // Détection des seuils d'ante (moitié ante si <6 joueurs sur une table,
  // maintien des antes en tête-à-tête) : dès que l'un devient éligible
  // selon la config de structure du tournoi, on informe et on écrit dans
  // le panneau Annonces — une seule fois par transition.
  const anteAlertsRef = useRef({ halfTables: new Set(), headsUp: false });
  const [anteAlert, setAnteAlert] = useState(null);
  useEffect(() => {
    const cfg = tournament?.structure_config;
    if (!cfg) return;
    const { byTable } = groupActiveByTable(registrations, eliminations);
    const usedTables = Object.keys(byTable).map(Number);

    if (cfg.halfAnteIfFewPlayers) {
      usedTables.forEach((t) => {
        const isHalf = byTable[t].length < 6;
        const already = anteAlertsRef.current.halfTables.has(t);
        if (isHalf && !already) {
          anteAlertsRef.current.halfTables.add(t);
          setAnteAlert(`Table ${t} passe à moitié ante (moins de 6 joueurs).`);
          addAnnouncement(tournamentId, `Table ${t} passe à moitié ante`, "ante");
        } else if (!isHalf && already) {
          anteAlertsRef.current.halfTables.delete(t);
        }
      });
    }

    if (cfg.keepAntesHeadsUp) {
      const totalActive = usedTables.reduce((s, t) => s + byTable[t].length, 0);
      const isHeadsUp = usedTables.length === 1 && totalActive === 2;
      if (isHeadsUp && !anteAlertsRef.current.headsUp) {
        anteAlertsRef.current.headsUp = true;
        setAnteAlert("Tête-à-tête : les antes sont maintenues.");
        addAnnouncement(tournamentId, "Tête-à-tête : les antes sont maintenues", "ante");
      } else if (!isHeadsUp) {
        anteAlertsRef.current.headsUp = false;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrations, eliminations]);

  // Le "éliminé par qui ?" n'existe que pour compter les KO. Si le suivi
  // des knockouts n'est pas activé sur ce tournoi, il ne sert plus à rien
  // et ne fait que retarder la sortie : on élimine directement.
  function demanderElimination(reg) {
    setOpenMenuId(null);
    if (tournament?.track_knockouts) setEliminatingReg(reg.id);
    else confirmElimination(reg, null);
  }

  /**
   * La liste des joueurs en CSV — de quoi l'ouvrir dans un tableur, la
   * garder ou l'envoyer. Point-virgule et BOM UTF-8 : c'est ce qu'attend
   * Excel en français, sinon tout atterrit dans une seule colonne et les
   * accents sortent en charabia.
   */
  function telechargerJoueursCsv() {
    const echapper = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lignes = [
      ["#", "Pseudo", "Nom", "Table", "Siège", "Tapis", "Rebuys", "Addons", "KO", "Statut"].map(echapper).join(";"),
      ...sortedRegs.map((reg, i) => {
        const isOut = eliminatedIds.has(reg.id);
        const position = positionByReg.get(reg.id);
        return [
          isOut && position ? `${position}e` : i + 1,
          playerLabel(reg),
          reg.players?.full_name || "",
          reg.table_number || "",
          reg.seat_number || "",
          reg.stack ?? 0,
          reg.rebuys || 0,
          reg.addons || 0,
          koCounts.get(reg.id) || 0,
          isOut ? "Éliminé" : "En jeu",
        ]
          .map(echapper)
          .join(";");
      }),
    ];
    const blob = new Blob(["\ufeff" + lignes.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(tournament?.name || "tournoi").replace(/[^\w\d-]+/g, "_")}_joueurs.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function confirmElimination(reg, eliminatedByRegId) {
    const stillIn = registrations.filter(
      (r) => !eliminations.some((e) => e.registration_id === r.id)
    );
    // L'écriture elle-même vit dans lib/eliminations.js : trois écrans
    // éliminent des joueurs, et il ne doit y en avoir qu'une version.
    const { winnerName } = await eliminatePlayer({ tournamentId, reg, stillIn, eliminatedByRegId });
    if (winnerName) {
      setTournament((t) => ({ ...t, force_finished: true, clock_is_running: false }));
      setWinnerAnnounce({ winnerName });
    }
    setEliminatingReg(null);
    setOpenMenuId(null);
    recharger();
  }

  async function undoLastElimination() {
    if (eliminations.length === 0) return;
    const last = eliminations[eliminations.length - 1];
    await supabase.from("eliminations").update({ undone: true }).eq("id", last.id);
    recharger();
  }

  async function handleAssignCaptain(tableNumber, accountId) {
    if (!accountId) return;
    await assignTableCaptain(tournamentId, tableNumber, accountId);
    setTableCaptains(await fetchTableCaptainAssignments(tournamentId));
  }

  if (loading || !dataReady) {
    return <ClubLoader />;
  }
  if (error && !tournament) {
    return <div className="p-6 text-felt-alert font-body">Erreur : {error}</div>;
  }
  if (!tournament) return null;

  const eliminatedIds = new Set(eliminations.map((e) => e.registration_id));
  const stillIn = registrations.filter((r) => !eliminatedIds.has(r.id));
  const isFinished = registrations.length > 0 && stillIn.length === 1;

  const champ = championships.find((c) => c.id === tournament.championship_id);
  const koCounts = new Map();
  eliminations.forEach((e) => {
    if (e.eliminated_by) koCounts.set(e.eliminated_by, (koCounts.get(e.eliminated_by) || 0) + 1);
  });
  const positionByReg = computeFinishPositions(registrations.length, eliminations);
  if (isFinished) positionByReg.set(stillIn[0].id, 1);

  let finalResults = [];
  if (isFinished && champ) {
    const totalPlayers = registrations.length;
    const totalRebuys = registrations.reduce((s, r) => s + (r.rebuys || 0), 0);
    const totalEntries = champ.count_rebuys_in_ranking ? totalPlayers + totalRebuys : totalPlayers;
    finalResults = registrations
      .map((reg) => {
        const position = positionByReg.get(reg.id);
        const points = computeTournamentPoints({
          formulaText: champ.formula_text,
          totalPlayers,
          totalEntries,
          position,
          koCount: koCounts.get(reg.id) || 0,
          rebuys: reg.rebuys || 0,
          addons: reg.addons || 0,
        });
        return { position, playerName: reg.players?.full_name || "?", points };
      })
      .sort((a, b) => a.position - b.position);
  }

  const eliminatedByName = new Map();
  eliminations.forEach((e) => {
    if (e.eliminated_by) {
      const byReg = registrations.find((r) => r.id === e.eliminated_by);
      if (byReg) eliminatedByName.set(e.registration_id, byReg.players?.full_name || "?");
    }
  });

  // Actifs d'abord, par ordre alphabétique de pseudo — c'est ainsi qu'on
  // cherche un joueur dans la liste pendant la partie. Le tri par
  // table/siège qui s'appliquait ici écrasait l'ordre alphabétique déjà
  // posé au chargement ; pour voir qui est assis où, il y a l'onglet
  // Tables.
  // Les éliminés viennent à la suite, dans l'ordre du classement : le
  // dernier sorti, donc le mieux classé d'entre eux, en premier.
  const sortedRegs = [...registrations].sort((a, b) => {
    const aOut = eliminatedIds.has(a.id);
    const bOut = eliminatedIds.has(b.id);
    if (aOut !== bOut) return aOut ? 1 : -1;
    if (aOut && bOut) return (positionByReg.get(a.id) || 0) - (positionByReg.get(b.id) || 0);
    return playerLabel(a).localeCompare(playerLabel(b), "fr", { sensitivity: "base" });
  });
  const tableNumbers = [...new Set(registrations.map((r) => r.table_number))].sort((a, b) => a - b);


  return (
    <div className="h-full overflow-y-auto font-body text-felt-cream">
      <div className="max-w-[92rem] mx-auto p-4 sm:p-6">
        {isMobile && (
          <div className="flex border-b border-felt-cream/10 mb-5 -mt-1">
            {[
              { key: "params", label: "Paramètres" },
              { key: "table", label: "Joueurs" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setMobileSubTab(t.key)}
                className={`flex-1 py-2.5 text-sm font-display font-medium text-center border-b-2 -mb-px ${
                  mobileSubTab === t.key ? "border-felt-gold text-felt-gold" : "border-transparent text-felt-cream/50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Colonne gauche : paramètres du tournoi */}
        <CustomizablePanel
          panelKey="players-params"
          defaultOrder={0}
          className={`bg-felt-panel border border-felt-cream/10 rounded-lg p-7 ${
            isMobile && mobileSubTab !== "params" ? "hidden lg:block" : ""
          }`}
        >
          <div className="font-display text-2xl tracking-wide mb-1">JOUEURS</div>
          <div className="text-sm text-felt-cream/50 mb-5">Paramètres</div>

          <div className="space-y-4">
            <SettingField label="Max Joueurs" value={tournament.max_players} onChange={(v) => updateSetting("max_players", v)} />
            <SettingField label="Joueurs par table" value={tournament.players_per_table} onChange={(v) => updateSetting("players_per_table", v)} />
            <SettingField
              label="Nombre de tables maximum (attribution auto table/siège)"
              value={tournament.max_tables}
              onChange={(v) => updateSetting("max_tables", v)}
            />
            <SettingField label="Nombre de joueurs à la table finale" value={tournament.final_table_size} onChange={(v) => updateSetting("final_table_size", v)} />
            <SettingField label="Places à réserver" value={tournament.reserved_seats} onChange={(v) => updateSetting("reserved_seats", v)} />
            <div>
              <label className="block text-xs text-felt-cream/50 mb-1">Inscriptions</label>
              <select
                value={tournament.registration_open ? "open" : "closed"}
                onChange={(e) => updateRegistrationOpen(e.target.value === "open")}
                style={{ backgroundColor: "var(--pcp-cell-bg, #1B2027)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                className="w-full border border-felt-cream/10 rounded-md px-3 py-2 text-sm"
              >
                <option value="open">Ouvertes aux joueurs</option>
                <option value="closed">Fermées</option>
              </select>
            </div>
          </div>

          {tableNumbers.length > 0 && (
            <div className="mt-8">
              <div className="text-xs text-felt-cream/40 mb-2">Chefs de table</div>
              <div className="space-y-2">
                {tableNumbers.map((num) => {
                  const current = tableCaptains.find((tc) => tc.table_number === num);
                  return (
                    <div
                      key={num}
                      style={{ backgroundColor: "var(--pcp-cell-bg, #1B2027)", color: "var(--pcp-cell-text, inherit)" }}
                      className="flex items-center gap-1 text-xs border border-felt-cream/10 rounded-md px-2 py-1.5"
                    >
                      <span className="text-felt-cream/50 shrink-0">Table {num} :</span>
                      <select
                        value={current?.account_id || ""}
                        onChange={(e) => handleAssignCaptain(num, e.target.value)}
                        style={{ backgroundColor: "var(--pcp-cell-bg, #14181C)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                        className="text-xs flex-1 min-w-0 rounded px-1 py-0.5 border border-felt-cream/10"
                      >
                        <option value="" style={{ backgroundColor: "#14181C", color: "#EDEAE3" }}>
                          —
                        </option>
                        {captainAccounts.map((a) => (
                          <option key={a.id} value={a.id} style={{ backgroundColor: "#14181C", color: "#EDEAE3" }}>
                            {a.pseudo}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {eliminations.length > 0 && (
            <EditableButton
              groupKey="players-toolbar"
              id="undo-elimination"
              onClick={undoLastElimination}
              wrapperClassName="mt-6 w-full"
              className="pcp-btn w-full text-xs px-3 py-2 bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display"
            >
              ↩ Annuler la dernière élimination
            </EditableButton>
          )}
        </CustomizablePanel>

        {/* Colonne droite : liste des joueurs */}
        <CustomizablePanel
          panelKey="players-table"
          defaultOrder={1}
          className={`bg-felt-panel border border-felt-cream/10 rounded-lg p-7 ${
            isMobile && mobileSubTab !== "table" ? "hidden lg:block" : ""
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowRegister(true)}
                className="text-sm text-felt-gold hover:text-felt-gold/80 flex items-center gap-1.5"
              >
                <span>➕👤</span> Inscrire un joueur
              </button>
              <button
                onClick={telechargerJoueursCsv}
                disabled={registrations.length === 0}
                title="La liste des joueurs, à ouvrir dans un tableur"
                className="text-sm text-felt-gold hover:text-felt-gold/80 flex items-center gap-1.5 disabled:opacity-40 disabled:text-felt-cream/40"
              >
                <span>⤓</span> Télécharger (CSV)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImportFile}
                className="hidden"
                id="excel-import"
              />
              {/* Un vrai bouton plutôt qu'un <label htmlFor>, pour qu'il soit
                  personnalisable comme les autres : il ouvre le sélecteur de
                  fichier en cliquant le champ caché ci-dessus. */}
              <EditableButton
                groupKey="players-toolbar"
                id="import-excel"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                title="Accepte les fichiers Excel/CSV exportés d'autres apps (BlindValet, etc.) — colonnes Nom/Prénom/Player/Pseudo reconnues"
                className="pcp-btn px-3 py-1.5 text-xs bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display whitespace-nowrap disabled:opacity-60"
              >
                {importing ? "Import…" : "Importer Excel/CSV"}
              </EditableButton>
              <EditableButton
                groupKey="players-toolbar"
                id="paste-list"
                onClick={() => setShowPasteImport(true)}
                title="Collez une liste de noms (un par ligne) — pratique si l'app source (ex: BlindValet en cours de tournoi) ne permet pas d'export fichier"
                className="pcp-btn px-3 py-1.5 text-xs bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display whitespace-nowrap"
              >
                Coller une liste
              </EditableButton>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={autoBreakTable}
                disabled={balancing || calculerCasse().length === 0}
                title={
                  calculerCasse().length > 0
                    ? "Casse la table au numéro le plus élevé et répartit ses joueurs sur les autres"
                    : "Aucune table ne peut être cassée pour l'instant"
                }
                className={`text-sm flex items-center gap-1.5 disabled:opacity-40 ${
                  calculerCasse().length > 0 ? "text-felt-gold hover:text-felt-gold/80 font-medium" : "text-felt-cream/40"
                }`}
              >
                <span>💥</span> Casser une table
              </button>
              <button
                onClick={autoRebalanceTables}
                disabled={balancing || calculerEquilibrage().length === 0}
                title={
                  calculerEquilibrage().length > 0
                    ? "Déplace un joueur pour réduire l'écart entre la table la plus et la moins garnie"
                    : "Les tables sont déjà équilibrées"
                }
                className={`text-sm flex items-center gap-1.5 disabled:opacity-40 ${
                  calculerEquilibrage().length > 0 ? "text-felt-gold hover:text-felt-gold/80 font-medium" : "text-felt-cream/40"
                }`}
              >
                <span>⚖</span> {balancing ? "Équilibrage…" : "Équilibrer les tables"}
              </button>
              <button
                onClick={shuffleSeats}
                disabled={shuffling || registrations.length === 0 || tournament?.seats_drawn}
                title={tournament?.seats_drawn ? "Les places ont déjà été tirées pour ce tournoi" : ""}
                className="text-sm text-felt-gold hover:text-felt-gold/80 flex items-center gap-1.5 disabled:opacity-40 disabled:text-felt-cream/40"
              >
                <span>⇄</span> {shuffling ? "Tirage…" : "Tirer les places"}
              </button>
              {/* Le texte de cette ligne n'est jamais affiché (les lignes
                  draw_stop ne passent pas par les annonces), mais il ne
                  peut pas être vide : addAnnouncement refuse les messages
                  vides, si bien que ce bouton ne faisait rien du tout. */}
              {tournament?.seats_drawn && (
                <button
                  onClick={() => addAnnouncement(tournamentId, "Arrêt du défilement du tirage", "draw_stop")}
                  title="Arrêter le défilement du tirage sur le panneau Tirage des places"
                  className="text-sm text-felt-cream/50 hover:text-felt-cream flex items-center gap-1.5"
                >
                  <span>⏹</span> Stop défilement tirage
                </button>
              )}
              <button
                onClick={() => setShowJournal(true)}
                className="text-sm text-felt-cream/60 hover:text-felt-cream flex items-center gap-1.5"
              >
                <span>↺</span> Annuler des actions
              </button>
              <button
                onClick={() => setShowTableSeating(true)}
                className="text-sm text-felt-cream/60 hover:text-felt-cream flex items-center gap-1.5"
              >
                <span>🪑</span> Vue des tables
              </button>
            </div>
          </div>


          {error && <div className="text-felt-alert text-sm mb-3">Erreur : {error}</div>}

          <div className="text-sm uppercase tracking-wide text-felt-cream/40 mb-3 px-1">
            {registrations.length} joueur{registrations.length > 1 ? "s" : ""}
          </div>

          {sortedRegs.map((reg, rang) => {
            const isOut = eliminatedIds.has(reg.id);
            const koCount = koCounts.get(reg.id) || 0;
            const position = positionByReg.get(reg.id);
            const eliminatorName = eliminatedByName.get(reg.id);
            const menuOuvert = openMenuId === reg.id;

            return (
              <div key={reg.id} className="relative">
                {/* Une carte par joueur : numéro, avatar cerclé, pseudo. La
                    carte s'entoure d'or quand son menu est ouvert — c'est
                    le joueur sur lequel on agit. */}
                <div
                  style={{ backgroundColor: "var(--pcp-cell-bg, rgba(20,24,28,0.5))", color: "var(--pcp-cell-text, inherit)" }}
                  className={`flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3.5 sm:py-4 mb-3 rounded-xl border ${
                    menuOuvert ? "border-felt-gold" : "border-felt-cream/10"
                  } ${isOut ? "opacity-50" : ""}`}
                >
                  <div className="pcp-value text-felt-gold font-display text-lg sm:text-xl w-8 sm:w-10 text-center shrink-0">
                    {isOut && position ? `${position}e` : rang + 1}
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                    {reg.accounts?.avatar_data ? (
                      <img
                        src={reg.accounts.avatar_data}
                        alt=""
                        className="w-12 h-12 sm:w-14 sm:h-14 rounded-full object-cover shrink-0 ring-2 ring-felt-gold/70"
                      />
                    ) : (
                      <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-felt-bg flex items-center justify-center text-felt-cream/50 font-display text-base sm:text-lg shrink-0 ring-2 ring-felt-gold/70">
                        {(playerLabel(reg) || reg.players?.full_name)?.[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className={`pcp-title font-medium text-lg sm:text-xl truncate ${isOut ? "text-felt-cream/40" : "text-felt-gold"}`}>
                        {playerLabel(reg) || reg.players?.full_name}
                      </div>
                      <div className="pcp-body text-sm text-felt-cream/40 truncate">
                        {isOut ? (
                          <>
                            Éliminé{eliminatorName ? ` par ${eliminatorName}` : ""}
                          </>
                        ) : reg.table_number ? (
                          <>Table {reg.table_number} · Siège {reg.seat_number}</>
                        ) : (
                          <span className="text-felt-alert/70">Sans siège</span>
                        )}
                        {reg.rebuys > 0 && ` · ${reg.rebuys} rebuy(s)`}
                        {reg.addons > 0 && ` · ${reg.addons} addon(s)`}
                        {koCount > 0 && ` · ${koCount} KO`}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {editingStackId === reg.id ? (
                      <input
                        autoFocus
                        type="number"
                        value={stackDraft}
                        onChange={(e) => setStackDraft(e.target.value)}
                        onBlur={() => commitStack(reg)}
                        onKeyDown={(e) => e.key === "Enter" && commitStack(reg)}
                        className="w-24 bg-felt-bg border border-felt-gold/40 rounded px-2 py-1.5 text-base text-felt-cream"
                      />
                    ) : (
                      <button
                        onClick={() => startEditStack(reg)}
                        title="Modifier le tapis"
                        className="pcp-value text-felt-cream/70 hover:text-felt-cream underline decoration-felt-cream/20 text-sm sm:text-base tabular-nums"
                      >
                        {(reg.stack ?? 0).toLocaleString()}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(menuOuvert ? null : reg.id);
                    }}
                    className="text-felt-cream/50 hover:text-felt-cream text-xl leading-none shrink-0 w-6"
                  >
                    ⋮
                  </button>
                </div>

                {openMenuId === reg.id && (
                  <div className="absolute right-2 top-10 z-20 bg-felt-bg border border-felt-gold/40 rounded-md shadow-lg py-1 w-44 text-sm">
                    <MenuItem onClick={() => setTicket({ type: "buyin", reg })}>🎫 Ticket</MenuItem>
                    {!isOut && !reg.table_number && !tournament?.force_finished && (
                      <MenuItem onClick={() => assignSeatTo(reg)}>🎲 Attribuer un siège</MenuItem>
                    )}
                    {!isOut && !tournament?.force_finished && (
                      <>
                        {!isFreezeout && <MenuItem onClick={() => addRebuy(reg)}>+ Rebuy</MenuItem>}
                        {!isFreezeout && <MenuItem onClick={() => addAddon(reg)}>+ Addon</MenuItem>}
                        <MenuItem onClick={() => startMoveTable(reg)}>Changer de table</MenuItem>
                        <MenuItem alert onClick={() => demanderElimination(reg)}>
                          Éliminer
                        </MenuItem>
                      </>
                    )}
                    {!tournament?.force_finished && (
                      <MenuItem alert onClick={() => unregisterPlayer(reg)}>
                        Désinscrire
                      </MenuItem>
                    )}
                  </div>
                )}

                {eliminatingReg === reg.id && (
                  <EliminationPicker
                    candidates={stillIn.filter((r) => r.id !== reg.id)}
                    onConfirm={(byId) => confirmElimination(reg, byId)}
                    onCancel={() => setEliminatingReg(null)}
                  />
                )}
              </div>
            );
          })}

          {registrations.length === 0 && (
            <div className="text-felt-cream/50 text-sm py-6">Aucun joueur inscrit pour le moment.</div>
          )}
        </CustomizablePanel>
        </div>

      {isFinished && (
        <div className="mt-6 bg-felt-panel border border-felt-gold/30 rounded-lg px-6 py-4 max-h-56 overflow-y-auto">
          <div className="flex items-baseline justify-between mb-3">
            <div className="font-display text-lg text-felt-gold">🏆 Tournoi terminé — Résultats</div>
            {champ && finalResults.length > 0 && (
              <button
                onClick={() =>
                  exportResultsToExcel(
                    tournament.name,
                    finalResults.map((r) => ({ position: r.position, playerName: r.playerName, prize: r.points }))
                  )
                }
                className="text-xs px-3 py-1.5 bg-felt-bg border border-felt-cream/10 rounded-md font-display text-felt-cream/80 hover:text-felt-cream"
              >
                Exporter (Excel)
              </button>
            )}
          </div>
          {champ ? (
            <div className="space-y-1 text-sm">
              {finalResults.map((r) => (
                <div key={r.position} className="flex justify-between">
                  <span>
                    {r.position}. {r.playerName}
                  </span>
                  <span className="text-felt-gold">{r.points} pts</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-felt-cream/50">
              Ce tournoi n'est rattaché à aucun championnat — pas de points calculés.
            </div>
          )}
        </div>
      )}
      </div>

      {movingReg && (
        <SeatPickerModal
          registrations={registrations}
          eliminatedIds={eliminatedIds}
          playersPerTable={tournament?.players_per_table}
          currentReg={movingReg}
          onSelect={commitSeatMove}
          onClose={() => setMovingReg(null)}
        />
      )}

      {showRegister && (
        <RegisterPlayerModal
          registeredCount={registrations.length}
          members={captainAccounts.filter(canParticipate).filter((a) => !isClubMgr || a.club_name === account?.club_name)}
          registeredMemberIds={new Set(registrations.filter((r) => r.account_id).map((r) => r.account_id))}
          allowNew={!(isClubMgr && tournament?.is_interclub)}
          capNotice={
            isClubMgr && tournament?.is_interclub
              ? `${myClubRegistrationsCount()}/${MAX_CLUB_REGS_PER_INTERCLUB} membres de votre club inscrits`
              : null
          }
          onRegisterExisting={async (a) => {
            await handleRegisterExisting(a);
          }}
          onRegisterNew={async (name) => {
            await handleRegisterNew(name);
          }}
          onClose={() => setShowRegister(false)}
        />
      )}

      {showJournal && (
        <ActionJournalModal
          tournamentId={tournamentId}
          playersPerTable={tournament?.players_per_table}
          onClose={() => setShowJournal(false)}
          onChanged={() => {
            loadEverything();
          }}
        />
      )}

      {showTableSeating && (
        <TableSeatingModal
          registrations={registrations}
          eliminatedIds={eliminatedIds}
          playersPerTable={tournament?.players_per_table}
          onRepair={repairDuplicateSeats}
          onClose={() => setShowTableSeating(false)}
          onMoveSeat={moveSeatDirect}
          onEliminate={(reg) => confirmElimination(reg, null)}
          onUpdateStack={updateStackDirect}
        />
      )}

      {ticket && (
        <TicketModal onClose={() => setTicket(null)}>
          <TicketPrint
            type={ticket.type}
            festivalName={tournament.championships?.name}
            tournamentName={tournament.name}
            stageLabel={tournament.stage_label}
            firstName={
              ticket.reg.players?.first_name ||
              (ticket.reg.players?.full_name ? ticket.reg.players.full_name.trim().split(/\s+/)[0] : null)
            }
            lastName={
              ticket.reg.players?.last_name ||
              (ticket.reg.players?.full_name && ticket.reg.players.full_name.trim().split(/\s+/).length > 1
                ? ticket.reg.players.full_name.trim().split(/\s+/).slice(1).join(" ")
                : null)
            }
            pseudo={ticket.reg.players?.pseudo || ticket.reg.accounts?.pseudo}
            club={ticket.reg.players?.club}
            table={ticket.reg.table_number}
            seat={ticket.reg.seat_number}
            tournamentDate={
              tournament.scheduled_at
                ? new Date(tournament.scheduled_at).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
                : null
            }
            ticketId={`${tournament.id.slice(0, 8)}-${ticket.reg.id.slice(0, 8)}-${ticket.type}`}
          />
        </TicketModal>
      )}
      {winnerAnnounce && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setWinnerAnnounce(null)}>
          <div className="bg-felt-panel border border-felt-gold/40 rounded-lg p-8 w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl mb-3">🏆</div>
            <div className="font-display text-xl mb-1">{winnerAnnounce.winnerName}</div>
            <div className="text-felt-cream/60 text-sm mb-6">a gagné le tournoi !</div>
            <button onClick={() => setWinnerAnnounce(null)} className="px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display">
              OK
            </button>
          </div>
        </div>
      )}
      {anteAlert && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setAnteAlert(null)}>
          <div className="bg-felt-panel border border-felt-cream/10 rounded-lg p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-base mb-2">🪙 Ante</div>
            <div className="text-sm text-felt-cream/60 mb-4">{anteAlert}</div>
            <div className="text-xs text-felt-cream/40 mb-4">Écrit automatiquement dans le panneau Annonces de l'horloge.</div>
            <div className="flex justify-end">
              <button onClick={() => setAnteAlert(null)} className="px-4 py-1.5 text-sm bg-felt-gold text-felt-bg rounded-md font-display">
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {showPasteImport && (
        <PasteImportModal
          importing={importing}
          onClose={() => setShowPasteImport(false)}
          onSubmit={async (text) => {
            await handlePasteImport(text);
            setShowPasteImport(false);
          }}
        />
      )}
    </div>
  );
}

function PasteImportModal({ importing, onClose, onSubmit }) {
  const [text, setText] = useState("");
  const count = text
    .split("\n")
    .map((l) => l.replace(/^[\d.)\-•\s]+/, "").trim())
    .filter(Boolean)
    .filter((l) => !/^\d+$/.test(l))
    .filter((l) => !/^[A-ZÀ-Ý]{1,3}$/.test(l)).length;
  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-felt-panel border border-felt-cream/10 rounded-lg p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="font-display text-base mb-1">Coller une liste de joueurs</div>
        <div className="text-xs text-felt-cream/50 mb-3">
          Un nom par ligne (ex: copié depuis l'écran des joueurs de BlindValet ou toute autre source). Les numéros de
          liste, puces, stacks isolés (ex: 25000) et initiales d'avatar (ex: F, MR) sont ignorés automatiquement.
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Jean Dupont\nMarie Martin\n3. Paul Durand"}
          rows={10}
          autoFocus
          className="w-full bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream text-sm placeholder:text-felt-cream/30 font-mono"
        />
        <div className="text-xs text-felt-cream/40 mt-1 mb-4">{count} joueur{count > 1 ? "s" : ""} détecté{count > 1 ? "s" : ""}</div>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-felt-cream/60 hover:text-felt-cream">
            Annuler
          </button>
          <button
            onClick={() => onSubmit(text)}
            disabled={count === 0 || importing}
            className="px-4 py-1.5 text-sm bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
          >
            {importing ? "Inscription…" : `Inscrire ${count || ""} joueur${count > 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettingField({ label, value, onChange }) {
  const [local, setLocal] = useState(value ?? 0);
  useEffect(() => setLocal(value ?? 0), [value]);
  return (
    <div>
      <label className="block text-base text-felt-cream/70 mb-1.5">{label}</label>
      <input
        type="number"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onChange(local)}
        onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
        // Suit "Fond des cellules" / "Texte des cellules" du panneau (🎨),
        // avec les couleurs actuelles en repli tant que rien n'est choisi.
        style={{ backgroundColor: "var(--pcp-cell-bg, #1B2027)", color: "var(--pcp-cell-text, #EDEAE3)" }}
        className="w-full border border-felt-cream/10 rounded-md px-4 py-2.5 text-base"
      />
    </div>
  );
}

function MenuItem({ children, onClick, alert }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2 hover:bg-felt-panel ${alert ? "text-felt-alert" : "text-felt-cream/80"}`}
    >
      {children}
    </button>
  );
}

