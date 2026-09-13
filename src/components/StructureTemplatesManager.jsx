import { useEffect, useState } from "react";
import { fetchStructureTemplates, deleteStructureTemplate, saveLevels, saveStructureConfig } from "../lib/levels.js";
import { fetchClockTemplates, deleteClockTemplate, applyClockTemplateToTournament } from "../lib/clockTemplates.js";
import { fetchAllTournaments } from "../lib/tournaments.js";
import StructureEditor from "./StructureEditor.jsx";
import ClockTemplateEditor from "./ClockTemplateEditor.jsx";
import CustomizablePanel from "./CustomizablePanel.jsx";

/**
 * StructureTemplatesManager — "Gérer les modèles" : point unique de
 * création/édition des modèles de structure de blinds ET des modèles de
 * disposition d'horloge, sans avoir besoin d'un tournoi actif.
 */
export default function StructureTemplatesManager() {
  const [structTemplates, setStructTemplates] = useState([]);
  const [clockTemplates, setClockTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingStruct, setEditingStruct] = useState(null); // null | {} (nouveau) | template
  const [editingClock, setEditingClock] = useState(null);
  const [applyingId, setApplyingId] = useState(null);
  const [appliedAt, setAppliedAt] = useState(null);
  const [applyingStructTemplate, setApplyingStructTemplate] = useState(null);
  const [applyingClockTemplate, setApplyingClockTemplate] = useState(null);
  const [tournaments, setTournaments] = useState([]);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([fetchStructureTemplates(), fetchClockTemplates()]);
      setStructTemplates(s);
      setClockTemplates(c);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function openApplyStructTemplate(template) {
    setApplyingStructTemplate(template);
    try {
      setTournaments(await fetchAllTournaments());
    } catch (e) {
      setError(e.message);
    }
  }

  async function applyStructureTemplateToTournament(tournamentId) {
    if (!applyingStructTemplate) return;
    setApplyingId(applyingStructTemplate.id);
    setError(null);
    try {
      await saveLevels(tournamentId, applyingStructTemplate.levels || []);
      await saveStructureConfig(tournamentId, applyingStructTemplate.structure_config || null);
      setAppliedAt(applyingStructTemplate.id);
      setTimeout(() => setAppliedAt(null), 2000);
    } catch (e) {
      setError(e.message);
    }
    setApplyingStructTemplate(null);
    setApplyingId(null);
  }

  async function handleDeleteStruct(id) {
    if (!confirm("Supprimer ce modèle de structure ?")) return;
    try {
      await deleteStructureTemplate(id);
      setStructTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleDeleteClock(id) {
    if (!confirm("Supprimer ce modèle d'horloge ?")) return;
    try {
      await deleteClockTemplate(id);
      setClockTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleApplyClock(template) {
    setApplyingClockTemplate(template);
    try {
      setTournaments(await fetchAllTournaments());
    } catch (e) {
      setError(e.message);
    }
  }

  async function applyClockTemplateToSelectedTournament(tournamentId) {
    if (!applyingClockTemplate) return;
    setApplyingId(applyingClockTemplate.id);
    setError(null);
    try {
      await applyClockTemplateToTournament(tournamentId, applyingClockTemplate.layout);
      setAppliedAt(applyingClockTemplate.id);
      setTimeout(() => setAppliedAt(null), 2000);
    } catch (e) {
      setError(e.message);
    }
    setApplyingClockTemplate(null);
    setApplyingId(null);
  }

  function totalDuration(levels) {
    const minutes = (levels || []).reduce((s, l) => s + (Number(l.durationMinutes) || 0), 0);
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, "0") : ""}` : `${m} min`;
  }

  function levelMinutes(levels) {
    const first = (levels || []).find((l) => !l.isBreak);
    return first?.durationMinutes || "—";
  }

  if (loading) {
    return <div className="p-6 text-felt-cream/60 font-body">Chargement…</div>;
  }

  if (editingStruct !== null) {
    return (
      <div className="h-full flex flex-col">
        <div className="flex items-center px-6 py-3 border-b border-felt-cream/10 shrink-0">
          <button
            onClick={() => setEditingStruct(null)}
            className="text-sm text-felt-cream/50 hover:text-felt-cream"
          >
            ← Retour aux modèles
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          <StructureEditor
            mode="template"
            template={editingStruct.id ? editingStruct : null}
            onSaved={() => {
              setEditingStruct(null);
              load();
            }}
          />
        </div>
      </div>
    );
  }

  if (editingClock !== null) {
    return (
      <ClockTemplateEditor
        template={editingClock.id ? editingClock : null}
        onClose={() => setEditingClock(null)}
        onSaved={() => {
          setEditingClock(null);
          load();
        }}
      />
    );
  }

  return (
    <div className="p-4 sm:p-6 font-body text-felt-cream h-full overflow-y-auto">
      <div className="font-display text-xl mb-2">Gérer les modèles</div>
      <div className="text-sm text-felt-cream/50 mb-6">
        Crée et gère ici tes modèles de structure de blinds et de disposition d'horloge, sans avoir besoin d'un tournoi en cours.
      </div>

      {error && <div className="text-felt-alert text-sm mb-3">Erreur : {error}</div>}

      <div className="flex items-baseline justify-between mb-3">
        <div className="font-display text-lg">Modèles de structure</div>
        <button
          onClick={() => setEditingStruct({})}
          className="px-3 py-1.5 bg-felt-gold text-felt-bg rounded-md text-sm font-display"
        >
          + Nouveau modèle
        </button>
      </div>

      {structTemplates.length === 0 ? (
        <div className="text-felt-cream/50 text-sm mb-8">Aucun modèle de structure enregistré pour le moment.</div>
      ) : (
        <CustomizablePanel
          panelKey="structure-templates-grid"
          defaultWidth="1 1 100%"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8"
        >
          {structTemplates.map((t) => (
            <div key={t.id} className="bg-felt-panel border border-felt-cream/10 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="font-display text-base">{t.name}</div>
                <button
                  onClick={() => handleDeleteStruct(t.id)}
                  className="text-xs text-felt-alert/60 hover:text-felt-alert"
                >
                  🗑
                </button>
              </div>
              <div className="space-y-2 text-sm mb-3">
                <Row label="Niveaux" value={(t.levels || []).length} />
                <Row label="Durée prévue" value={totalDuration(t.levels)} />
                <Row label="Temps par niveau (min)" value={levelMinutes(t.levels)} />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingStruct(t)}
                  className="flex-1 px-3 py-1.5 text-sm bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/80 hover:text-felt-cream font-display"
                >
                  Modifier
                </button>
                <button
                  onClick={() => openApplyStructTemplate(t)}
                  disabled={applyingId === t.id}
                  className="flex-1 px-3 py-1.5 text-sm bg-felt-bg border border-felt-gold/30 rounded-md text-felt-gold font-display disabled:opacity-40"
                >
                  {appliedAt === t.id ? "✓ Appliqué" : "▶ Appliquer"}
                </button>
              </div>
            </div>
          ))}
        </CustomizablePanel>
      )}

      <div className="flex items-baseline justify-between mb-3">
        <div className="font-display text-lg">Modèles d'horloge</div>
        <button
          onClick={() => setEditingClock({})}
          className="px-3 py-1.5 bg-felt-gold text-felt-bg rounded-md text-sm font-display"
        >
          + Nouveau modèle
        </button>
      </div>

      {clockTemplates.length === 0 ? (
        <div className="text-felt-cream/50 text-sm">Aucun modèle d'horloge enregistré pour le moment.</div>
      ) : (
        <CustomizablePanel
          panelKey="clock-templates-grid"
          defaultWidth="1 1 100%"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
        >
          {clockTemplates.map((t) => (
            <div key={t.id} className="bg-felt-panel border border-felt-cream/10 rounded-lg p-4">
              <div className="flex items-start justify-between mb-3">
                <div className="font-display text-base">{t.name}</div>
                <button
                  onClick={() => handleDeleteClock(t.id)}
                  className="text-xs text-felt-alert/60 hover:text-felt-alert"
                >
                  🗑
                </button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setEditingClock(t)}
                  className="flex-1 px-3 py-1.5 text-sm bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/80 hover:text-felt-cream font-display"
                >
                  Modifier
                </button>
                <button
                  onClick={() => handleApplyClock(t)}
                  disabled={applyingId === t.id}
                  className="flex-1 px-3 py-1.5 text-sm bg-felt-bg border border-felt-gold/30 rounded-md text-felt-gold font-display disabled:opacity-40"
                >
                  {appliedAt === t.id ? "✓ Appliqué" : "▶ Appliquer"}
                </button>
              </div>
            </div>
          ))}
        </CustomizablePanel>
      )}

      {applyingStructTemplate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm p-6 font-body text-felt-cream">
            <div className="font-display text-lg mb-4">Appliquer « {applyingStructTemplate.name} » à…</div>
            {tournaments.length === 0 ? (
              <div className="text-sm text-felt-cream/50 mb-4">Aucun tournoi créé pour le moment.</div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto mb-4">
                {tournaments.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyStructureTemplateToTournament(t.id)}
                    className="w-full text-left px-3 py-2 bg-felt-bg border border-felt-cream/10 rounded-md text-sm text-felt-cream hover:border-felt-gold/40"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setApplyingStructTemplate(null)}
              className="w-full px-4 py-2 text-felt-cream/60 hover:text-felt-cream"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {applyingClockTemplate && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm p-6 font-body text-felt-cream">
            <div className="font-display text-lg mb-4">Appliquer « {applyingClockTemplate.name} » à…</div>
            {tournaments.length === 0 ? (
              <div className="text-sm text-felt-cream/50 mb-4">Aucun tournoi créé pour le moment.</div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto mb-4">
                {tournaments.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => applyClockTemplateToSelectedTournament(t.id)}
                    className="w-full text-left px-3 py-2 bg-felt-bg border border-felt-cream/10 rounded-md text-sm text-felt-cream hover:border-felt-gold/40"
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            )}
            <button
              onClick={() => setApplyingClockTemplate(null)}
              className="w-full px-4 py-2 text-felt-cream/60 hover:text-felt-cream"
            >
              Annuler
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between border-b border-felt-cream/5 pb-1.5">
      <span className="text-felt-cream/50">{label}</span>
      <span className="text-felt-gold font-medium">{value}</span>
    </div>
  );
}
