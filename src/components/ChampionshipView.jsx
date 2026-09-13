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

/**
 * ChampionshipView — création de championnats avec formule libre (façon BlindValet),
 * aperçu en direct, classement général, suppression.
 */
export default function ChampionshipView() {
  const { account } = useAccount();
  const manage = canManageTournaments(account.role);
  const [championships, setChampionships] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [standings, setStandings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (selectedId) loadStandings(selectedId);
    else setStandings(null);
  }, [selectedId]);

  async function load() {
    setLoading(true);
    try {
      const list = await fetchChampionships();
      setChampionships(list);
      if (list.length > 0 && !selectedId) setSelectedId(list[0].id);
      if (list.length === 0 && manage) setShowCreate(true);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function loadStandings(id) {
    try {
      const result = await fetchChampionshipStandings(id);
      setStandings(result);
    } catch (e) {
      setError(e.message);
    }
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

  if (championships.length === 0 && !manage) {
    return <div className="p-6 text-felt-cream/50 font-body text-sm">Aucun championnat pour le moment.</div>;
  }

  if (showCreate) {
    return (
      <div className="h-full overflow-y-auto">
        <ChampionshipEditor
          onCancel={championships.length > 0 ? () => setShowCreate(false) : null}
          onCreate={handleCreate}
          loading={creating}
        />
      </div>
    );
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {championships.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedId(c.id)}
            className={`text-left rounded-xl p-4 border transition-colors ${
              selectedId === c.id
                ? "bg-felt-gold/10 border-felt-gold"
                : "bg-felt-panel border-felt-cream/10 hover:border-felt-cream/30"
            }`}
          >
            <div className={`font-display text-base mb-2 ${selectedId === c.id ? "text-felt-gold" : "text-white"}`}>
              {c.name}
            </div>
            <div className="text-xs text-felt-cream/40 font-mono truncate">{c.formula_text}</div>
            <div className="inline-block text-[11px] px-2 py-1 rounded bg-felt-gold/10 text-felt-gold mt-2">
              {c.best_stages_count ? `${c.best_stages_count} meilleures étapes` : "Toutes les étapes comptent"}
            </div>
          </button>
        ))}
      </div>

      {standings && (
        <div className="bg-felt-panel border border-felt-cream/10 rounded-xl p-4">
          <div className="flex items-start justify-between mb-1">
            <div className="font-display text-lg text-felt-gold">{standings.championship.name}</div>
            {manage && (
              <button
                onClick={() => handleDelete(standings.championship.id)}
                className="text-xs px-2 py-1 text-felt-alert/70 hover:text-felt-alert"
              >
                🗑 Supprimer
              </button>
            )}
          </div>
          <div className="text-xs text-felt-cream/40 mb-4 font-mono">
            {standings.championship.formula_text}
            {standings.championship.best_stages_count
              ? ` — ${standings.championship.best_stages_count} meilleures étapes`
              : " — toutes les étapes comptent"}
          </div>
          {standings.standings.length === 0 ? (
            <div className="text-sm text-felt-cream/50">Aucune étape terminée pour l'instant.</div>
          ) : (
            <div className="space-y-1 text-sm">
              {standings.standings.map((s, i) => (
                <div key={s.playerId} className="flex justify-between border-b border-felt-cream/5 py-1">
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
