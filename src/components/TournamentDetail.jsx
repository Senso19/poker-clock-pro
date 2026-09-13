import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useTheme } from "../context/ThemeContext.jsx";
import { importPlayersFromFile, exportResultsToExcel } from "./SheetsSync.jsx";
import { computeTournamentPoints, fetchChampionships } from "../lib/points.js";
import { selectTournament } from "../lib/tournaments.js";
import { fetchAllAccounts, assignTableCaptain, fetchTableCaptainAssignments } from "../lib/auth.js";
import TicketPrint from "./TicketPrint.jsx";
import SeatPickerModal from "./SeatPickerModal.jsx";
import RegisterPlayerModal from "./RegisterPlayerModal.jsx";
import ActionJournalModal from "./ActionJournalModal.jsx";
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
  const { theme } = useTheme();
  const panelStyle = theme.panelBgColor ? { backgroundColor: theme.panelBgColor } : undefined;
  const [tournament, setTournament] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [eliminations, setEliminations] = useState([]);
  const [championships, setChampionships] = useState([]);
  const [clubPlayers, setClubPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showRegister, setShowRegister] = useState(false);
  const [showJournal, setShowJournal] = useState(false);
  const [importing, setImporting] = useState(false);
  const [ticket, setTicket] = useState(null);
  const [eliminatingReg, setEliminatingReg] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [editingStackId, setEditingStackId] = useState(null);
  const [stackDraft, setStackDraft] = useState("");
  const [movingReg, setMovingReg] = useState(null);
  const [shuffling, setShuffling] = useState(false);
  const [balancing, setBalancing] = useState(false);
  const [captainAccounts, setCaptainAccounts] = useState([]);
  const [tableCaptains, setTableCaptains] = useState([]);
  const fileInputRef = useRef(null);

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

  async function loadEverything() {
    setLoading(true);
    try {
      const { data: t, error: tErr } = await supabase
        .from("tournaments")
        .select("*")
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
      .select("*, players(id, full_name), accounts(avatar_data)")
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

  function assignSeat(index) {
    const perTable = tournament?.players_per_table || 9;
    const table = Math.floor(index / perTable) + 1;
    const seat = (index % perTable) + 1;
    return { table, seat };
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

  async function registerOnePlayer(name, currentCount, accountId = null) {
    const player = await findOrCreatePlayer(name);
    const { table, seat } = assignSeat(currentCount);
    const { data: reg, error: regErr } = await supabase
      .from("registrations")
      .insert({
        tournament_id: tournamentId,
        player_id: player.id,
        account_id: accountId,
        table_number: table,
        seat_number: seat,
        stack: tournament.starting_stack,
      })
      .select("*, players(id, full_name), accounts(avatar_data)")
      .single();
    if (regErr) throw regErr;
    logEvent(tournamentId, "register", player.full_name, { registrationId: reg.id, playerId: player.id, accountId });
    return reg;
  }

  // "Membre du club" = un vrai compte de l'app (pas n'importe quel nom déjà
  // tapé lors d'un tournoi précédent). On lie la registration à ce compte.
  async function handleRegisterExisting(account) {
    try {
      const reg = await registerOnePlayer(account.pseudo, registrations.length, account.id);
      await loadRegistrations();
      setTicket({ type: "buyin", reg });
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleRegisterNew(name) {
    try {
      const reg = await registerOnePlayer(name, registrations.length);
      await loadRegistrations();
      setTicket({ type: "buyin", reg });
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
      let count = registrations.length;
      for (const p of players) {
        if (!p.fullName?.trim()) continue;
        await registerOnePlayer(p.fullName.trim(), count);
        count += 1;
      }
      await loadRegistrations();
    } catch (e) {
      setError(e.message);
    }
    setImporting(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
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

  async function unregisterPlayer(reg) {
    setOpenMenuId(null);
    if (!confirm(`Désinscrire ${reg.players?.full_name} ?`)) return;
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
      await loadRegistrations();
    } catch (e) {
      setError(e.message);
    }
    setShuffling(false);
  }

  // Équilibrage automatique : ne touche qu'aux joueurs encore en jeu,
  // répartit le nombre minimal de tables nécessaires de façon égale
  // (round-robin), pour compenser les éliminations en cours de tournoi.
  async function autoBalanceTables() {
    setBalancing(true);
    setError(null);
    try {
      const eliminatedIdsNow = new Set(eliminations.map((e) => e.registration_id));
      const perTable = tournament?.players_per_table || 9;
      const active = registrations.filter((r) => !eliminatedIdsNow.has(r.id));
      if (active.length === 0) {
        setBalancing(false);
        return;
      }
      const numTables = Math.max(1, Math.ceil(active.length / perTable));
      const sorted = [...active].sort(
        (a, b) => (a.table_number || 0) - (b.table_number || 0) || (a.seat_number || 0) - (b.seat_number || 0)
      );
      const updates = [];
      sorted.forEach((reg, i) => {
        const table = (i % numTables) + 1;
        const seat = Math.floor(i / numTables) + 1;
        if (reg.table_number !== table || reg.seat_number !== seat) {
          updates.push(supabase.from("registrations").update({ table_number: table, seat_number: seat }).eq("id", reg.id));
        }
      });
      await Promise.all(updates);
      await loadRegistrations();
    } catch (e) {
      setError(e.message);
    }
    setBalancing(false);
  }

  // Calcule si un rééquilibrage est possible ET préférable en l'état actuel
  // (plus de tables utilisées que nécessaire, ou écart de plus d'un joueur
  // entre la table la plus et la moins garnie) — pilote l'activation du
  // bouton "Équilibrer les tables".
  function computeNeedsBalance() {
    const eliminatedIdsNow = new Set(eliminations.map((e) => e.registration_id));
    const perTable = tournament?.players_per_table || 9;
    const active = registrations.filter((r) => !eliminatedIdsNow.has(r.id));
    if (active.length === 0) return false;
    const numTables = Math.max(1, Math.ceil(active.length / perTable));
    const counts = {};
    active.forEach((r) => {
      counts[r.table_number] = (counts[r.table_number] || 0) + 1;
    });
    const usedTables = Object.keys(counts).length;
    const values = Object.values(counts);
    const max = Math.max(...values);
    const min = Math.min(...values);
    return usedTables > numTables || max - min > 1;
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

  const sortedRegs = [...registrations].sort(
    (a, b) => (a.table_number || 0) - (b.table_number || 0) || (a.seat_number || 0) - (b.seat_number || 0)
  );
  const tableNumbers = [...new Set(registrations.map((r) => r.table_number))].sort((a, b) => a - b);
  let lastTable = null;

  return (
    <div className="h-full overflow-y-auto font-body text-felt-cream">
      <div className="max-w-6xl mx-auto p-4 sm:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* Colonne gauche : paramètres du tournoi */}
        <div className="bg-felt-panel border border-felt-cream/10 rounded-lg p-7" style={panelStyle}>
          <div className="font-display text-2xl tracking-wide mb-1">JOUEURS</div>
          <div className="text-sm text-felt-cream/50 mb-5">Paramètres</div>

          <div className="space-y-4">
            <SettingField label="Max Joueurs" value={tournament.max_players} onChange={(v) => updateSetting("max_players", v)} />
            <SettingField label="Joueurs par table" value={tournament.players_per_table} onChange={(v) => updateSetting("players_per_table", v)} />
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
                        className="bg-transparent text-felt-cream text-xs flex-1 min-w-0"
                      >
                        <option value="">—</option>
                        {captainAccounts.map((a) => (
                          <option key={a.id} value={a.id}>
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
        </div>

        {/* Colonne droite : liste des joueurs */}
        <div className="bg-felt-panel border border-felt-cream/10 rounded-lg p-7" style={panelStyle}>
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
                className="cursor-pointer px-3 py-1.5 text-xs bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display whitespace-nowrap"
              >
                {importing ? "Import…" : "Importer Excel"}
              </label>
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
            </div>
          </div>


          {error && <div className="text-felt-alert text-sm mb-3">Erreur : {error}</div>}

          <div className="grid grid-cols-[40px_1fr_80px_28px] sm:grid-cols-[56px_1fr_100px_36px] gap-3 px-3 pb-3 mb-2 border-b border-felt-cream/10 text-xs uppercase tracking-wide text-felt-cream/40">
            <div>Place</div>
            <div>Nom ({registrations.length})</div>
            <div>Tapis</div>
            <div></div>
          </div>

          {sortedRegs.map((reg) => {
            const isOut = eliminatedIds.has(reg.id);
            const koCount = koCounts.get(reg.id) || 0;
            const showTable = reg.table_number !== lastTable;
            lastTable = reg.table_number;

            return (
              <div key={reg.id} className="relative">
                <div
                  className={`grid grid-cols-[40px_1fr_80px_28px] sm:grid-cols-[56px_1fr_100px_36px] gap-3 items-center px-3 py-4 mb-2 rounded-md bg-felt-bg/50 ${
                    isOut ? "opacity-40" : ""
                  }`}
                >
                  <div className="text-felt-gold font-display">{showTable ? reg.table_number : ""}</div>
                  <div className="flex items-center gap-2 min-w-0">
                    {reg.accounts?.avatar_data ? (
                      <img src={reg.accounts.avatar_data} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
                    ) : (
                      <div className="w-9 h-9 rounded-full bg-felt-bg flex items-center justify-center text-felt-cream/40 font-display text-sm shrink-0">
                        {reg.players?.full_name?.[0]?.toUpperCase()}
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className={`font-medium truncate ${isOut ? "text-felt-cream/40" : "text-felt-gold"}`}>
                        {reg.players?.full_name}
                      </div>
                      <div className="text-[11px] text-felt-cream/30 truncate">
                        Siège {reg.seat_number}
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
                        className="w-20 bg-felt-bg border border-felt-gold/40 rounded px-2 py-1 text-sm text-felt-cream"
                      />
                    ) : (
                      <button onClick={() => startEditStack(reg)} className="text-felt-cream underline decoration-felt-cream/30 text-sm">
                        {(reg.stack ?? 0).toLocaleString()}
                      </button>
                    )}
                  </div>
                  <button
                    onClick={() => setOpenMenuId(openMenuId === reg.id ? null : reg.id)}
                    className="text-felt-cream/50 hover:text-felt-cream text-lg leading-none"
                  >
                    ⋮
                  </button>
                </div>

                {openMenuId === reg.id && (
                  <div className="absolute right-2 top-10 z-20 bg-felt-bg border border-felt-gold/40 rounded-md shadow-lg py-1 w-44 text-sm">
                    <MenuItem onClick={() => setTicket({ type: "buyin", reg })}>🎫 Ticket</MenuItem>
                    {!isOut && (
                      <>
                        <MenuItem onClick={() => addRebuy(reg)}>+ Rebuy</MenuItem>
                        <MenuItem onClick={() => addAddon(reg)}>+ Addon</MenuItem>
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
        </div>
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
          members={captainAccounts}
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
          onClose={() => setShowJournal(false)}
          onChanged={() => {
            loadRegistrations();
            loadEliminations();
          }}
        />
      )}

      {ticket && (
        <TicketModal onClose={() => setTicket(null)}>
          <TicketPrint
            type={ticket.type}
            tournamentName={tournament.name}
            player={ticket.reg.players?.full_name}
            seat={`Table ${ticket.reg.table_number} · Siège ${ticket.reg.seat_number}`}
            ticketId={`${tournament.id.slice(0, 8)}-${ticket.reg.id.slice(0, 8)}-${ticket.type}`}
          />
        </TicketModal>
      )}
    </div>
  );
}

function SettingField({ label, value, onChange }) {
  const [local, setLocal] = useState(value ?? 0);
  useEffect(() => setLocal(value ?? 0), [value]);
  return (
    <div>
      <label className="block text-xs text-felt-cream/50 mb-1">{label}</label>
      <input
        type="number"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onChange(local)}
        onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
        className="w-full bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-sm text-felt-cream"
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

function TicketModal({ children, onClose }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 print:bg-white print:static">
      <div className="bg-felt-panel rounded-lg p-6 relative print:bg-transparent print:p-0">
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
