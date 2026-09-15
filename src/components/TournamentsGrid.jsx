import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { fetchAllTournaments, deleteTournament } from "../lib/tournaments.js";
import { computeSeatAssignment } from "../lib/seating.js";
import { useAccount } from "../context/AccountContext.jsx";
import { canManageTournaments, canParticipate } from "../lib/auth.js";
import { fetchChampionships } from "../lib/points.js";
import { fetchStructureTemplates, saveLevels, saveStructureConfig } from "../lib/levels.js";
import { fetchClockTemplates, applyClockTemplateToTournament } from "../lib/clockTemplates.js";
import { logEvent } from "../lib/events.js";
import CustomizablePanel from "./CustomizablePanel.jsx";
import EditableButton from "./EditableButton.jsx";
import { useConfirm } from "../context/ConfirmContext.jsx";

const MAX_PER_TABLE = 9;

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
  const manage = canManageTournaments(account.role);
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
      setTournaments(list);
      setChampionships(await fetchChampionships());
      fetchStructureTemplates().then(setStructureTemplates).catch(() => {});
      fetchClockTemplates().then(setClockTemplates).catch(() => {});

      const ids = list.map((t) => t.id);
      if (ids.length > 0) {
        const [{ data: regs }, { data: elims }] = await Promise.all([
          supabase.from("registrations").select("tournament_id").in("tournament_id", ids),
          supabase.from("eliminations").select("tournament_id").in("tournament_id", ids).eq("undone", false),
        ]);
        const c = {};
        (regs || []).forEach((r) => {
          c[r.tournament_id] = (c[r.tournament_id] || 0) + 1;
        });
        setCounts(c);
        const e = {};
        (elims || []).forEach((r) => {
          e[r.tournament_id] = (e[r.tournament_id] || 0) + 1;
        });
        setEliminatedCounts(e);
      }

      const { data: myR } = await supabase
        .from("registrations")
        .select("tournament_id")
        .eq("account_id", account.id);
      setMyRegs(new Set((myR || []).map((r) => r.tournament_id)));
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handleToggleRegister(t) {
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
        const { table, seat } = await computeSeatAssignment(t);
        const { error: regErr } = await supabase.from("registrations").insert({
          tournament_id: t.id,
          player_id: player.id,
          account_id: account.id,
          table_number: table,
          seat_number: seat,
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
    return <div className="p-6 text-felt-cream/60 font-body">Chargement…</div>;
  }

  // Actifs aujourd'hui : tournois du jour ou antérieurs, en cours ou programmés.
  const activeToday = tournaments.filter((t) => {
    const status = tournamentStatus(t);
    return isPastOrToday(t) && (status === "running" || status === "scheduled");
  });
  const activeTodayIds = new Set(activeToday.map((t) => t.id));
  // Tous les tournois : tous les autres (programmés à venir, ou terminés quelle que soit la date).
  const otherTournaments = tournaments.filter((t) => !activeTodayIds.has(t.id));
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
                manage={manage}
                busy={busyId === t.id}
                menuOpen={openMenuId === t.id}
                onOpen={() => onOpen(t.id)}
                onToggleRegister={() => handleToggleRegister(t)}
                onToggleMenu={() => setOpenMenuId(openMenuId === t.id ? null : t.id)}
                onDelete={() => handleDelete(t)}
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
          <button
            onClick={() => setView("grid")}
            title="Vue grille"
            className={`w-8 h-8 rounded flex items-center justify-center ${view === "grid" ? "bg-felt-gold text-felt-bg" : "text-felt-cream/50 hover:text-white"}`}
          >
            ▦
          </button>
          <button
            onClick={() => setView("list")}
            title="Vue liste"
            className={`w-8 h-8 rounded flex items-center justify-center ${view === "list" ? "bg-felt-gold text-felt-bg" : "text-felt-cream/50 hover:text-white"}`}
          >
            ☰
          </button>
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
              manage={manage}
              busy={busyId === t.id}
              menuOpen={openMenuId === t.id}
              onOpen={() => onOpen(t.id)}
              onToggleRegister={() => handleToggleRegister(t)}
              onToggleMenu={() => setOpenMenuId(openMenuId === t.id ? null : t.id)}
              onDelete={() => handleDelete(t)}
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
              manage={manage}
              busy={busyId === t.id}
              menuOpen={openMenuId === t.id}
              onOpen={() => onOpen(t.id)}
              onToggleRegister={() => handleToggleRegister(t)}
              onToggleMenu={() => setOpenMenuId(openMenuId === t.id ? null : t.id)}
              onDelete={() => handleDelete(t)}
            />
          ))}
        </CustomizablePanel>
      )}
    </div>
  );
}

function TournamentCard({ t, badge, count, already, manage, busy, menuOpen, onOpen, onToggleRegister, onToggleMenu, onDelete }) {
  return (
    <div
      onClick={onOpen}
      className="relative bg-felt-panel border border-felt-cream/10 rounded-xl p-4 flex flex-col hover:border-felt-cream/20 transition-colors cursor-pointer"
    >
      <div className="pcp-title font-display text-base leading-tight mb-1 truncate">{t.name}</div>
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
      <div className="mt-auto flex items-center gap-2 pt-1">
        <EditableButton
          groupKey="tournament-card-grid"
          id="open"
          onClick={onOpen}
          className="pcp-btn text-sm px-4 py-2 rounded-full font-display text-felt-cream/80 border border-felt-cream/20 hover:text-white hover:border-felt-cream/40"
        >
          Ouvrir
        </EditableButton>
        {t.registration_open && (
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
                <button onClick={onDelete} className="w-full text-left px-3 py-2 text-felt-alert hover:bg-felt-panel">
                  🗑 Supprimer
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TournamentRow({ t, badge, count, already, manage, busy, menuOpen, onOpen, onToggleRegister, onToggleMenu, onDelete }) {
  return (
    <div
      onClick={onOpen}
      className="relative flex flex-wrap items-center gap-4 bg-felt-panel border border-felt-cream/10 rounded-lg px-4 py-3 hover:border-felt-cream/20 transition-colors cursor-pointer"
    >
      <div className="min-w-0 flex-1">
        <div className="pcp-title font-display text-white truncate">{t.name}</div>
        <div className="pcp-body text-xs text-felt-cream/40">
          {t.scheduled_at ? new Date(t.scheduled_at).toLocaleString("fr-FR") : new Date(t.date || t.created_at).toLocaleDateString("fr-FR")}
        </div>
      </div>
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
        {t.registration_open && (
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
                <button onClick={onDelete} className="w-full text-left px-3 py-2 text-felt-alert hover:bg-felt-panel">
                  🗑 Supprimer
                </button>
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
      <button
        disabled={!name.trim() || loading}
        onClick={() =>
          onCreate({
            name: name.trim(),
            date,
            championshipId,
            clockTemplateId,
            structureTemplateId,
          })
        }
        className="px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
      >
        {loading ? "Création…" : "Créer le tournoi"}
      </button>
    </div>
  );
}
