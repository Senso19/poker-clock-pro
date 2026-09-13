import { useEffect, useMemo, useState } from "react";
import {
  fetchChampionships,
  createChampionship,
  deleteChampionship,
  fetchChampionshipStandings,
  evaluateFormula,
  DEFAULT_FORMULA,
} from "../lib/points.js";
import { useAccount } from "../context/AccountContext.jsx";
import { canManageTournaments } from "../lib/auth.js";

const VARIABLES = [
  ["p", "nombre de joueurs"],
  ["f", "place finale"],
  ["b", "buy-in"],
  ["c", "coût total (buy-in + recaves + addon)"],
  ["k", "knockouts"],
  ["z", "dotation"],
  ["n", "nombre d'entrées (avec réentrées si activé)"],
  ["x", "balles utilisées (1 + recaves)"],
  ["w", "gains"],
  ["m", "places payées"],
  ["r", "nombre de recaves"],
  ["a", "nombre d'addons"],
  ["t", "type de tournoi (toujours 1 ici)"],
  ["d", "tours depuis la table finale (toujours 1 ici)"],
];

const AVATAR_COLORS = ["#C9A15A", "#8C3A3A", "#3A6B8C", "#3A8C5E", "#8C5A3A", "#6B3A8C"];
function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function initials(name) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
function MiniAvatar({ name, size = 36 }) {
  return (
    <div
      style={{ width: size, height: size, backgroundColor: avatarColor(name) }}
      className="rounded-full flex items-center justify-center text-felt-cream font-display text-xs shrink-0"
    >
      {initials(name)}
    </div>
  );
}
function formatShortDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * ChampionshipView — création de championnats avec formule libre (façon BlindValet),
 * bandeaux "Actif"/"Terminé" avec joueur en tête ou podium, classement général.
 */
export default function ChampionshipView() {
  const { account } = useAccount();
  const manage = canManageTournaments(account.role);
  const [summaries, setSummaries] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const list = await fetchChampionships();
      if (list.length === 0) {
        setSummaries([]);
        if (manage) setShowCreate(true);
      } else {
        const results = await Promise.all(list.map((c) => fetchChampionshipStandings(c.id).catch(() => null)));
        setSummaries(results.filter(Boolean));
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handleCreate(form) {
    setCreating(true);
    try {
      const champ = await createChampionship(form);
      setShowCreate(false);
      await load();
      setSelectedId(champ.id);
    } catch (e) {
      setError(e.message);
    }
    setCreating(false);
  }

  async function handleDelete(id) {
    if (!confirm("Supprimer ce championnat ? Les tournois qui y sont rattachés seront simplement détachés (pas supprimés).")) return;
    try {
      await deleteChampionship(id);
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) {
    return <div className="p-6 text-felt-cream/60 font-body">Chargement…</div>;
  }

  if (summaries.length === 0 && !manage) {
    return <div className="p-6 text-felt-cream/50 font-body text-sm">Aucun championnat pour le moment.</div>;
  }

  if (showCreate) {
    return (
      <div className="h-full overflow-y-auto">
        <ChampionshipEditor
          onCancel={summaries.length > 0 ? () => setShowCreate(false) : null}
          onCreate={handleCreate}
          loading={creating}
        />
      </div>
    );
  }

  const active = summaries.filter((s) => s.isActive || s.stageCount === 0);
  const finished = summaries.filter((s) => !s.isActive && s.stageCount > 0);
  const selected = summaries.find((s) => s.championship.id === selectedId);

  function toggleSelect(id) {
    setSelectedId(selectedId === id ? null : id);
  }

  return (
    <div className="p-4 sm:p-6 font-body text-white h-full overflow-y-auto">
      <div className="flex items-baseline justify-between mb-6">
        <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40">Championnats</div>
        {manage && (
          <button
            onClick={() => setShowCreate(true)}
            className="px-4 py-2.5 bg-felt-gold text-felt-bg rounded-lg text-sm font-display hover:bg-felt-gold/90"
          >
            + Nouveau championnat
          </button>
        )}
      </div>

      {error && <div className="text-felt-alert text-sm mb-3">Erreur : {error}</div>}

      {active.length > 0 && (
        <div className="mb-8">
          <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40 mb-3">Actif</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {active.map((s) => (
              <ActiveChampionshipCard
                key={s.championship.id}
                s={s}
                selected={selectedId === s.championship.id}
                onClick={() => toggleSelect(s.championship.id)}
              />
            ))}
          </div>
        </div>
      )}

      {finished.length > 0 && (
        <div className="mb-8">
          <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40 mb-3">Terminé</div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {finished.map((s) => (
              <FinishedChampionshipCard
                key={s.championship.id}
                s={s}
                selected={selectedId === s.championship.id}
                onClick={() => toggleSelect(s.championship.id)}
              />
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div className="bg-felt-panel border border-felt-cream/10 rounded-xl p-5">
          <div className="flex items-start justify-between mb-1">
            <div className="font-display text-lg text-felt-gold">{selected.championship.name}</div>
            {manage && (
              <button
                onClick={() => handleDelete(selected.championship.id)}
                className="text-xs px-2 py-1 text-felt-alert/70 hover:text-felt-alert"
              >
                🗑 Supprimer
              </button>
            )}
          </div>
          <div className="text-xs text-felt-cream/40 mb-4 font-mono">
            {selected.championship.formula_text}
            {selected.championship.best_stages_count
              ? ` — ${selected.championship.best_stages_count} meilleures étapes`
              : " — toutes les étapes comptent"}
          </div>
          {selected.standings.length === 0 ? (
            <div className="text-sm text-felt-cream/50">Aucune étape terminée pour l'instant.</div>
          ) : (
            <div className="space-y-1 text-sm">
              {selected.standings.map((s, i) => (
                <div key={s.playerId} className="flex justify-between border-b border-felt-cream/5 py-1.5">
                  <span>
                    {i + 1}. {s.name}{" "}
                    <span className="text-felt-cream/30 text-xs">
                      ({s.stagePoints.length} étape{s.stagePoints.length > 1 ? "s" : ""})
                    </span>
                  </span>
                  <span className="text-felt-gold font-medium">{s.totalPoints} pts</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ActiveChampionshipCard({ s, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl p-3 border transition-colors ${
        selected ? "bg-felt-gold/10 border-felt-gold" : "bg-felt-panel border-felt-cream/10 hover:border-felt-cream/30"
      }`}
    >
      <div className="font-display text-base text-white mb-2 truncate">{s.championship.name}</div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[11px] px-2 py-1 rounded bg-felt-bg text-felt-cream/50">{s.playerCount} joueurs</span>
        <span className="text-[11px] px-2 py-1 rounded bg-felt-bg text-felt-cream/50">{s.stageCount} tournois</span>
      </div>
      {s.leader ? (
        <div className="flex items-center gap-3 bg-felt-bg rounded-lg px-3 py-2 mb-3">
          <MiniAvatar name={s.leader.name} />
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-felt-cream/40 uppercase tracking-wide">Joueur en tête</div>
            <div className="text-sm text-white truncate">{s.leader.name}</div>
          </div>
          <div className="text-felt-gold font-display text-lg">{s.leader.totalPoints}</div>
        </div>
      ) : (
        <div className="text-xs text-felt-cream/40 mb-3">Aucun résultat pour l'instant.</div>
      )}
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        <div>
          <div className="text-felt-cream/30 uppercase tracking-wide mb-0.5">Précédent</div>
          <div className="text-felt-cream/60 truncate">
            {s.previousStage ? s.previousStage.stage_label || s.previousStage.name : "—"}
          </div>
        </div>
        <div>
          <div className="text-felt-cream/30 uppercase tracking-wide mb-0.5">À venir</div>
          <div className="text-felt-cream/60 truncate">{s.nextStage ? s.nextStage.stage_label || s.nextStage.name : "—"}</div>
        </div>
      </div>
    </button>
  );
}

function FinishedChampionshipCard({ s, selected, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl p-3 border transition-colors ${
        selected ? "bg-felt-gold/10 border-felt-gold" : "bg-felt-panel border-felt-cream/10 hover:border-felt-cream/30"
      }`}
    >
      <div className="font-display text-base text-white mb-2 truncate">{s.championship.name}</div>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[11px] px-2 py-1 rounded bg-felt-bg text-felt-cream/50">{s.playerCount} joueurs</span>
        <span className="text-[11px] px-2 py-1 rounded bg-felt-bg text-felt-cream/50">{s.stageCount} tournois</span>
      </div>
      <div className="space-y-1.5 mb-3">
        {s.top3.length === 0 && <div className="text-xs text-felt-cream/40">Aucun résultat.</div>}
        {s.top3.map((p, i) => (
          <div key={p.playerId} className="flex items-center gap-2">
            <span className="w-4 text-center text-xs text-felt-cream/40">{i === 0 ? "🏆" : i + 1}</span>
            <MiniAvatar name={p.name} size={28} />
            <div className="min-w-0 flex-1">
              <div className="text-sm text-white truncate">{p.name}</div>
              {i === 0 && <div className="text-[10px] text-felt-gold uppercase tracking-wide">Champion</div>}
            </div>
            <div className="text-felt-gold text-sm font-display">{p.totalPoints}</div>
          </div>
        ))}
      </div>
      {s.dateRange && (
        <div className="text-[11px] text-felt-cream/40">
          {formatShortDate(s.dateRange.start)} – {formatShortDate(s.dateRange.end)}
        </div>
      )}
    </button>
  );
}

function ChampionshipEditor({ onCreate, onCancel, loading }) {
  const [name, setName] = useState("");
  const [formulaText, setFormulaText] = useState(DEFAULT_FORMULA);
  const [bestStages, setBestStages] = useState("");
  const [countRebuys, setCountRebuys] = useState(false);
  const [previewPlayers, setPreviewPlayers] = useState(20);

  const previewRows = useMemo(() => {
    const p = Math.max(1, Number(previewPlayers) || 1);
    const rows = [];
    for (let f = 1; f <= Math.min(p, 30); f++) {
      const points = evaluateFormula(formulaText, {
        p,
        f,
        b: 0,
        c: 0,
        k: 0,
        z: 0,
        n: p,
        x: 1,
        w: 0,
        m: 0,
        r: 0,
        a: 0,
        t: 1,
        d: 1,
      });
      rows.push({ place: f, points });
    }
    return rows;
  }, [formulaText, previewPlayers]);

  return (
    <div className="p-4 sm:p-6 font-body text-felt-cream grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div>
        <div className="font-display text-xl mb-4">
          {onCancel ? "Nouveau championnat" : "Créer ton premier championnat"}
        </div>

        <label className="block text-xs text-felt-cream/50 mb-1">Nom du championnat</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Championnat Hiver 2026"
          className="w-full mb-4 bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
        />

        <label className="block text-xs text-felt-cream/50 mb-1">Formule</label>
        <input
          value={formulaText}
          onChange={(e) => setFormulaText(e.target.value)}
          placeholder={DEFAULT_FORMULA}
          className="w-full mb-4 bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream font-mono text-sm"
        />

        <div className="bg-felt-panel border border-felt-cream/10 rounded-md p-3 mb-4 text-xs text-felt-cream/60 space-y-1">
          {VARIABLES.map(([v, desc]) => (
            <div key={v}>
              <span className="text-felt-gold font-mono">{v}</span> = {desc}
            </div>
          ))}
          <div className="text-felt-cream/40 pt-1">
            Fonctions : sqrt, log (= ln), log10, abs, pow, min, max, round, floor, ceil. Utilise ^ pour une puissance.
          </div>
        </div>

        <label className="block text-xs text-felt-cream/50 mb-1">
          Nombre de résultats à compter (vide = toutes les étapes)
        </label>
        <input
          type="number"
          value={bestStages}
          onChange={(e) => setBestStages(e.target.value)}
          placeholder="Toutes les étapes"
          className="w-full mb-4 bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
        />

        <label className="flex items-center gap-2 text-sm text-felt-cream/70 mb-6">
          <input
            type="checkbox"
            checked={countRebuys}
            onChange={(e) => setCountRebuys(e.target.checked)}
          />
          Compter les réentrées dans le classement (variable n inclut les recaves)
        </label>

        <div className="flex gap-2">
          {onCancel && (
            <button onClick={onCancel} className="px-4 py-2 text-felt-cream/60 hover:text-felt-cream">
              Fermer
            </button>
          )}
          <button
            disabled={!name.trim() || loading}
            onClick={() =>
              onCreate({
                name: name.trim(),
                formulaText: formulaText.trim() || DEFAULT_FORMULA,
                bestStagesCount: bestStages ? Number(bestStages) : null,
                countRebuysInRanking: countRebuys,
              })
            }
            className="px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
          >
            {loading ? "Création…" : "Confirmer"}
          </button>
        </div>
      </div>

      <div>
        <div className="font-display text-lg mb-3">Exemple de tournoi</div>
        <label className="block text-xs text-felt-cream/50 mb-1">Joueurs</label>
        <input
          type="number"
          value={previewPlayers}
          onChange={(e) => setPreviewPlayers(e.target.value)}
          className="w-full mb-4 bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream"
        />
        <div className="bg-felt-panel border border-felt-cream/10 rounded-md overflow-hidden">
          <div className="grid grid-cols-2 text-xs uppercase tracking-wide text-felt-cream/40 px-4 py-2 border-b border-felt-cream/10">
            <div>Place</div>
            <div>Points</div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {previewRows.map((r) => (
              <div
                key={r.place}
                className="grid grid-cols-2 px-4 py-2 border-b border-felt-cream/5 text-sm"
              >
                <div className="text-felt-cream/70">{r.place}</div>
                <div className="text-felt-gold">{r.points}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
