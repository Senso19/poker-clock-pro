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
 * BlindValet. Admin/TD peuvent créer/ouvrir en gestion ; tout le monde peut
 * s'inscrire ou se désinscrire directement depuis la carte si les
 * inscriptions sont ouvertes.
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
  const [search, setSearch] = useState("");

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

  function statusBadge(t) {
    if (t.scheduled_at && new Date(t.scheduled_at) > new Date()) {
      return { label: "Programmé", cls: "bg-blue-500/20 text-blue-300" };
    }
    if (t.registration_open) {
      return { label: "Inscriptions ouvertes", cls: "bg-felt-gold/20 text-felt-gold" };
    }
    return { label: "En cours", cls: "bg-felt-cream/10 text-felt-cream/60" };
  }

  if (loading) {
    return <div className="p-6 text-felt-cream/60 font-body">Chargement…</div>;
  }

  return (
    <div className="p-4 sm:p-6 font-body text-felt-cream h-full overflow-y-auto">
      <div className="flex items-baseline justify-between mb-4">
        <div className="font-display text-xl">Tous les tournois</div>
        {manage && (
          <button
            onClick={() => setShowCreateForm((s) => !s)}
            className="px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display text-sm"
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

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="🔍 Rechercher des tournois…"
        className="w-full mb-6 bg-felt-panel border border-felt-cream/10 rounded-md px-4 py-2.5 text-felt-cream placeholder:text-felt-cream/40"
      />

      {(() => {
        const filtered = tournaments.filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase()));
        if (filtered.length === 0) {
          return <div className="text-felt-cream/50 text-sm">Aucun tournoi ne correspond à la recherche.</div>;
        }
        return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((t) => {
            const badge = statusBadge(t);
            const already = myRegs.has(t.id);
            return (
              <div
                key={t.id}
                className="bg-felt-panel border border-felt-cream/10 rounded-lg p-4 flex flex-col"
              >
                <div className="font-display text-base mb-1">{t.name}</div>
                <div className="text-xs text-felt-cream/40 mb-2">
                  {t.scheduled_at
                    ? new Date(t.scheduled_at).toLocaleString("fr-FR")
                    : new Date(t.created_at).toLocaleDateString("fr-FR")}
                </div>
                <span className={`self-start text-[11px] px-2 py-0.5 rounded-full mb-3 ${badge.cls}`}>
                  {badge.label}
                </span>
                <div className="flex items-center gap-1 text-sm text-felt-cream/60 mb-3">
                  <span>👥</span>
                  <span>{counts[t.id] || 0}</span>
                </div>
                {t.championships?.name && (
                  <div className="text-[11px] px-2 py-1 rounded bg-felt-bg text-felt-cream/50 mb-3 w-fit">
                    {t.championships.name}
                    {t.stage_label ? ` — ${t.stage_label}` : ""}
                  </div>
                )}
                <div className="mt-auto flex items-center gap-2">
                  <button
                    onClick={() => onOpen(t.id)}
                    className="text-sm px-3 py-1.5 rounded-md font-display text-felt-cream/70 border border-felt-cream/10 hover:text-felt-cream"
                  >
                    Ouvrir
                  </button>
                  {t.registration_open && (
                    <button
                      disabled={busyId === t.id}
                      onClick={() => handleToggleRegister(t)}
                      className={`text-sm px-3 py-1.5 rounded-md font-display ${
                        already
                          ? "bg-felt-bg text-felt-cream/50 border border-felt-cream/10"
                          : "bg-felt-gold text-felt-bg"
                      }`}
                    >
                      {already ? "Désinscription" : "S'inscrire"}
                    </button>
                  )}
                  {manage && (
                    <button
                      onClick={() => handleDelete(t)}
                      className="ml-auto text-xs text-felt-alert/60 hover:text-felt-alert"
                    >
                      🗑
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        );
      })()}
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
