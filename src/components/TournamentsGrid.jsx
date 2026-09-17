import { useEffect, useState } from "react";
import ClubLoader from "./ClubLoader.jsx";
import { supabase } from "../lib/supabase.js";
import { fetchAllTournaments, deleteTournament } from "../lib/tournaments.js";
import { useAccount } from "../context/AccountContext.jsx";
import { canManageTournaments, canManageTournament, canParticipate, isClubMember } from "../lib/auth.js";
import { fetchChampionships } from "../lib/points.js";
import { fetchStructureTemplates, saveLevels, saveStructureConfig, fetchLevels } from "../lib/levels.js";
import { fetchClockTemplates, applyClockTemplateToTournament } from "../lib/clockTemplates.js";
import { logEvent } from "../lib/events.js";
import { addAnnouncement } from "../lib/announcements.js";
import CustomizablePanel from "./CustomizablePanel.jsx";
import EditableButton from "./EditableButton.jsx";
import { useConfirm } from "../context/ConfirmContext.jsx";

/**
 * TournamentsGrid — page d'accueil : grille de tous les tournois, façon
 * BlindValet (bandeau "Actifs aujourd'hui", puis "Tous les tournois" avec
 * recherche/filtres/tri et bascule grille/liste). Admin/TD peuvent
 * créer/ouvrir en gestion ; tout le monde peut s'inscrire ou se désinscrire
 * directement depuis la carte si les inscriptions sont ouvertes.
 */
export default function TournamentsGrid({ onOpen }) {
  const confirmAction = useConfirm();
  const { account } = useAccount();
  const manage = canManageTournaments(account?.role);
  const clubMember = isClubMember(account);
  const [tournaments, setTournaments] = useState([]);
  const [counts, setCounts] = useState({});
  const [eliminatedCounts, setEliminatedCounts] = useState({});
  const [myRegs, setMyRegs] = useState(new Set());
  const [championships, setChampionships] = useState([]);
  const [structureTemplates, setStructureTemplates] = useState([]);
  const [clockTemplates, setClockTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);
  const [winnerAnnounce, setWinnerAnnounce] = useState(null);
  const [winners, setWinners] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [openMenuId, setOpenMenuId] = useState(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("upcoming");
  const [sortOrder, setSortOrder] = useState("date_asc");
  const [view, setView] = useState("grid");

  useEffect(() => {
    load();
  }, []);

  // Ferme le menu ⋮ d'une carte dès qu'on clique ailleurs sur la page.
  useEffect(() => {
    if (!openMenuId) return;
    const close = () => setOpenMenuId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [openMenuId]);

  async function load() {
    setLoading(true);
    try {
      const list = await fetchAllTournaments();
      // Visiteur non connecté : uniquement les tournois marqués "Accès
      // public" — les autres restent réservés aux comptes connectés.
      setTournaments(account ? list : list.filter((t) => t.public_view));
      setChampionships(await fetchChampionships());
      fetchStructureTemplates().then(setStructureTemplates).catch(() => {});
      fetchClockTemplates().then(setClockTemplates).catch(() => {});

      const ids = list.map((t) => t.id);
      if (ids.length > 0) {
        const [{ data: regs }, { data: elims }] = await Promise.all([
          supabase.from("registrations").select("id, tournament_id, players(pseudo, full_name)").in("tournament_id", ids),
          supabase.from("eliminations").select("tournament_id, registration_id").in("tournament_id", ids).eq("undone", false),
        ]);
        const c = {};
        (regs || []).forEach((r) => {
          c[r.tournament_id] = (c[r.tournament_id] || 0) + 1;
        });
        setCounts(c);
        const e = {};
        const eliminatedRegIds = new Set();
        (elims || []).forEach((r) => {
          e[r.tournament_id] = (e[r.tournament_id] || 0) + 1;
          eliminatedRegIds.add(r.registration_id);
        });
        setEliminatedCounts(e);

        // Vainqueur = le seul joueur d'un tournoi terminé encore non
        // éliminé — affiché directement sur sa carte.
        const finishedIds = new Set(list.filter((t) => t.force_finished).map((t) => t.id));
        const byTournamentActive = {};
        (regs || []).forEach((r) => {
          if (!finishedIds.has(r.tournament_id) || eliminatedRegIds.has(r.id)) return;
          (byTournamentActive[r.tournament_id] ||= []).push(r);
        });
        const w = {};
        Object.entries(byTournamentActive).forEach(([tId, players]) => {
          if (players.length === 1) w[tId] = players[0].players?.pseudo || players[0].players?.full_name;
        });
        setWinners(w);
      }

      // Un visiteur non connecté n'a pas d'inscriptions personnelles à
      // suivre — pas de requête, la grille reste en pure consultation.
      if (account) {
        const { data: myR } = await supabase
          .from("registrations")
          .select("tournament_id")
          .eq("account_id", account.id);
        setMyRegs(new Set((myR || []).map((r) => r.tournament_id)));
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handleToggleRegister(t) {
    if (!account) {
      setError("Connectez-vous pour vous inscrire à un tournoi.");
      return;
    }
    if (!myRegs.has(t.id) && !canParticipate(account)) {
      setError("Votre compte doit d'abord être validé par un administrateur avant de pouvoir vous inscrire à un tournoi.");
      return;
    }
    setBusyId(t.id);
    setError(null);
    try {
      if (myRegs.has(t.id)) {
        const { data: reg } = await supabase
          .from("registrations")
          .select("id")
          .eq("tournament_id", t.id)
          .eq("account_id", account.id)
          .maybeSingle();
        if (reg) await supabase.from("registrations").delete().eq("id", reg.id);
      } else {
        let { data: player } = await supabase
          .from("players")
          .select("id")
          .eq("full_name", account.pseudo)
          .maybeSingle();
        if (!player) {
          const { data: created, error: pErr } = await supabase
            .from("players")
            .insert({ full_name: account.pseudo, email: account.email })
            .select()
            .single();
          if (pErr) throw pErr;
          player = created;
        }
        // Plus d'attribution automatique de table/siège à l'inscription —
        // se fait ensuite via "Tirer les places" ou individuellement.
        const { error: regErr } = await supabase.from("registrations").insert({
          tournament_id: t.id,
          player_id: player.id,
          account_id: account.id,
          table_number: null,
          seat_number: null,
          stack: t.starting_stack,
        });
        if (regErr) throw regErr;
      }
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  }

  async function handleDelete(t) {
    setOpenMenuId(null);
    if (!(await confirmAction(`Supprimer définitivement "${t.name}" et toutes ses données ?`))) return;
    try {
      await deleteTournament(t.id);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDuplicate(t) {
    setOpenMenuId(null);
    try {
      const { data: created, error: insErr } = await supabase
        .from("tournaments")
        .insert({
          name: `${t.name} (copie)`,
          date: t.date,
          buy_in: t.buy_in,
          rebuy_amount: t.rebuy_amount,
          addon_amount: t.addon_amount,
          starting_stack: t.starting_stack,
          status: "running",
          championship_id: t.championship_id,
          stage_label: t.stage_label,
          registration_open: true,
          max_players: t.max_players,
          players_per_table: t.players_per_table,
          final_table_size: t.final_table_size,
          reserved_seats: t.reserved_seats,
          location: t.location,
          track_knockouts: t.track_knockouts,
          manage_payouts: t.manage_payouts,
          manage_players: t.manage_players,
          structure_config: t.structure_config,
          clock_layout: t.clock_layout,
          is_interclub: t.is_interclub,
          clock_background: t.clock_background,
          max_tables: t.max_tables,
          // Volontairement pas copiés : joueurs/inscriptions (aucune ligne
          // "registrations" n'est créée), places tirées, horloge démarrée,
          // statut terminé, accès public (à réactiver au besoin).
        })
        .select()
        .single();
      if (insErr) throw insErr;
      logEvent(created.id, "create", created.name);
      const sourceLevels = await fetchLevels(t.id);
      if (sourceLevels.length > 0) await saveLevels(created.id, sourceLevels);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleMarkFinished(t) {
    setOpenMenuId(null);
    if (!(await confirmAction(`Marquer "${t.name}" comme terminé ? Le chrono s'arrêtera.`))) return;
    try {
      await supabase.from("tournaments").update({ force_finished: true, clock_is_running: false }).eq("id", t.id);
      // S'il ne reste qu'un seul joueur non éliminé, c'est le gagnant —
      // on l'annonce (fenêtre ici + écrit sur le panneau Annonces de
      // l'horloge, visible sur grand écran).
      const [{ data: regs }, { data: elims }] = await Promise.all([
        supabase.from("registrations").select("id, players(full_name, pseudo)").eq("tournament_id", t.id),
        supabase.from("eliminations").select("registration_id").eq("tournament_id", t.id).eq("undone", false),
      ]);
      const eliminatedIds = new Set((elims || []).map((e) => e.registration_id));
      const stillIn = (regs || []).filter((r) => !eliminatedIds.has(r.id));
      if (stillIn.length === 1) {
        const winnerName = stillIn[0].players?.pseudo || stillIn[0].players?.full_name || "Le gagnant";
        setWinnerAnnounce({ tournamentName: t.name, winnerName });
        addAnnouncement(t.id, `🏆 ${winnerName} a gagné le tournoi !`, "winner");
      }
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleCreate(form) {
    setCreating(true);
    setError(null);
    try {
      const structTemplate = structureTemplates.find((t) => t.id === form.structureTemplateId);
      const { data: created, error: insErr } = await supabase
        .from("tournaments")
        .insert({
          name: form.name,
          date: form.date || new Date().toISOString().slice(0, 10),
          scheduled_at: form.date ? new Date(`${form.date}T00:00:00`).toISOString() : new Date().toISOString(),
          starting_stack: structTemplate?.structure_config?.fields?.startingStack?.value || 5000,
          status: "running",
          championship_id: form.championshipId || null,
          registration_open: true,
          is_interclub: !!form.isInterclub,
        })
        .select()
        .single();
      if (insErr) throw insErr;
      logEvent(created.id, "create", created.name);

      if (structTemplate) {
        await saveLevels(created.id, structTemplate.levels || []);
        await saveStructureConfig(created.id, structTemplate.structure_config || null);
      }
      const clockTemplate = clockTemplates.find((t) => t.id === form.clockTemplateId);
      if (clockTemplate) {
        await applyClockTemplateToTournament(created.id, clockTemplate.layout);
      }

      setShowCreateForm(false);
      await load();
    } catch (e) {
      setError(e.message);
    }
    setCreating(false);
  }

  function startDate(t) {
    return new Date(t.scheduled_at || t.date || t.created_at);
  }
  function isPastOrToday(t) {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return startDate(t).getTime() <= endOfToday.getTime();
  }
  // "Terminé" si forcé manuellement (réglages du tournoi), ou si l'horloge
  // a démarré et qu'il ne reste plus qu'un seul joueur en jeu. "Programmé"
  // tant que l'horloge n'a jamais été lancée. Sinon "En cours".
  function tournamentStatus(t) {
    if (t.force_finished) return "finished";
    if (!t.clock_started) return "scheduled";
    const total = counts[t.id] || 0;
    const eliminated = eliminatedCounts[t.id] || 0;
    if (total > 1 && total - eliminated <= 1) return "finished";
    return "running";
  }

  function statusBadge(t) {
    const status = tournamentStatus(t);
    if (status === "finished") return { label: "Terminé", cls: "bg-felt-cream/10 text-felt-cream/60" };
    if (status === "scheduled") return { label: "Programmé", cls: "bg-blue-500/20 text-blue-300" };
    return { label: "En cours", cls: "bg-emerald-500/15 text-emerald-400", dot: true };
  }

  if (loading) {
    return <ClubLoader />;
  }

  // Un membre de club (affilié à un club externe via son gestionnaire de
  // club) n'a accès qu'aux tournois interclubs, en lecture seule.
  const visibleTournaments = clubMember ? tournaments.filter((t) => t.is_interclub) : tournaments;

  // Actifs aujourd'hui : tournois du jour ou antérieurs, en cours ou programmés.
  const activeToday = visibleTournaments.filter((t) => {
    const status = tournamentStatus(t);
    return isPastOrToday(t) && (status === "running" || status === "scheduled");
  });
  const activeTodayIds = new Set(activeToday.map((t) => t.id));
  // Tous les tournois : tous les autres (programmés à venir, ou terminés quelle que soit la date).
  const otherTournaments = visibleTournaments.filter((t) => !activeTodayIds.has(t.id));
  const finishedTournaments = otherTournaments.filter((t) => tournamentStatus(t) === "finished");

  let listed = otherTournaments.filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase()));
  if (statusFilter === "upcoming") listed = listed.filter((t) => tournamentStatus(t) === "scheduled");
  else if (statusFilter === "finished") listed = listed.filter((t) => tournamentStatus(t) === "finished");

  listed = [...listed].sort((a, b) => {
    if (sortOrder === "name") return a.name.localeCompare(b.name);
    const da = new Date(a.scheduled_at || a.created_at).getTime();
    const db = new Date(b.scheduled_at || b.created_at).getTime();
    return sortOrder === "date_desc" ? db - da : da - db;
  });

  return (
    <div className="p-4 sm:p-6 font-body text-white h-full overflow-y-auto">
      <div className="flex items-center justify-end gap-3 mb-6">
        {manage && (
          <EditableButton
            groupKey="tournaments-toolbar"
            id="create-tournament"
            onClick={() => setShowCreateForm((s) => !s)}
            className="flex items-center gap-2 px-4 py-2.5 bg-felt-gold text-felt-bg rounded-lg font-display text-sm hover:bg-felt-gold/90"
          >
            🏆 Créer un tournoi
          </EditableButton>
        )}
      </div>

      {error && <div className="text-felt-alert text-sm mb-3">{error}</div>}

      {showCreateForm && (
        <div className="mb-6 max-w-sm">
          <TournamentCreateForm
            championships={championships}
            structureTemplates={structureTemplates}
            clockTemplates={clockTemplates}
            onCreate={handleCreate}
            loading={creating}
          />
        </div>
      )}

      {activeToday.length > 0 && (
        <div className="mb-8">
          <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40 mb-3">
            Actifs aujourd'hui
          </div>
          <CustomizablePanel
            panelKey="tournaments-active"
            defaultWidth="1 1 100%"
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
          >
            {activeToday.map((t) => (
              <TournamentCard
                key={t.id}
                t={t}
                badge={statusBadge(t)}
                count={counts[t.id] || 0}
                already={myRegs.has(t.id)}
                manage={canManageTournament(account, t)}
                canDuplicate={manage}
                readOnly={clubMember}
                busy={busyId === t.id}
                menuOpen={openMenuId === t.id}
                onOpen={() => onOpen(t.id)}
                onToggleRegister={() => handleToggleRegister(t)}
                onToggleMenu={() => setOpenMenuId(openMenuId === t.id ? null : t.id)}
                onDelete={() => handleDelete(t)}
                onDuplicate={() => handleDuplicate(t)}
                onMarkFinished={() => handleMarkFinished(t)}
                winnerName={winners[t.id]}
              />
            ))}
          </CustomizablePanel>
        </div>
      )}

      <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40 mb-3">
        Tous les tournois
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Rechercher des tournois…"
          className="flex-1 min-w-[200px] bg-felt-panel border border-felt-cream/10 rounded-lg px-4 py-2.5 text-white placeholder:text-felt-cream/40"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-felt-panel border border-felt-cream/10 rounded-lg px-3 py-2.5 text-sm text-white"
        >
          <option value="upcoming">Programmés</option>
          <option value="finished">Terminés</option>
          <option value="all">Tous</option>
        </select>
        <select
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
          className="bg-felt-panel border border-felt-cream/10 rounded-lg px-3 py-2.5 text-sm text-white"
        >
          <option value="date_asc">Date ↑</option>
          <option value="date_desc">Date ↓</option>
          <option value="name">Nom A-Z</option>
        </select>
        <div className="flex items-center gap-1 bg-felt-panel border border-felt-cream/10 rounded-lg p-1">
          <EditableButton
            groupKey="tournaments-view-toggle"
            id="grid"
            onClick={() => setView("grid")}
            className={`w-8 h-8 rounded flex items-center justify-center ${view === "grid" ? "bg-felt-gold text-felt-bg" : "text-felt-cream/50 hover:text-white"}`}
          >
            ▦
          </EditableButton>
          <EditableButton
            groupKey="tournaments-view-toggle"
            id="list"
            defaultOrder={1}
            onClick={() => setView("list")}
            className={`w-8 h-8 rounded flex items-center justify-center ${view === "list" ? "bg-felt-gold text-felt-bg" : "text-felt-cream/50 hover:text-white"}`}
          >
            ☰
          </EditableButton>
        </div>
      </div>

      {listed.length === 0 ? (
        <div className="text-felt-cream/50 text-sm">Aucun tournoi ne correspond.</div>
      ) : view === "grid" ? (
        <CustomizablePanel
          panelKey="tournaments-list-grid"
          defaultWidth="1 1 100%"
          className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3"
        >
          {listed.map((t) => (
            <TournamentCard
              key={t.id}
              t={t}
              badge={statusBadge(t)}
              count={counts[t.id] || 0}
              already={myRegs.has(t.id)}
              manage={canManageTournament(account, t)}
              canDuplicate={manage}
              readOnly={clubMember}
              busy={busyId === t.id}
              menuOpen={openMenuId === t.id}
              onOpen={() => onOpen(t.id)}
              onToggleRegister={() => handleToggleRegister(t)}
              onToggleMenu={() => setOpenMenuId(openMenuId === t.id ? null : t.id)}
              onDelete={() => handleDelete(t)}
              onDuplicate={() => handleDuplicate(t)}
              onMarkFinished={() => handleMarkFinished(t)}
              winnerName={winners[t.id]}
            />
          ))}
        </CustomizablePanel>
      ) : (
        <CustomizablePanel panelKey="tournaments-list-rows" defaultWidth="1 1 100%" className="space-y-2">
          {listed.map((t) => (
            <TournamentRow
              key={t.id}
              t={t}
              badge={statusBadge(t)}
              count={counts[t.id] || 0}
              already={myRegs.has(t.id)}
              manage={canManageTournament(account, t)}
              canDuplicate={manage}
              readOnly={clubMember}
              busy={busyId === t.id}
              menuOpen={openMenuId === t.id}
              onOpen={() => onOpen(t.id)}
              onToggleRegister={() => handleToggleRegister(t)}
              onToggleMenu={() => setOpenMenuId(openMenuId === t.id ? null : t.id)}
              onDelete={() => handleDelete(t)}
              onDuplicate={() => handleDuplicate(t)}
              onMarkFinished={() => handleMarkFinished(t)}
              winnerName={winners[t.id]}
            />
          ))}
        </CustomizablePanel>
      )}
      {winnerAnnounce && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setWinnerAnnounce(null)}>
          <div className="bg-felt-panel border border-felt-gold/40 rounded-lg p-8 w-full max-w-sm text-center" onClick={(e) => e.stopPropagation()}>
            <div className="text-5xl mb-3">🏆</div>
            <div className="font-display text-xl mb-1">{winnerAnnounce.winnerName}</div>
            <div className="text-felt-cream/60 text-sm mb-6">a gagné « {winnerAnnounce.tournamentName} » !</div>
            <button onClick={() => setWinnerAnnounce(null)} className="px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display">
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TournamentCard({ t, badge, count, already, manage, canDuplicate, readOnly, busy, menuOpen, onOpen, onToggleRegister, onToggleMenu, onDelete, onDuplicate, onMarkFinished, winnerName }) {
  return (
    <div
      onClick={onOpen}
      data-pcp-card
      className="relative bg-felt-panel border border-felt-cream/10 rounded-xl p-4 flex flex-col hover:border-felt-cream/20 transition-colors cursor-pointer"
    >
      <div className="flex items-center gap-1.5 mb-1">
        <div className="pcp-title font-display text-base leading-tight truncate">{t.name}</div>
        {t.is_interclub && (
          <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-felt-gold/15 text-felt-gold uppercase tracking-wide">
            Interclub
          </span>
        )}
      </div>
      {winnerName && (
        <div className="flex items-center gap-1.5 text-xs text-felt-gold mb-1.5 truncate">
          <span>🏆</span>
          <span className="truncate">{winnerName}</span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="pcp-body text-xs text-felt-cream/40 truncate">
          {t.scheduled_at
            ? new Date(t.scheduled_at).toLocaleString("fr-FR")
            : new Date(t.date || t.created_at).toLocaleDateString("fr-FR")}
        </div>
        <span className={`pcp-body inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full shrink-0 ${badge.cls}`}>
          {badge.dot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          {badge.label}
        </span>
      </div>
      <div className="pcp-space" />
      <div className="pcp-value pcp-row flex items-center justify-center gap-2 text-xl font-display py-3 mb-3">
        <span className="text-base opacity-70">👥</span>
        <span>{count}</span>
      </div>
      {t.championships?.name && (
        <div className="pcp-body inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border border-felt-gold/40 text-felt-gold mb-3 w-fit max-w-full truncate">
          📊 {t.championships.name}
          {t.stage_label ? ` — ${t.stage_label}` : ""}
        </div>
      )}
      <div className="pcp-space-2" />
      <div className="mt-auto flex items-center gap-2 pt-1">
        <EditableButton
          groupKey="tournament-card-grid"
          id="open"
          onClick={onOpen}
          className="pcp-btn text-sm px-4 py-2 rounded-full font-display text-felt-cream/80 border border-felt-cream/20 hover:text-white hover:border-felt-cream/40"
        >
          Ouvrir
        </EditableButton>
        {t.registration_open && !readOnly && (
          <EditableButton
            groupKey="tournament-card-grid"
            id="register"
            defaultOrder={1}
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onToggleRegister();
            }}
            className={`pcp-btn text-sm px-4 py-2 rounded-full font-display ${
              already
                ? "bg-felt-bg text-white border border-felt-cream/30"
                : "bg-felt-gold text-felt-bg hover:bg-felt-gold/90"
            }`}
          >
            {already ? "Désinscription" : "S'inscrire"}
          </EditableButton>
        )}
        {manage && (
          <div className="relative ml-auto">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleMenu();
              }}
              className="text-felt-cream/40 hover:text-white px-1 text-lg leading-none"
            >
              ⋮
            </button>
            {menuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 bottom-8 z-20 bg-felt-bg border border-felt-gold/40 rounded-md shadow-lg py-1 w-36 text-sm"
              >
                {canDuplicate && (
                  <button onClick={onDuplicate} className="w-full text-left px-3 py-2 text-felt-cream/80 hover:bg-felt-panel">
                    📋 Dupliquer
                  </button>
                )}
                {!t.force_finished && (
                  <button onClick={onMarkFinished} className="w-full text-left px-3 py-2 text-felt-cream/80 hover:bg-felt-panel">
                    🏁 Marquer comme fini
                  </button>
                )}
                {canDuplicate && (
                  <button onClick={onDelete} className="w-full text-left px-3 py-2 text-felt-alert hover:bg-felt-panel">
                    🗑 Supprimer
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TournamentRow({ t, badge, count, already, manage, canDuplicate, readOnly, busy, menuOpen, onOpen, onToggleRegister, onToggleMenu, onDelete, onDuplicate, onMarkFinished, winnerName }) {
  return (
    <div
      onClick={onOpen}
      data-pcp-card
      className="relative flex flex-wrap items-center gap-4 bg-felt-panel border border-felt-cream/10 rounded-lg px-4 py-3 hover:border-felt-cream/20 transition-colors cursor-pointer"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <div className="pcp-title font-display text-white truncate">{t.name}</div>
          {t.is_interclub && (
            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-felt-gold/15 text-felt-gold uppercase tracking-wide">
              Interclub
            </span>
          )}
        </div>
        <div className="pcp-body text-xs text-felt-cream/40">
          {t.scheduled_at ? new Date(t.scheduled_at).toLocaleString("fr-FR") : new Date(t.date || t.created_at).toLocaleDateString("fr-FR")}
        </div>
      </div>
      {winnerName && (
        <div className="flex items-center gap-1.5 text-xs text-felt-gold shrink-0">
          <span>🏆</span>
          <span className="truncate max-w-[120px]">{winnerName}</span>
        </div>
      )}
      <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full shrink-0 ${badge.cls}`}>
        {badge.dot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
        {badge.label}
      </span>
      <div className="flex items-center gap-1.5 text-sm text-felt-cream/70 shrink-0">
        <span>👥</span>
        <span>{count}</span>
      </div>
      {t.championships?.name && (
        <div className="hidden sm:inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-felt-gold/10 text-felt-gold shrink-0">
          📊 {t.championships.name}
        </div>
      )}
      <div className="flex items-center gap-2 shrink-0">
        <EditableButton
          groupKey="tournament-card-row"
          id="open"
          onClick={onOpen}
          className="pcp-btn text-sm px-3 py-1.5 rounded-lg font-display text-felt-cream/80 border border-felt-cream/15 hover:text-white hover:border-felt-cream/30"
        >
          Ouvrir
        </EditableButton>
        {t.registration_open && !readOnly && (
          <EditableButton
            groupKey="tournament-card-row"
            id="register"
            defaultOrder={1}
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              onToggleRegister();
            }}
            className={`pcp-btn text-sm px-3 py-1.5 rounded-lg font-display ${
              already ? "bg-felt-bg text-felt-cream/60 border border-felt-cream/15" : "bg-felt-gold text-felt-bg hover:bg-felt-gold/90"
            }`}
          >
            {already ? "Désinscription" : "S'inscrire"}
          </EditableButton>
        )}
        {manage && (
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleMenu();
              }}
              className="text-felt-cream/40 hover:text-white px-1 text-lg leading-none"
            >
              ⋮
            </button>
            {menuOpen && (
              <div
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-8 z-20 bg-felt-bg border border-felt-gold/40 rounded-md shadow-lg py-1 w-36 text-sm"
              >
                {canDuplicate && (
                  <button onClick={onDuplicate} className="w-full text-left px-3 py-2 text-felt-cream/80 hover:bg-felt-panel">
                    📋 Dupliquer
                  </button>
                )}
                {!t.force_finished && (
                  <button onClick={onMarkFinished} className="w-full text-left px-3 py-2 text-felt-cream/80 hover:bg-felt-panel">
                    🏁 Marquer comme fini
                  </button>
                )}
                {canDuplicate && (
                  <button onClick={onDelete} className="w-full text-left px-3 py-2 text-felt-alert hover:bg-felt-panel">
                    🗑 Supprimer
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TournamentCreateForm({ championships, structureTemplates, clockTemplates, onCreate, loading }) {
  const [name, setName] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [championshipId, setChampionshipId] = useState("");
  const [clockTemplateId, setClockTemplateId] = useState("");
  const [structureTemplateId, setStructureTemplateId] = useState("");
  const [isInterclub, setIsInterclub] = useState(false);

  return (
    <div className="flex flex-col gap-3 bg-felt-panel border border-felt-cream/10 rounded-md p-4">
      <label className="text-xs text-felt-cream/50">
        Nom du tournoi
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Freeroll du 20/09"
          className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
        />
      </label>
      <label className="text-xs text-felt-cream/50">
        Date
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream"
        />
      </label>
      <label className="text-xs text-felt-cream/50">
        Championnat
        <select
          value={championshipId}
          onChange={(e) => setChampionshipId(e.target.value)}
          className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream"
        >
          <option value="">Aucun championnat</option>
          {championships.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-felt-cream/50">
        Modèle d'horloge
        <select
          value={clockTemplateId}
          onChange={(e) => setClockTemplateId(e.target.value)}
          className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream"
        >
          <option value="">Aucun (garder l'horloge actuelle)</option>
          {clockTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-felt-cream/50">
        Modèle de structure
        <select
          value={structureTemplateId}
          onChange={(e) => setStructureTemplateId(e.target.value)}
          className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream"
        >
          <option value="">Aucun (structure par défaut)</option>
          {structureTemplates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm text-felt-cream/80 pt-1">
        <input type="checkbox" checked={isInterclub} onChange={(e) => setIsInterclub(e.target.checked)} />
        Tournoi interclubs
      </label>
      {isInterclub && (
        <div className="text-xs text-felt-cream/40">
          Un gestionnaire de club pourra gérer entièrement ce tournoi et y inscrire jusqu'à {" "}
          <span className="text-felt-gold">10 membres de son club</span>.
        </div>
      )}
      <button
        disabled={!name.trim() || loading}
        onClick={() =>
          onCreate({
            name: name.trim(),
            date,
            championshipId,
            clockTemplateId,
            structureTemplateId,
            isInterclub,
          })
        }
        className="px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
      >
        {loading ? "Création…" : "Créer le tournoi"}
      </button>
    </div>
  );
}
