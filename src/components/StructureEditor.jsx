import { useEffect, useState } from "react";
import { useTheme } from "../context/ThemeContext.jsx";
import CustomizablePanel from "./CustomizablePanel.jsx";
import { useConfirm } from "../context/ConfirmContext.jsx";
import {
  fetchActiveTournament,
  fetchLevels,
  saveLevels,
  defaultStructure,
  fetchStructureTemplates,
  saveStructureTemplate,
  updateStructureTemplate,
  deleteStructureTemplate,
  fetchStructureConfig,
  saveStructureConfig,
  defaultStructureConfig,
  recomputeAutoFields,
  generateBlindLevels,
} from "../lib/levels.js";

/**
 * StructureEditor — façon BlindValet : colonne de gauche "Paramètres"
 * (joueurs anticipés, durée prévue, type de tournoi, antes...) qui pilote
 * les champs calculables (icône 🧮 = calculé automatiquement, icône ✎ =
 * saisie manuelle), colonne de droite le tableau de la structure de blinds
 * avec Ajouter pause / Enregistrer comme modèle / Charger modèle / Générer.
 *
 * mode="tournament" (défaut) : édite la structure + les paramètres du
 * tournoi actif. mode="template" : édite un modèle réutilisable directement.
 */
export default function StructureEditor({ onSaved, mode = "tournament", template = null }) {
  const confirmAction = useConfirm();
  const { theme } = useTheme();
  const [tournament, setTournament] = useState(null);
  const [levels, setLevels] = useState(mode === "template" ? template?.levels || [] : []);
  const [config, setConfig] = useState(mode === "template" ? template?.structure_config || defaultStructureConfig() : defaultStructureConfig());
  const [name, setName] = useState(mode === "template" ? template?.name || "" : "");
  const [loading, setLoading] = useState(mode === "tournament");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [savedAt, setSavedAt] = useState(null);
  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [insertModalType, setInsertModalType] = useState(null); // null | "level" | "break"

  useEffect(() => {
    if (mode === "tournament") {
      load();
    }
    fetchStructureTemplates().then(setTemplates).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      const t = await fetchActiveTournament();
      setTournament(t);
      if (t) {
        const existing = await fetchLevels(t.id);
        setLevels(existing.length > 0 ? existing : defaultStructure());
        const cfg = await fetchStructureConfig(t.id);
        setConfig(cfg || defaultStructureConfig());
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  function updateDriver(patch) {
    setConfig((prev) => recomputeAutoFields({ ...prev, ...patch }));
  }

  function setFieldMode(fieldKey, fieldMode) {
    setConfig((prev) => {
      const next = { ...prev, fields: { ...prev.fields, [fieldKey]: { ...prev.fields[fieldKey] } } };
      if (fieldMode === "auto") {
        next.fields[fieldKey] = { mode: "auto", value: 0 };
        return recomputeAutoFields(next);
      }
      next.fields[fieldKey] = { mode: "manual", value: prev.fields[fieldKey]?.value ?? 0 };
      return next;
    });
  }

  function setFieldValue(fieldKey, value) {
    setConfig((prev) => ({
      ...prev,
      fields: { ...prev.fields, [fieldKey]: { mode: "manual", value } },
    }));
  }

  function handleGenerate() {
    setConfig((prev) => {
      const recomputed = recomputeAutoFields(prev);
      setLevels(generateBlindLevels(recomputed));
      return recomputed;
    });
  }

  function updateLevel(index, field, value) {
    setLevels((prev) =>
      prev.map((l, i) => (i === index ? { ...l, [field]: value, isNew: false } : l))
    );
  }

  function addLevel(afterIndex = null) {
    setLevels((prev) => {
      const newLevel = { smallBlind: 0, bigBlind: 0, ante: 0, durationMinutes: 0, isNew: true };
      if (afterIndex == null) return [...prev, newLevel];
      const next = [...prev];
      next.splice(afterIndex + 1, 0, newLevel);
      return next;
    });
  }

  // "Ajouter un niveau" : ajoute directement en bas de la structure, avec
  // SB/BB doublés par rapport au dernier niveau de blinds (pas de fenêtre,
  // pas de surbrillance — c'est le cas d'usage le plus courant).
  function appendLevelAtEnd() {
    setLevels((prev) => {
      const lastBlind = [...prev].reverse().find((l) => !l.isBreak);
      const sb = lastBlind ? (Number(lastBlind.smallBlind) || 0) * 2 : 25;
      const bb = lastBlind ? (Number(lastBlind.bigBlind) || 0) * 2 : 50;
      const ante = config.antesEnabled ? (config.anteType === "sb" ? sb : bb) : 0;
      return [...prev, { smallBlind: sb, bigBlind: bb, ante, durationMinutes: lastBlind?.durationMinutes || 20 }];
    });
  }

  function addBreak(afterIndex = null) {
    const newBreak = { isBreak: true, breakLabel: "Pause", durationMinutes: 0, isNew: true };
    setLevels((prev) => {
      if (afterIndex == null) return [...prev, newBreak];
      const next = [...prev];
      next.splice(afterIndex + 1, 0, newBreak);
      return next;
    });
  }

  function removeLevel(index) {
    setLevels((prev) => prev.filter((_, i) => i !== index));
  }

  function moveLevel(index, direction) {
    setLevels((prev) => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  async function handleSave() {
    setError(null);
    const cleanLevels = levels.map(({ isNew, ...l }) => l);
    if (mode === "template") {
      if (!name.trim()) {
        setError("Merci de donner un nom au modèle.");
        return;
      }
      setSaving(true);
      try {
        if (template) await updateStructureTemplate(template.id, name.trim(), cleanLevels, config);
        else await saveStructureTemplate(name.trim(), cleanLevels, config);
        onSaved?.();
      } catch (e) {
        setError(e.message);
      }
      setSaving(false);
      return;
    }
    if (!tournament) return;
    setSaving(true);
    try {
      await saveLevels(tournament.id, cleanLevels);
      await saveStructureConfig(tournament.id, config);
      setSavedAt(new Date());
      onSaved?.();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  async function handleSaveAsTemplate() {
    const templateName = prompt("Nom du modèle (ex : Turbo, Deepstack, Standard...)");
    if (!templateName?.trim()) return;
    try {
      const t = await saveStructureTemplate(templateName.trim(), levels.map(({ isNew, ...l }) => l), config);
      setTemplates((prev) => [t, ...prev]);
    } catch (e) {
      setError(e.message);
    }
  }

  function handleLoadTemplate(t) {
    setLevels(t.levels);
    setConfig(t.structure_config || defaultStructureConfig());
    setShowTemplates(false);
  }

  async function handleDeleteTemplate(id, e) {
    e.stopPropagation();
    if (!(await confirmAction("Supprimer ce modèle ?"))) return;
    try {
      await deleteStructureTemplate(id);
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    } catch (e2) {
      setError(e2.message);
    }
  }

  if (mode === "tournament" && loading) {
    return <div className="p-6 text-felt-cream/60 font-body">Chargement…</div>;
  }
  if (mode === "tournament" && !tournament) {
    return (
      <div className="p-6 text-felt-cream/60 font-body">
        Aucun tournoi actif. Crée-en un depuis l'onglet Tournois avant de définir sa structure.
      </div>
    );
  }

  let cumulative = 0;

  return (
    <div className="p-4 sm:p-6 font-body text-felt-cream h-full overflow-y-auto">
      <div className="max-w-[92rem] mx-auto">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-5">
          {mode === "template" ? (
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nom du modèle (ex : Turbo, Deepstack, Standard...)"
              className="font-display text-xl bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-1.5 text-felt-cream placeholder:text-felt-cream/30 w-96 max-w-full"
            />
          ) : (
            <div>
              <div className="font-display text-2xl">Structure des blinds</div>
              <div className="text-sm text-felt-cream/50 mt-0.5">Paramètres</div>
            </div>
          )}
          <div className="flex items-center gap-3">
            {savedAt && <span className="text-felt-cream/40 text-xs">Sauvegardé à {savedAt.toLocaleTimeString()}</span>}
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display text-sm disabled:opacity-40"
            >
              {saving ? "Sauvegarde…" : "💾 Sauvegarder"}
            </button>
          </div>
        </div>

        {error && <div className="text-felt-alert text-sm mb-3">Erreur : {error}</div>}

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Colonne gauche — Paramètres */}
          <CustomizablePanel
            panelKey="structure-params"
            defaultOrder={0}
            className="bg-felt-panel border border-felt-cream/10 rounded-lg p-7 space-y-5"
          >
            <DriverField label="Joueurs Anticipés">
              <input
                type="number"
                value={config.expectedPlayers}
                onChange={(e) => updateDriver({ expectedPlayers: Number(e.target.value) || 0 })}
                className="flex-1 bg-felt-bg border border-felt-cream/10 rounded-md px-4 py-2.5 text-base text-felt-cream"
              />
            </DriverField>
            <DriverField label="Durée prévue(h)">
              <input
                type="number"
                value={config.durationHours}
                onChange={(e) => updateDriver({ durationHours: Number(e.target.value) || 0 })}
                className="flex-1 bg-felt-bg border border-felt-cream/10 rounded-md px-4 py-2.5 text-base text-felt-cream"
              />
            </DriverField>
            <DriverField label="Type de tournoi">
              <select
                value={config.tournamentType}
                onChange={(e) => updateDriver({ tournamentType: e.target.value })}
                className="flex-1 bg-felt-bg border border-felt-cream/10 rounded-md px-4 py-2.5 text-base text-felt-cream"
              >
                <option value="freezeout">Freezeout</option>
                <option value="rebuy">Rebuy + Addon</option>
              </select>
            </DriverField>
            <DriverField label="Antes">
              <input
                type="checkbox"
                checked={config.antesEnabled}
                onChange={(e) => updateDriver({ antesEnabled: e.target.checked })}
              />
            </DriverField>
            {config.antesEnabled && (
              <DriverField label="Type d'ante">
                <select
                  value={config.anteType}
                  onChange={(e) => updateDriver({ anteType: e.target.value })}
                  className="flex-1 bg-felt-bg border border-felt-cream/10 rounded-md px-4 py-2.5 text-base text-felt-cream"
                >
                  <option value="bb">Ante de la grosse blind</option>
                  <option value="sb">Ante de la petite blind</option>
                </select>
              </DriverField>
            )}
            <DriverField label="Moitié ante si <6 joueurs">
              <input
                type="checkbox"
                checked={config.halfAnteIfFewPlayers}
                onChange={(e) => updateDriver({ halfAnteIfFewPlayers: e.target.checked })}
              />
            </DriverField>
            <DriverField label="Maintenir des antes en tête-à-tête">
              <input
                type="checkbox"
                checked={config.keepAntesHeadsUp}
                onChange={(e) => updateDriver({ keepAntesHeadsUp: e.target.checked })}
              />
            </DriverField>

            <div className="border-t border-felt-cream/10 my-1" />

            <AutoField label="Petite blind initiale" fieldKey="startingSmallBlind" config={config} setFieldMode={setFieldMode} setFieldValue={setFieldValue} />
            <AutoField label="Tapis de départ" fieldKey="startingStack" config={config} setFieldMode={setFieldMode} setFieldValue={setFieldValue} />
            <AutoField label="Temps par niveau (min)" fieldKey="minutesPerLevel" config={config} setFieldMode={setFieldMode} setFieldValue={setFieldValue} />
            <AutoField label="Réinscriptions Anticipées" fieldKey="expectedReentries" config={config} setFieldMode={setFieldMode} setFieldValue={setFieldValue} />
            <AutoField label="Jetons de réentrée" fieldKey="reentryChips" config={config} setFieldMode={setFieldMode} setFieldValue={setFieldValue} />
            <AutoField label="Recaves Anticipées" fieldKey="expectedRebuys" config={config} setFieldMode={setFieldMode} setFieldValue={setFieldValue} />
            <AutoField label="Jetons de recave" fieldKey="rebuyChips" config={config} setFieldMode={setFieldMode} setFieldValue={setFieldValue} />
            <AutoField label="Addons Anticipés" fieldKey="expectedAddons" config={config} setFieldMode={setFieldMode} setFieldValue={setFieldValue} />
            <AutoField label="Jetons d'addon" fieldKey="addonChips" config={config} setFieldMode={setFieldMode} setFieldValue={setFieldValue} />
          </CustomizablePanel>

          {/* Colonne droite — Structure */}
          <CustomizablePanel panelKey="structure-table" defaultOrder={1} className="bg-felt-panel border border-felt-cream/10 rounded-lg p-7">
            <div className="flex flex-wrap items-center justify-end gap-2 mb-6">
              <button onClick={() => setInsertModalType("level")} className="text-xs px-3 py-1.5 bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display">
                Insérer un niveau
              </button>
              <button onClick={() => setInsertModalType("break")} className="text-xs px-3 py-1.5 bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display">
                Insérer une pause
              </button>
              <button onClick={handleSaveAsTemplate} className="text-xs px-3 py-1.5 bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display">
                Enregistrer comme modèle
              </button>
              <div className="relative">
                <button onClick={() => setShowTemplates((v) => !v)} className="text-xs px-3 py-1.5 bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display">
                  Charger modèle
                </button>
                {showTemplates && (
                  <div className="absolute right-0 top-9 z-20 bg-felt-bg border border-felt-gold/40 rounded-md p-2 w-56 text-xs text-felt-cream shadow-lg max-h-72 overflow-y-auto">
                    {templates.length === 0 ? (
                      <div className="text-felt-cream/40 px-2 py-1">Aucun modèle enregistré.</div>
                    ) : (
                      templates.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => handleLoadTemplate(t)}
                          className="w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded hover:bg-felt-panel text-felt-cream/80"
                        >
                          <span className="truncate">{t.name}</span>
                          <span
                            onClick={(e) => handleDeleteTemplate(t.id, e)}
                            className="text-felt-alert/50 hover:text-felt-alert shrink-0"
                          >
                            🗑
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={handleGenerate}
                title="Générer la structure à partir des paramètres"
                className="text-xs px-3 py-1.5 bg-felt-gold/90 text-felt-bg rounded-md font-display"
              >
                🧮 Générer
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-base border-separate" style={{ borderSpacing: "0 6px" }}>
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-felt-cream/40">
                    <th className="text-left py-3 pl-4 pr-2 w-12 text-sm">#</th>
                    <th className="text-left py-3 pr-3 text-sm">Temps</th>
                    <th className="text-right py-3 pr-3 text-sm">SB</th>
                    <th className="text-right py-3 pr-3 text-sm">BB</th>
                    <th className="text-right py-3 pr-3 text-sm">Ante BB</th>
                    <th className="w-28"></th>
                  </tr>
                </thead>
                <tbody>
                  {levels.map((level, i) => {
                    const rowStart = cumulative;
                    cumulative += Number(level.durationMinutes) || 0;
                    const h = Math.floor(rowStart / 60);
                    const m = rowStart % 60;
                    const elapsed = `${h}:${String(m).padStart(2, "0")}`;
                    return (
                      <tr
                        key={i}
                        className={level.isNew ? "bg-felt-gold/20 ring-1 ring-inset ring-felt-gold/60" : level.isBreak ? "bg-felt-bg/40" : "bg-felt-bg/70"}
                      >
                        <td className="py-4 pl-4 pr-2 text-felt-gold/70 rounded-l-md text-lg font-display">{i + 1}</td>
                        {level.isBreak ? (
                          <>
                            <td className="py-4 pr-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={level.durationMinutes}
                                  onChange={(e) => updateLevel(i, "durationMinutes", e.target.value)}
                                  style={{ backgroundColor: "var(--pcp-cell-bg, #1B2027)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                                  className="w-16 border border-felt-cream/10 rounded px-2 py-1.5 text-sm"
                                />
                                <span className="text-felt-cream/30 text-sm">({elapsed})</span>
                              </div>
                            </td>
                            <td colSpan={3} className="py-4 pr-3">
                              <input
                                value={level.breakLabel || ""}
                                onChange={(e) => updateLevel(i, "breakLabel", e.target.value)}
                                placeholder="Libellé de la pause"
                                style={{ backgroundColor: "var(--pcp-cell-bg, #14181C)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                                className="w-full border border-felt-cream/10 rounded px-3 py-1.5 text-sm"
                              />
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="py-4 pr-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={level.durationMinutes}
                                  onChange={(e) => updateLevel(i, "durationMinutes", e.target.value)}
                                  style={{ backgroundColor: "var(--pcp-cell-bg, #1B2027)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                                  className="w-16 border border-felt-cream/10 rounded px-2 py-1.5 text-sm"
                                />
                                <span className="text-felt-cream/30 text-sm">({elapsed})</span>
                              </div>
                            </td>
                            <td className="py-4 pr-3 text-right">
                              <input
                                type="number"
                                value={level.smallBlind}
                                onChange={(e) => updateLevel(i, "smallBlind", e.target.value)}
                                style={{ backgroundColor: "var(--pcp-cell-bg, #14181C)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                                className="w-24 border border-felt-cream/10 rounded px-2 py-1.5 text-sm text-right font-medium"
                              />
                            </td>
                            <td className="py-4 pr-3 text-right">
                              <input
                                type="number"
                                value={level.bigBlind}
                                onChange={(e) => updateLevel(i, "bigBlind", e.target.value)}
                                style={{ backgroundColor: "var(--pcp-cell-bg, #1B2027)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                                className="w-24 border border-felt-cream/10 rounded px-2 py-1.5 text-sm text-right font-medium"
                              />
                            </td>
                            <td className="py-4 pr-3 text-right">
                              <input
                                type="number"
                                value={level.ante}
                                onChange={(e) => updateLevel(i, "ante", e.target.value)}
                                style={{ backgroundColor: "var(--pcp-cell-bg, #1B2027)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                                className="w-24 border border-felt-cream/10 rounded px-2 py-1.5 text-sm text-right"
                              />
                            </td>
                          </>
                        )}
                        <td className="py-4 pl-2 pr-4 rounded-r-md">
                          <div className="flex gap-1.5 justify-end">
                            <IconButton onClick={() => moveLevel(i, -1)}>▲</IconButton>
                            <IconButton onClick={() => moveLevel(i, 1)}>▼</IconButton>
                            <IconButton alert onClick={() => removeLevel(i)}>✕</IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button
              onClick={appendLevelAtEnd}
              className="mt-4 px-3 py-2 bg-felt-bg border border-felt-cream/10 rounded-md text-sm font-display text-felt-cream/70 hover:text-felt-cream"
            >
              + Niveau
            </button>
          </CustomizablePanel>
        </div>
      </div>
      {insertModalType && (
        <InsertPositionModal
          type={insertModalType}
          levels={levels}
          onClose={() => setInsertModalType(null)}
          onConfirm={(afterIndex) => {
            if (insertModalType === "level") addLevel(afterIndex);
            else addBreak(afterIndex);
            setInsertModalType(null);
          }}
        />
      )}
    </div>
  );
}

function InsertPositionModal({ type, levels, onClose, onConfirm }) {
  const [afterIndex, setAfterIndex] = useState(levels.length - 1);
  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div onClick={(e) => e.stopPropagation()} className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm font-body text-felt-cream p-5">
        <div className="font-display text-base mb-1">
          Où insérer {type === "level" ? "ce niveau" : "cette pause"} ?
        </div>
        <div className="text-xs text-felt-cream/50 mb-3">Choisissez la position dans la structure existante.</div>
        <select
          value={afterIndex}
          onChange={(e) => setAfterIndex(Number(e.target.value))}
          className="w-full bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-sm mb-4"
        >
          <option value={-1}>Au début</option>
          {levels.map((l, i) => (
            <option key={i} value={i}>
              Après le niveau {i + 1} ({l.isBreak ? l.breakLabel || "Pause" : `${l.smallBlind}/${l.bigBlind}`})
            </option>
          ))}
        </select>
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-felt-cream/60 hover:text-felt-cream">
            Annuler
          </button>
          <button onClick={() => onConfirm(afterIndex)} className="px-4 py-1.5 text-sm bg-felt-gold text-felt-bg rounded-md font-display">
            Insérer
          </button>
        </div>
      </div>
    </div>
  );
}

function DriverField({ label, children }) {
  return (
    <div className="flex items-center gap-3">
      <label className="w-56 shrink-0 text-base text-felt-cream/70">{label}</label>
      {children}
    </div>
  );
}

function AutoField({ label, fieldKey, config, setFieldMode, setFieldValue }) {
  const field = config.fields[fieldKey] || { mode: "auto", value: 0 };
  const isAuto = field.mode !== "manual";
  return (
    <div className="flex items-center gap-3">
      <label className="w-56 shrink-0 text-base text-felt-cream/70">{label}</label>
      <input
        type="number"
        value={field.value}
        disabled={isAuto}
        onChange={(e) => setFieldValue(fieldKey, Number(e.target.value) || 0)}
        className="flex-1 bg-felt-bg border border-felt-cream/10 rounded-md px-4 py-2.5 text-base text-felt-cream disabled:opacity-60"
      />
      <button
        onClick={() => setFieldMode(fieldKey, "auto")}
        title="Calculer automatiquement"
        className={`w-9 h-9 shrink-0 rounded flex items-center justify-center text-sm ${
          isAuto ? "bg-felt-gold text-felt-bg" : "bg-felt-bg text-felt-cream/40 hover:text-felt-cream border border-felt-cream/10"
        }`}
      >
        🧮
      </button>
      <button
        onClick={() => setFieldMode(fieldKey, "manual")}
        title="Saisie manuelle"
        className={`w-9 h-9 shrink-0 rounded flex items-center justify-center text-sm ${
          !isAuto ? "bg-felt-gold text-felt-bg" : "bg-felt-bg text-felt-cream/40 hover:text-felt-cream border border-felt-cream/10"
        }`}
      >
        ✎
      </button>
    </div>
  );
}

function IconButton({ children, onClick, alert, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`w-8 h-8 rounded text-sm flex items-center justify-center ${
        alert
          ? "bg-felt-alert/20 text-felt-alert hover:bg-felt-alert/40"
          : "bg-felt-bg text-felt-cream/60 hover:text-felt-cream border border-felt-cream/10"
      }`}
    >
      {children}
    </button>
  );
}
