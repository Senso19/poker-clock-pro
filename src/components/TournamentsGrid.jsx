import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { fetchAllTournaments, deleteTournament } from "../lib/tournaments.js";
import { useAccount } from "../context/AccountContext.jsx";
import { canManageTournaments } from "../lib/auth.js";
import { fetchChampionships } from "../lib/points.js";
import { fetchStructureTemplates, saveLevels, saveStructureConfig } from "../lib/levels.js";
import { fetchClockTemplates, applyClockTemplateToTournament } from "../lib/clockTemplates.js";
import { logEvent } from "../lib/events.js";

const MAX_PER_TABLE = 9;

/**
 * TournamentsGrid — page d'accueil : grille de tous les tournois, façon
 * BlindValet (bandeau "Actifs aujourd'hui", puis "Tous les tournois" avec
 * recherche/filtres/tri et bascule grille/liste). Admin/TD peuvent
 * créer/ouvrir en gestion ; tout le monde peut s'inscrire ou se désinscrire
 * directement depuis la carte si les inscriptions sont ouvertes.
 */
export default function TournamentsGrid({ onOpen }) {
  const { account } = useAccount();
  const manage = canManageTournaments(account.role);
  const [tournaments, setTournaments] = useState([]);
  const [counts, setCounts] = useState({});
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
        const { data: regs } = await supabase
          .from("registrations")
          .select("tournament_id")
          .in("tournament_id", ids);
        const c = {};
        (regs || []).forEach((r) => {
          c[r.tournament_id] = (c[r.tournament_id] || 0) + 1;
        });
        setCounts(c);
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
        const currentCount = counts[t.id] || 0;
        const perTable = t.players_per_table || MAX_PER_TABLE;
        const table = Math.floor(currentCount / perTable) + 1;
        const seat = (currentCount % perTable) + 1;
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
    if (!confirm(`Supprimer définitivement "${t.name}" et toutes ses données ?`)) return;
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

  function isUpcoming(t) {
    return !!t.scheduled_at && new Date(t.scheduled_at) > new Date();
  }

  function statusBadge(t) {
    if (isUpcoming(t)) return { label: "Programmé", cls: "bg-blue-500/20 text-blue-300" };
    return { label: "En cours", cls: "bg-emerald-500/15 text-emerald-400", dot: true };
  }

  if (loading) {
    return <div className="p-6 text-felt-cream/60 font-body">Chargement…</div>;
  }

  const activeToday = tournaments.filter((t) => !isUpcoming(t));

  let listed = tournaments.filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase()));
  if (statusFilter === "upcoming") listed = listed.filter(isUpcoming);
  else if (statusFilter === "active") listed = listed.filter((t) => !isUpcoming(t));

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
          <button
            onClick={() => setShowCreateForm((s) => !s)}
            className="flex items-center gap-2 px-4 py-2.5 bg-felt-gold text-felt-bg rounded-lg font-display text-sm hover:bg-felt-gold/90"
          >
            🏆 Créer un tournoi
          </button>
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
          </div>
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
          <option value="upcoming">À venir</option>
          <option value="active">En cours</option>
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
        </div>
      ) : (
        <div className="space-y-2">
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
        </div>
      )}
    </div>
  );
}

function TournamentCard({ t, badge, count, already, manage, busy, menuOpen, onOpen, onToggleRegister, onToggleMenu, onDelete }) {
  return (
    <div className="relative bg-felt-panel border border-felt-cream/10 rounded-xl p-4 flex flex-col hover:border-felt-cream/20 transition-colors">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="font-display text-base text-white">{t.name}</div>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <div className="text-xs text-felt-cream/40">
          {t.scheduled_at
            ? new Date(t.scheduled_at).toLocaleString("fr-FR")
            : new Date(t.created_at).toLocaleDateString("fr-FR")}
        </div>
        <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${badge.cls}`}>
          {badge.dot && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          {badge.label}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-sm text-felt-cream/70 mb-3">
        <span>👥</span>
        <span>{count}</span>
      </div>
      {t.championships?.name && (
        <div className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-felt-gold/10 text-felt-gold mb-3 w-fit">
          📊 {t.championships.name}
          {t.stage_label ? ` — ${t.stage_label}` : ""}
        </div>
      )}
      <div className="mt-auto flex items-center gap-2 pt-1">
        <button
          onClick={onOpen}
          className="text-sm px-3 py-1.5 rounded-lg font-display text-felt-cream/80 border border-felt-cream/15 hover:text-white hover:border-felt-cream/30"
        >
          Ouvrir
        </button>
        {t.registration_open && (
          <button
            disabled={busy}
            onClick={onToggleRegister}
            className={`text-sm px-3 py-1.5 rounded-lg font-display ${
              already
                ? "bg-felt-bg text-felt-cream/60 border border-felt-cream/15"
                : "bg-felt-gold text-felt-bg hover:bg-felt-gold/90"
            }`}
          >
            {already ? "Désinscription" : "S'inscrire"}
          </button>
        )}
        {manage && (
          <div className="relative ml-auto">
            <button onClick={onToggleMenu} className="text-felt-cream/40 hover:text-white px-1 text-lg leading-none">
              ⋮
            </button>
            {menuOpen && (
              <div className="absolute right-0 bottom-8 z-20 bg-felt-bg border border-felt-gold/40 rounded-md shadow-lg py-1 w-36 text-sm">
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
    <div className="relative flex flex-wrap items-center gap-4 bg-felt-panel border border-felt-cream/10 rounded-lg px-4 py-3 hover:border-felt-cream/20 transition-colors">
      <div className="min-w-0 flex-1">
        <div className="font-display text-white truncate">{t.name}</div>
        <div className="text-xs text-felt-cream/40">
          {t.scheduled_at ? new Date(t.scheduled_at).toLocaleString("fr-FR") : new Date(t.created_at).toLocaleDateString("fr-FR")}
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
        <button onClick={onOpen} className="text-sm px-3 py-1.5 rounded-lg font-display text-felt-cream/80 border border-felt-cream/15 hover:text-white hover:border-felt-cream/30">
          Ouvrir
        </button>
        {t.registration_open && (
          <button
            disabled={busy}
            onClick={onToggleRegister}
            className={`text-sm px-3 py-1.5 rounded-lg font-display ${
              already ? "bg-felt-bg text-felt-cream/60 border border-felt-cream/15" : "bg-felt-gold text-felt-bg hover:bg-felt-gold/90"
            }`}
          >
            {already ? "Désinscription" : "S'inscrire"}
          </button>
        )}
        {manage && (
          <div className="relative">
            <button onClick={onToggleMenu} className="text-felt-cream/40 hover:text-white px-1 text-lg leading-none">
              ⋮
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-8 z-20 bg-felt-bg border border-felt-gold/40 rounded-md shadow-lg py-1 w-36 text-sm">
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
