import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { computeSeatAssignment } from "../lib/seating.js";
import { importPlayersFromFile, exportResultsToExcel } from "./SheetsSync.jsx";
import { computeTournamentPoints, fetchChampionships } from "../lib/points.js";
import { selectTournament } from "../lib/tournaments.js";
import { fetchAllAccounts, assignTableCaptain, fetchTableCaptainAssignments, canParticipate } from "../lib/auth.js";
import TicketPrint from "./TicketPrint.jsx";
import TicketModal from "./TicketModal.jsx";
import SeatPickerModal from "./SeatPickerModal.jsx";
import RegisterPlayerModal from "./RegisterPlayerModal.jsx";
import TableSeatingModal from "./TableSeatingModal.jsx";
import ActionJournalModal from "./ActionJournalModal.jsx";
import CustomizablePanel from "./CustomizablePanel.jsx";
import { useConfirm } from "../context/ConfirmContext.jsx";
import { logEvent } from "../lib/events.js";

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
  const [tournament, setTournament] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [eliminations, setEliminations] = useState([]);
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
  const [balanceProposal, setBalanceProposal] = useState(null);
  const [showBalanceSuggestion, setShowBalanceSuggestion] = useState(false);
  const [balancing, setBalancing] = useState(false);
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
      await loadRegistrations();
      await loadEliminations();
      fetchTableCaptainAssignments(tournamentId).then(setTableCaptains).catch(() => {});
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function loadRegistrations() {
    const { data, error } = await supabase
      .from("registrations")
      .select("*, players(id, full_name, first_name, last_name, club, pseudo), accounts(avatar_data, pseudo)")
      .eq("tournament_id", tournamentId)
      .order("registered_at", { ascending: true });
    if (error) setError(error.message);
    setRegistrations(data || []);
  }

  async function loadEliminations() {
    const { data, error } = await supabase
      .from("eliminations")
      .select("*")
      .eq("tournament_id", tournamentId)
      .eq("undone", false)
      .order("eliminated_at", { ascending: true });
    if (error) setError(error.message);
    setEliminations(data || []);
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
    await loadRegistrations();
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
      .select("*, players(id, full_name, first_name, last_name, club, pseudo), accounts(avatar_data, pseudo)")
      .single();
    if (regErr) throw regErr;

    logEvent(tournamentId, "register", player.full_name, { registrationId: reg.id, playerId: player.id, accountId });
    return reg;
  }

  async function assignSeatTo(reg) {
    try {
      const { table, seat } = await computeSeatAssignment(tournament);
      await supabase.from("registrations").update({ table_number: table, seat_number: seat }).eq("id", reg.id);
      await loadRegistrations();
    } catch (e) {
      setError(e.message);
    }
    setOpenMenuId(null);
  }

  // "Membre du club" = un vrai compte de l'app (pas n'importe quel nom déjà
  // tapé lors d'un tournoi précédent). On lie la registration à ce compte.
  async function handleRegisterExisting(account) {
    try {
      await registerOnePlayer(account.pseudo, account.id);
      await loadRegistrations();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleRegisterNew(name) {
    try {
      await registerOnePlayer(name);
      await loadRegistrations();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const players = await importPlayersFromFile(file);
      for (const p of players) {
        if (!p.fullName?.trim()) continue;
        await registerOnePlayer(p.fullName.trim());
      }
      await loadRegistrations();
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
      for (const name of names) {
        await registerOnePlayer(name);
      }
      await loadRegistrations();
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
    await loadRegistrations();
    setTicket({ type: "rebuy", reg });
    setOpenMenuId(null);
  }

  async function addAddon(reg) {
    await supabase
      .from("registrations")
      .update({ addons: (reg.addons || 0) + 1 })
      .eq("id", reg.id);
    await loadRegistrations();
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
    await loadRegistrations();
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
      await loadRegistrations();
    } catch (e) {
      setError(e.message);
    }
  }

  async function moveSeatDirect(regId, table, seat) {
    try {
      await supabase.from("registrations").update({ table_number: table, seat_number: seat }).eq("id", regId);
      await loadRegistrations();
    } catch (e) {
      setError(e.message);
    }
  }

  async function updateStackDirect(regId, stack) {
    try {
      await supabase.from("registrations").update({ stack }).eq("id", regId);
      await loadRegistrations();
    } catch (e) {
      setError(e.message);
    }
  }

  async function unregisterPlayer(reg) {
    setOpenMenuId(null);
    if (!(await confirmAction(`Désinscrire ${reg.players?.full_name} ?`))) return;
    try {
      await supabase.from("registrations").delete().eq("id", reg.id);
      await loadRegistrations();
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
      await loadRegistrations();
    } catch (e) {
      setError(e.message);
    }
    setShuffling(false);
  }

  // Équilibrage automatique : ne touche qu'aux joueurs encore en jeu,
  // répartit le nombre minimal de tables nécessaires de façon égale
  // (round-robin), pour compenser les éliminations en cours de tournoi.
  // Nombre de tables cible : dès que le nombre de joueurs encore en jeu est
  // au plus égal au réglage "Nombre de joueurs à la table finale", tout le
  // monde se regroupe sur une seule table finale (même si ce nombre dépasse
  // le "Joueurs par table" habituel). Sinon, répartition normale par
  // "Joueurs par table".
  function computeTargetTableCount(activeCount, perTable, finalTableSize) {
    if (activeCount <= finalTableSize) return 1;
    return Math.max(1, Math.ceil(activeCount / perTable));
  }

  function computeBalanceMoves() {
    const eliminatedIdsNow = new Set(eliminations.map((e) => e.registration_id));
    const perTable = tournament?.players_per_table || 9;
    const finalTableSize = tournament?.final_table_size || perTable;
    const active = registrations.filter((r) => !eliminatedIdsNow.has(r.id));
    if (active.length === 0) return [];
    const numTables = computeTargetTableCount(active.length, perTable, finalTableSize);
    const sorted = [...active].sort(
      (a, b) => (a.table_number || 0) - (b.table_number || 0) || (a.seat_number || 0) - (b.seat_number || 0)
    );
    const moves = [];
    sorted.forEach((reg, i) => {
      const table = (i % numTables) + 1;
      const seat = Math.floor(i / numTables) + 1;
      if (reg.table_number !== table || reg.seat_number !== seat) {
        moves.push({ reg, fromTable: reg.table_number, fromSeat: reg.seat_number, toTable: table, toSeat: seat });
      }
    });
    return moves;
  }

  async function autoBalanceTables() {
    if (!(await confirmAction("L'équilibrage des tables va être effectué. Continuer ?"))) return;
    const moves = computeBalanceMoves();
    if (moves.length === 0) return;
    setBalanceProposal(moves);
  }

  // Dès que le rééquilibrage devient recommandé (transition, pas à chaque
  // rendu), une fenêtre le propose spontanément plutôt que d'attendre que
  // l'utilisateur clique lui-même sur le bouton.
  const wasNeedingBalanceRef = useRef(false);
  useEffect(() => {
    const needs = computeNeedsBalance();
    if (needs && !wasNeedingBalanceRef.current && !balanceProposal && !showBalanceSuggestion) {
      setShowBalanceSuggestion(true);
    }
    wasNeedingBalanceRef.current = needs;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registrations, eliminations]);

  async function applyBalanceProposal() {
    const moves = balanceProposal;
    if (!moves) return;
    setBalancing(true);
    setError(null);
    try {
      // Instantané AVANT le déplacement, pour permettre d'annuler
      // précisément depuis le Journal de tournoi.
      const before = moves.map((m) => ({ registrationId: m.reg.id, table_number: m.fromTable, seat_number: m.fromSeat }));
      await Promise.all(
        moves.map((m) => supabase.from("registrations").update({ table_number: m.toTable, seat_number: m.toSeat }).eq("id", m.reg.id))
      );
      logEvent(tournamentId, "balance", "Équilibrage des tables", { before });
      await loadRegistrations();
    } catch (e) {
      setError(e.message);
    }
    setBalancing(false);
    setBalanceProposal(null);
  }

  // Calcule si un rééquilibrage est possible ET préférable en l'état actuel
  // (plus de tables utilisées que nécessaire, ou écart de plus d'un joueur
  // entre la table la plus et la moins garnie) — pilote l'activation du
  // bouton "Équilibrer les tables".
  function computeNeedsBalance() {
    const eliminatedIdsNow = new Set(eliminations.map((e) => e.registration_id));
    const perTable = tournament?.players_per_table || 9;
    const finalTableSize = tournament?.final_table_size || perTable;
    const active = registrations.filter((r) => !eliminatedIdsNow.has(r.id));
    if (active.length === 0) return false;
    const numTables = computeTargetTableCount(active.length, perTable, finalTableSize);
    const counts = {};
    active.forEach((r) => {
      counts[r.table_number] = (counts[r.table_number] || 0) + 1;
    });
    const usedTables = Object.keys(counts).length;
    const values = Object.values(counts);
    const max = Math.max(...values);
    const min = Math.min(...values);
    return usedTables !== numTables || max - min > 1;
  }

  async function confirmElimination(reg, eliminatedByRegId) {
    const stillIn = registrations.filter(
      (r) => !eliminations.some((e) => e.registration_id === r.id)
    );
    const position = stillIn.length;
    const { data: elim } = await supabase
      .from("eliminations")
      .insert({
        tournament_id: tournamentId,
        registration_id: reg.id,
        finish_position: position,
        eliminated_by: eliminatedByRegId || null,
      })
      .select()
      .single();
    logEvent(tournamentId, "elimination", reg.players?.full_name || "", { eliminationId: elim?.id, registrationId: reg.id });
    setEliminatingReg(null);
    setOpenMenuId(null);
    loadEliminations();
  }

  async function undoLastElimination() {
    if (eliminations.length === 0) return;
    const last = eliminations[eliminations.length - 1];
    await supabase.from("eliminations").update({ undone: true }).eq("id", last.id);
    loadEliminations();
  }

  async function handleAssignCaptain(tableNumber, accountId) {
    if (!accountId) return;
    await assignTableCaptain(tournamentId, tableNumber, accountId);
    setTableCaptains(await fetchTableCaptainAssignments(tournamentId));
  }

  if (loading) {
    return <div className="p-6 text-felt-cream/60 font-body">Chargement…</div>;
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
  const positionByReg = new Map();
  if (isFinished) positionByReg.set(stillIn[0].id, 1);
  eliminations.forEach((e) => positionByReg.set(e.registration_id, e.finish_position));

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

  // Actifs d'abord (triés par table/siège), puis éliminés à la suite dans
  // l'ordre du classement (le plus récemment éliminé — donc le mieux classé
  // parmi les sortants — en premier, le tout premier éliminé tout en bas).
  const sortedRegs = [...registrations].sort((a, b) => {
    const aOut = eliminatedIds.has(a.id);
    const bOut = eliminatedIds.has(b.id);
    if (aOut !== bOut) return aOut ? 1 : -1;
    if (aOut && bOut) return (positionByReg.get(a.id) || 0) - (positionByReg.get(b.id) || 0);
    return (a.table_number || 0) - (b.table_number || 0) || (a.seat_number || 0) - (b.seat_number || 0);
  });
  const tableNumbers = [...new Set(registrations.map((r) => r.table_number))].sort((a, b) => a - b);
  let lastTable = null;

  return (
    <div className="h-full overflow-y-auto font-body text-felt-cream">
      <div className="max-w-[92rem] mx-auto p-4 sm:p-6">
        <div className="flex flex-col lg:flex-row gap-8 items-start">
        {/* Colonne gauche : paramètres du tournoi */}
        <CustomizablePanel panelKey="players-params" defaultOrder={0} className="bg-felt-panel border border-felt-cream/10 rounded-lg p-7">
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
                className="w-full bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-sm text-felt-cream"
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
                    <div key={num} className="flex items-center gap-1 text-xs bg-felt-panel border border-felt-cream/10 rounded-md px-2 py-1.5">
                      <span className="text-felt-cream/50 shrink-0">Table {num} :</span>
                      <select
                        value={current?.account_id || ""}
                        onChange={(e) => handleAssignCaptain(num, e.target.value)}
                        className="bg-felt-bg text-felt-cream text-xs flex-1 min-w-0 rounded px-1 py-0.5 border border-felt-cream/10"
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
            <button
              onClick={undoLastElimination}
              className="mt-6 w-full text-xs px-3 py-2 bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display"
            >
              ↩ Annuler la dernière élimination
            </button>
          )}
        </CustomizablePanel>

        {/* Colonne droite : liste des joueurs */}
        <CustomizablePanel panelKey="players-table" defaultOrder={1} className="bg-felt-panel border border-felt-cream/10 rounded-lg p-7">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => setShowRegister(true)}
                className="text-sm text-felt-gold hover:text-felt-gold/80 flex items-center gap-1.5"
              >
                <span>➕👤</span> Inscrire un joueur
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleImportFile}
                className="hidden"
                id="excel-import"
              />
              <label
                htmlFor="excel-import"
                title="Accepte les fichiers Excel/CSV exportés d'autres apps (BlindValet, etc.) — colonnes Nom/Prénom/Player/Pseudo reconnues"
                className="cursor-pointer px-3 py-1.5 text-xs bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display whitespace-nowrap"
              >
                {importing ? "Import…" : "Importer Excel/CSV"}
              </label>
              <button
                onClick={() => setShowPasteImport(true)}
                title="Collez une liste de noms (un par ligne) — pratique si l'app source (ex: BlindValet en cours de tournoi) ne permet pas d'export fichier"
                className="px-3 py-1.5 text-xs bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display whitespace-nowrap"
              >
                Coller une liste
              </button>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={autoBalanceTables}
                disabled={balancing || !computeNeedsBalance()}
                title={
                  computeNeedsBalance()
                    ? "Rééquilibrage recommandé : répartit les joueurs encore en jeu sur le nombre minimal de tables nécessaire"
                    : "Les tables sont déjà équilibrées"
                }
                className={`text-sm flex items-center gap-1.5 disabled:opacity-40 ${
                  computeNeedsBalance() ? "text-felt-gold hover:text-felt-gold/80 font-medium" : "text-felt-cream/40"
                }`}
              >
                <span>⚖</span> {balancing ? "Équilibrage…" : computeNeedsBalance() ? "Rééquilibrage recommandé" : "Équilibrer les tables"}
              </button>
              <button
                onClick={shuffleSeats}
                disabled={shuffling || registrations.length === 0 || tournament?.seats_drawn}
                title={tournament?.seats_drawn ? "Les places ont déjà été tirées pour ce tournoi" : ""}
                className="text-sm text-felt-gold hover:text-felt-gold/80 flex items-center gap-1.5 disabled:opacity-40 disabled:text-felt-cream/40"
              >
                <span>⇄</span> {shuffling ? "Tirage…" : "Tirer les places"}
              </button>
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

          <div className="grid grid-cols-[48px_1fr_90px_32px] sm:grid-cols-[72px_1fr_140px_44px] gap-3 px-4 pb-4 mb-3 border-b border-felt-cream/10 text-sm uppercase tracking-wide text-felt-cream/50">
            <div>Place</div>
            <div>Nom ({registrations.length})</div>
            <div>Tapis</div>
            <div></div>
          </div>

          {sortedRegs.map((reg) => {
            const isOut = eliminatedIds.has(reg.id);
            const koCount = koCounts.get(reg.id) || 0;
            const showTable = !isOut && reg.table_number !== lastTable;
            if (!isOut) lastTable = reg.table_number;
            const position = positionByReg.get(reg.id);
            const eliminatorName = eliminatedByName.get(reg.id);

            return (
              <div key={reg.id} className="relative">
                <div
                  style={{ backgroundColor: "var(--pcp-cell-bg, rgba(20,24,28,0.5))", color: "var(--pcp-cell-text, inherit)" }}
                  className={`grid grid-cols-[48px_1fr_90px_32px] sm:grid-cols-[72px_1fr_140px_44px] gap-3 items-center px-4 py-5 mb-2.5 rounded-md ${
                    isOut ? "opacity-50" : ""
                  }`}
                >
                  <div className="pcp-value text-felt-gold font-display text-lg">
                    {isOut ? (position ? `${position}e` : "") : showTable ? reg.table_number : ""}
                  </div>
                  <div className="flex items-center gap-3 min-w-0">
                    {reg.accounts?.avatar_data ? (
                      <img src={reg.accounts.avatar_data} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-felt-bg flex items-center justify-center text-felt-cream/40 font-display text-base shrink-0">
                        {reg.players?.full_name?.[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className={`pcp-title font-medium text-lg truncate ${isOut ? "text-felt-cream/40" : "text-felt-gold"}`}>
                        {reg.players?.full_name}
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
                  <div>
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
                      <button onClick={() => startEditStack(reg)} className="pcp-value text-felt-cream underline decoration-felt-cream/30 text-base">
                        {(reg.stack ?? 0).toLocaleString()}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId(openMenuId === reg.id ? null : reg.id);
                    }}
                    className="text-felt-cream/50 hover:text-felt-cream text-xl leading-none"
                  >
                    ⋮
                  </button>
                </div>

                {openMenuId === reg.id && (
                  <div className="absolute right-2 top-10 z-20 bg-felt-bg border border-felt-gold/40 rounded-md shadow-lg py-1 w-44 text-sm">
                    <MenuItem onClick={() => setTicket({ type: "buyin", reg })}>🎫 Ticket</MenuItem>
                    {!isOut && !reg.table_number && (
                      <MenuItem onClick={() => assignSeatTo(reg)}>🎲 Attribuer un siège</MenuItem>
                    )}
                    {!isOut && (
                      <>
                        {!isFreezeout && <MenuItem onClick={() => addRebuy(reg)}>+ Rebuy</MenuItem>}
                        {!isFreezeout && <MenuItem onClick={() => addAddon(reg)}>+ Addon</MenuItem>}
                        <MenuItem onClick={() => startMoveTable(reg)}>Changer de table</MenuItem>
                        <MenuItem
                          alert
                          onClick={() => {
                            setEliminatingReg(reg.id);
                            setOpenMenuId(null);
                          }}
                        >
                          Éliminer
                        </MenuItem>
                      </>
                    )}
                    <MenuItem alert onClick={() => unregisterPlayer(reg)}>
                      Désinscrire
                    </MenuItem>
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
          members={captainAccounts.filter(canParticipate)}
          registeredMemberIds={new Set(registrations.filter((r) => r.account_id).map((r) => r.account_id))}
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
            loadRegistrations();
            loadEliminations();
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
      {showBalanceSuggestion && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setShowBalanceSuggestion(false)}>
          <div className="bg-felt-panel border border-felt-cream/10 rounded-lg p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-base mb-2">⚖ Rééquilibrage recommandé</div>
            <div className="text-sm text-felt-cream/60 mb-4">
              La répartition des joueurs entre les tables n'est plus optimale. Voulez-vous équilibrer les tables
              maintenant ?
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowBalanceSuggestion(false)} className="px-3 py-1.5 text-sm text-felt-cream/60 hover:text-felt-cream">
                Annuler
              </button>
              <button
                onClick={() => {
                  setShowBalanceSuggestion(false);
                  const moves = computeBalanceMoves();
                  if (moves.length > 0) setBalanceProposal(moves);
                }}
                className="px-4 py-1.5 text-sm bg-felt-gold text-felt-bg rounded-md font-display"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      {balanceProposal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4" onClick={() => setBalanceProposal(null)}>
          <div className="bg-felt-panel border border-felt-cream/10 rounded-lg p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="font-display text-base mb-1">Déplacements proposés</div>
            <div className="text-xs text-felt-cream/50 mb-3">
              {balanceProposal.length} joueur{balanceProposal.length > 1 ? "s" : ""} concerné{balanceProposal.length > 1 ? "s" : ""}.
            </div>
            <div className="max-h-72 overflow-y-auto space-y-1 mb-4">
              {balanceProposal.map((m) => (
                <div key={m.reg.id} className="flex items-center justify-between text-sm bg-felt-bg/60 rounded px-3 py-2">
                  <span className="truncate">{m.reg.players?.full_name || m.reg.players?.pseudo}</span>
                  <span className="text-felt-cream/40 text-xs whitespace-nowrap ml-2">
                    T{m.fromTable || "-"}/S{m.fromSeat || "-"} → T{m.toTable}/S{m.toSeat}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setBalanceProposal(null)} className="px-3 py-1.5 text-sm text-felt-cream/60 hover:text-felt-cream">
                Annuler
              </button>
              <button
                onClick={applyBalanceProposal}
                disabled={balancing}
                className="px-4 py-1.5 text-sm bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
              >
                {balancing ? "Application…" : "OK"}
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
        className="w-full bg-felt-panel border border-felt-cream/10 rounded-md px-4 py-2.5 text-base text-felt-cream"
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

function EliminationPicker({ candidates, onConfirm, onCancel }) {
  const [selected, setSelected] = useState("");
  return (
    <div className="mt-1 mb-2 ml-4 flex items-center gap-2 bg-felt-bg border border-felt-alert/30 rounded-md px-3 py-2">
      <span className="text-xs text-felt-cream/60">Éliminé par (optionnel, pour le KO) :</span>
      <select
        value={selected}
        onChange={(e) => setSelected(e.target.value)}
        className="bg-felt-panel border border-felt-cream/10 rounded px-2 py-1 text-sm text-felt-cream"
      >
        <option value="">Aucun</option>
        {candidates.map((c) => (
          <option key={c.id} value={c.id}>
            {c.players?.full_name}
          </option>
        ))}
      </select>
      <button
        onClick={() => onConfirm(selected || null)}
        className="text-xs px-3 py-1.5 bg-felt-alert/80 text-felt-cream rounded font-display"
      >
        Confirmer l'élimination
      </button>
      <button onClick={onCancel} className="text-xs px-3 py-1.5 text-felt-cream/50 hover:text-felt-cream">
        Annuler
      </button>
    </div>
  );
}
