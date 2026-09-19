import { useEffect, useRef, useState } from "react";
import ClubLoader from "./ClubLoader.jsx";
import { supabase } from "../lib/supabase.js";
import { useTheme } from "../context/ThemeContext.jsx";
import { formatChips } from "../lib/format.js";
import CustomizablePanel from "./CustomizablePanel.jsx";
import EditableButton from "./EditableButton.jsx";
import { useConfirm } from "../context/ConfirmContext.jsx";
import { useIsMobile } from "../lib/useIsMobile.js";
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
  // Les champs de saisie gardent le nombre entier — on ne peut pas taper
  // "10K" dans un champ numérique — mais les colonnes calculées suivent le
  // réglage "Montants abrégés".
  const chips = (v) => formatChips(v, !!theme.compactChips);
  const isMobile = useIsMobile();
  const [mobileSubTab, setMobileSubTab] = useState("params"); // "params" | "table" — sous-onglets mobile uniquement
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
  // Empreinte de la structure telle qu'elle est en base, et état de
  // l'enregistrement automatique affiché à côté du bouton.
  const dernierEnregistreRef = useRef(null);
  const [autoEtat, setAutoEtat] = useState("idle"); // "idle" | "encours" | "ok" | "erreur"

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
        const niveaux = existing.length > 0 ? existing : defaultStructure();
        const cfg = await fetchStructureConfig(t.id);
        setLevels(niveaux);
        setConfig(cfg || defaultStructureConfig());
        // Empreinte de ce qui se trouve réellement en base : l'auto-
        // enregistrement s'y compare et ne réécrit rien tant que le
        // contenu est identique — à l'ouverture de l'écran, notamment.
        dernierEnregistreRef.current = JSON.stringify({ levels: niveaux, config: cfg || defaultStructureConfig() });
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  function updateDriver(patch) {
    setConfig((prev) => recomputeAutoFields({ ...prev, ...patch }));
  }

  /**
   * Cocher « Antes » remplit la colonne à partir des blindes, pour les
   * niveaux qui n'ont pas encore d'ante à eux. Tant que cette colonne se
   * calculait, la question ne se posait pas ; maintenant qu'elle se
   * saisit, une structure enregistrée sans antes afficherait une colonne
   * de zéros à remplir à la main, ligne par ligne.
   *
   * Les antes déjà saisis sont conservés : décocher puis recocher la case
   * ne doit pas effacer le travail.
   */
  function activerAntes(actif) {
    updateDriver({ antesEnabled: actif });
    if (!actif) return;
    setLevels((prev) =>
      prev.map((l) => {
        if (l.isBreak || Number(l.ante)) return l;
        const pilote = Number(config.anteType === "sb" ? l.smallBlind : l.bigBlind) || 0;
        return pilote ? { ...l, ante: pilote } : l;
      })
    );
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
      prev.map((l, i) => {
        if (i !== index) return l;
        const suivant = { ...l, [field]: value, isNew: false };
        // Saisir la small blind d'un niveau dont la big blind est encore
        // vierge la remplit au double : c'est la structure courante, et
        // c'est le geste qu'on fait juste après avoir ajouté ou inséré un
        // niveau. L'ante suit la BB tout seul quand il est activé (la
        // colonne Ante se calcule, elle ne se saisit pas).
        //
        // Une big blind déjà saisie n'est JAMAIS écrasée : un niveau
        // 400/500, voulu tel quel, le reste même si on retouche sa SB.
        if (field === "smallBlind" && !Number(l.bigBlind)) {
          const sb = Number(value);
          if (Number.isFinite(sb) && sb > 0) suivant.bigBlind = sb * 2;
        }
        // L'ante suit la blinde qui le pilote (réglage « Type d'ante »)
        // TANT QU'ON NE L'A PAS SAISI SOI-MÊME. On reconnaît une saisie
        // manuelle à ceci : la valeur ne correspond plus à celle de sa
        // blinde avant la frappe. Dans ce cas on n'y touche jamais —
        // c'est la même réserve que pour la big blind au-dessus.
        if (field !== "ante" && config.antesEnabled) {
          const pilote = config.anteType === "sb" ? "smallBlind" : "bigBlind";
          const avant = Number(l[pilote]) || 0;
          const apres = Number(suivant[pilote]) || 0;
          const ante = Number(l.ante) || 0;
          if (apres && (!ante || ante === avant)) suivant.ante = apres;
        }
        return suivant;
      })
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

  // Niveaux prêts pour la base : le drapeau isNew disparaît et l'ante est
  // recalculé quand il est dérivé des blindes.
  function niveauxNettoyes() {
    return levels.map(({ isNew, ...l }) => {
      if (l.isBreak) return l;
      // On enregistre l'ante TEL QU'IL EST AFFICHÉ : il est saisissable,
      // le recalculer ici jetterait la valeur voulue. Antes décochés, il
      // repart à zéro.
      const ante = config.antesEnabled ? Number(l.ante) || 0 : 0;
      return { ...l, ante };
    });
  }

  /**
   * Enregistrement automatique de la structure.
   *
   * Volontairement limité aux niveaux et aux réglages : handleSave fait
   * aussi applyManualStartingStack, qui REMPLACE le tapis de tous les
   * joueurs inscrits après confirmation. Déclencher ça tout seul pendant
   * qu'on tape effacerait les tapis réels d'un tournoi en cours — le
   * crédit des joueurs reste donc sur le bouton.
   *
   * Temporisé : saveLevels supprime toute la structure puis la réinsère.
   * Sauver à chaque frappe voudrait dire une dizaine de cycles
   * supprimer/réinsérer pour taper "30000".
   */
  useEffect(() => {
    if (mode !== "tournament" || !tournament) return undefined;

    const cleanLevels = niveauxNettoyes();
    const instantane = JSON.stringify({ levels: cleanLevels, config });
    // Rien n'a bougé par rapport à la base : ni au chargement de l'écran,
    // ni quand une valeur est retapée à l'identique.
    if (instantane === dernierEnregistreRef.current) return undefined;

    const t = setTimeout(async () => {
      setAutoEtat("encours");
      try {
        await saveLevels(tournament.id, cleanLevels);
        await saveStructureConfig(tournament.id, config);
        dernierEnregistreRef.current = instantane;
        setSavedAt(new Date());
        setAutoEtat("ok");
        onSaved?.();
      } catch (e) {
        setError(e.message);
        setAutoEtat("erreur");
      }
    }, 1200);

    // Chaque nouvelle frappe annule l'enregistrement en attente : on
    // n'écrit qu'une fois, quand la saisie s'arrête.
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levels, config, tournament, mode]);

  // Le tapis de départ saisi à la main n'est pas encore celui du tournoi :
  // il reste quelque chose à appliquer, et seul un clic peut le faire —
  // ça remplace le tapis des joueurs déjà inscrits.
  const tapisManuelAAppliquer =
    mode === "tournament" &&
    config.fields?.startingStack?.mode === "manual" &&
    Number(config.fields.startingStack.value) > 0 &&
    Number(config.fields.startingStack.value) !== tournament?.starting_stack;

  async function handleSave() {
    setError(null);
    const cleanLevels = niveauxNettoyes();
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
      dernierEnregistreRef.current = JSON.stringify({ levels: cleanLevels, config });
      await applyManualStartingStack();
      setSavedAt(new Date());
      onSaved?.();
    } catch (e) {
      setError(e.message);
    }
    setSaving(false);
  }

  // "Tapis de départ" saisi À LA MAIN : le montant devient celui du
  // tournoi, et les joueurs déjà inscrits en sont crédités. En mode
  // automatique la valeur est recalculée à partir des paramètres, la
  // pousser aux joueurs n'aurait pas de sens.
  //
  // tournament.starting_stack sert de mémoire de ce qui a déjà été
  // appliqué : sans cette comparaison, chaque enregistrement de la
  // structure redemanderait de remettre les tapis à zéro. Et comme
  // l'opération écrase des tapis en cours de jeu, elle est confirmée.
  async function applyManualStartingStack() {
    const field = config.fields?.startingStack;
    if (!tournament || field?.mode !== "manual") return;
    const value = Number(field.value) || 0;
    if (value <= 0 || value === tournament.starting_stack) return;

    const { data: regs } = await supabase
      .from("registrations")
      .select("id")
      .eq("tournament_id", tournament.id);
    const count = regs?.length || 0;

    if (count > 0) {
      const ok = await confirmAction(
        `Créditer les ${count} joueur${count > 1 ? "s" : ""} inscrit${count > 1 ? "s" : ""} de ${value.toLocaleString("fr-FR")} jetons ? Leur tapis actuel sera remplacé.`
      );
      if (ok) await supabase.from("registrations").update({ stack: value }).eq("tournament_id", tournament.id);
    }
    // Appliqué ou non aux joueurs déjà là, le tournoi retient le montant :
    // les inscriptions suivantes partiront avec ce tapis.
    await supabase.from("tournaments").update({ starting_stack: value }).eq("id", tournament.id);
    setTournament((t) => (t ? { ...t, starting_stack: value } : t));
  }

  async function handleSaveAsTemplate() {
    const templateName = prompt("Nom du modèle (ex : Turbo, Deepstack, Standard...)");
    if (!templateName?.trim()) return;
    try {
      const cleanLevels = levels.map(({ isNew, ...l }) => {
        if (l.isBreak) return l;
        const ante = config.antesEnabled ? Number(l.ante) || 0 : 0;
        return { ...l, ante };
      });
      const t = await saveStructureTemplate(templateName.trim(), cleanLevels, config);
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
    return <ClubLoader />;
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
            {/* La structure part toute seule ; ce témoin évite de se
                demander si c'est bien parti. */}
            <span className={`text-xs text-felt-cream/40 tabular-nums ${mode === "template" ? "hidden" : ""}`}>
              {autoEtat === "encours"
                ? "Enregistrement…"
                : autoEtat === "erreur"
                ? "Échec de l'enregistrement"
                : savedAt
                ? `Enregistré à ${savedAt.toLocaleTimeString()}`
                : "Enregistrement automatique"}
            </span>
            {/* En mode modèle il n'y a pas d'auto-enregistrement — un
                modèle a un nom et se crée explicitement. Sur un tournoi, le
                bouton ne sert plus qu'à ce qui ne peut pas être
                automatique : créditer les joueurs déjà inscrits du tapis de
                départ saisi à la main. */}
            {(mode === "template" || tapisManuelAAppliquer) && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display text-sm disabled:opacity-40"
              >
                {saving
                  ? mode === "template"
                    ? "Sauvegarde…"
                    : "Application…"
                  : mode === "template"
                  ? "💾 Sauvegarder"
                  : "Appliquer le tapis de départ"}
              </button>
            )}
          </div>
        </div>

        {error && <div className="text-felt-alert text-sm mb-3">Erreur : {error}</div>}

        {isMobile && (
          <div className="flex border-b border-felt-cream/10 mb-5 -mt-1">
            {[
              { key: "params", label: "Paramètres" },
              { key: "table", label: "Structure des blindes" },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setMobileSubTab(t.key)}
                className={`flex-1 py-2.5 text-sm font-display font-medium text-center border-b-2 -mb-px ${
                  mobileSubTab === t.key ? "border-felt-gold text-felt-gold" : "border-transparent text-felt-cream/50"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-8 items-start">
          {/* Colonne gauche — Paramètres */}
          <CustomizablePanel
            panelKey="structure-params"
            defaultOrder={0}
            className={`bg-felt-panel border border-felt-cream/10 rounded-lg p-7 space-y-5 ${
              isMobile && mobileSubTab !== "params" ? "hidden lg:block" : ""
            }`}
          >
            <DriverField label="Joueurs Anticipés">
              <input
                type="number"
                value={config.expectedPlayers}
                onChange={(e) => updateDriver({ expectedPlayers: Number(e.target.value) || 0 })}
                style={{ backgroundColor: "var(--pcp-cell-bg, #14181C)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                className="flex-1 border border-felt-cream/10 rounded-md px-4 py-2.5 text-base"
              />
            </DriverField>
            <DriverField label="Durée prévue(h)">
              <input
                type="number"
                value={config.durationHours}
                onChange={(e) => updateDriver({ durationHours: Number(e.target.value) || 0 })}
                style={{ backgroundColor: "var(--pcp-cell-bg, #14181C)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                className="flex-1 border border-felt-cream/10 rounded-md px-4 py-2.5 text-base"
              />
            </DriverField>
            <DriverField label="Type de tournoi">
              <select
                value={config.tournamentType}
                onChange={(e) => updateDriver({ tournamentType: e.target.value })}
                style={{ backgroundColor: "var(--pcp-cell-bg, #14181C)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                className="flex-1 border border-felt-cream/10 rounded-md px-4 py-2.5 text-base"
              >
                <option value="freezeout">Freezeout</option>
                <option value="rebuy">Rebuy + Addon</option>
              </select>
            </DriverField>
            <DriverField label="Antes">
              <input
                type="checkbox"
                checked={config.antesEnabled}
                onChange={(e) => activerAntes(e.target.checked)}
              />
            </DriverField>
            {config.antesEnabled && (
              <DriverField label="Type d'ante">
                <select
                  value={config.anteType}
                  onChange={(e) => updateDriver({ anteType: e.target.value })}
                  style={{ backgroundColor: "var(--pcp-cell-bg, #14181C)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                  className="flex-1 border border-felt-cream/10 rounded-md px-4 py-2.5 text-base"
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
          <CustomizablePanel
            panelKey="structure-table"
            defaultOrder={1}
            className={`bg-felt-panel border border-felt-cream/10 rounded-lg p-7 ${
              isMobile && mobileSubTab !== "table" ? "hidden lg:block" : ""
            }`}
          >
            <div className="flex flex-wrap items-center justify-end gap-2 mb-6">
              <EditableButton groupKey="structure-toolbar" id="insert-level" onClick={() => setInsertModalType("level")} className="pcp-btn text-xs px-3 py-1.5 bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display">
                Insérer un niveau
              </EditableButton>
              <EditableButton groupKey="structure-toolbar" id="insert-break" onClick={() => setInsertModalType("break")} className="pcp-btn text-xs px-3 py-1.5 bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display">
                Insérer une pause
              </EditableButton>
              <EditableButton groupKey="structure-toolbar" id="save-template" onClick={handleSaveAsTemplate} className="pcp-btn text-xs px-3 py-1.5 bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display">
                Enregistrer comme modèle
              </EditableButton>
              <div className="relative">
                <EditableButton groupKey="structure-toolbar" id="load-template" onClick={() => setShowTemplates((v) => !v)} className="pcp-btn text-xs px-3 py-1.5 bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-felt-cream font-display">
                  Charger modèle
                </EditableButton>
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
              <EditableButton
                groupKey="structure-toolbar"
                id="generate"
                onClick={handleGenerate}
                title="Générer la structure à partir des paramètres"
                className="pcp-btn text-xs px-3 py-1.5 bg-felt-gold/90 text-felt-bg rounded-md font-display"
              >
                🧮 Générer
              </EditableButton>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-base border-separate" style={{ borderSpacing: "0 var(--pcp-row-gap, 6px)" }}>
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-felt-cream/40">
                    <th className="text-left py-3 pl-4 pr-2 w-12 text-sm">#</th>
                    <th className="text-left py-3 pr-3 text-sm">Temps</th>
                    <th className="text-right py-3 pr-3 text-sm">SB</th>
                    <th className="text-right py-3 pr-3 text-sm">BB</th>
                    {config.antesEnabled && <th className="text-right py-3 pr-3 text-sm">Ante</th>}
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
                        // Repère lu par le 🎨 du panneau : c'est ce qui lui
                        // dit que "Hauteur des barres" et "Fond des barres"
                        // ont une prise ici, et qu'il peut les proposer.
                        data-pcp-barres=""
                        // La barre de la ligne suit "Fond des barres" du
                        // panneau (🎨). Un niveau tout juste ajouté garde
                        // sa surbrillance dorée, qui est temporaire.
                        style={
                          level.isNew
                            ? undefined
                            : {
                                backgroundColor: `var(--pcp-row-bg, rgba(20, 24, 28, ${level.isBreak ? 0.4 : 0.7}))`,
                                color: "var(--pcp-row-text, inherit)",
                              }
                        }
                        className={level.isNew ? "bg-felt-gold/20 ring-1 ring-inset ring-felt-gold/60" : ""}
                      >
                        <td style={{ paddingTop: "var(--pcp-row-pad, 16px)", paddingBottom: "var(--pcp-row-pad, 16px)" }} className="pl-4 pr-2 text-felt-gold/70 rounded-l-md text-lg font-display">{i + 1}</td>
                        {level.isBreak ? (
                          <>
                            <td style={{ paddingTop: "var(--pcp-row-pad, 16px)", paddingBottom: "var(--pcp-row-pad, 16px)" }} className="pr-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={level.durationMinutes}
                                  onChange={(e) => updateLevel(i, "durationMinutes", e.target.value)}
                                  style={{ backgroundColor: "var(--pcp-cell-bg, #1B2027)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                                  className="w-16 border border-felt-cream/10 rounded px-2 py-1.5 text-sm"
                                />
                                <span style={{ color: "var(--pcp-row-text, rgba(237, 234, 227, 0.3))" }} className="text-sm">
                                  ({elapsed})
                                </span>
                              </div>
                            </td>
                            {/* Autant de colonnes que la ligne d'un niveau en occupe à cet
                                endroit : SB et BB, plus l'ante quand il est
                                activé. C'était 3 en dur, donc une colonne de
                                trop sans les antes — la pause dépassait sur
                                la droite et ses boutons ne tombaient plus en
                                face de ceux des niveaux. */}
                            <td
                              colSpan={config.antesEnabled ? 3 : 2}
                              style={{ paddingTop: "var(--pcp-row-pad, 16px)", paddingBottom: "var(--pcp-row-pad, 16px)" }}
                              className="pr-3"
                            >
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
                            <td style={{ paddingTop: "var(--pcp-row-pad, 16px)", paddingBottom: "var(--pcp-row-pad, 16px)" }} className="pr-3">
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  value={level.durationMinutes}
                                  onChange={(e) => updateLevel(i, "durationMinutes", e.target.value)}
                                  style={{ backgroundColor: "var(--pcp-cell-bg, #1B2027)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                                  className="w-16 border border-felt-cream/10 rounded px-2 py-1.5 text-sm"
                                />
                                <span style={{ color: "var(--pcp-row-text, rgba(237, 234, 227, 0.3))" }} className="text-sm">
                                  ({elapsed})
                                </span>
                              </div>
                            </td>
                            <td style={{ paddingTop: "var(--pcp-row-pad, 16px)", paddingBottom: "var(--pcp-row-pad, 16px)" }} className="pr-3 text-right">
                              <input
                                type="number"
                                value={level.smallBlind}
                                onChange={(e) => updateLevel(i, "smallBlind", e.target.value)}
                                style={{ backgroundColor: "var(--pcp-cell-bg, #14181C)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                                className="w-24 border border-felt-cream/10 rounded px-2 py-1.5 text-sm text-right font-medium"
                              />
                            </td>
                            <td style={{ paddingTop: "var(--pcp-row-pad, 16px)", paddingBottom: "var(--pcp-row-pad, 16px)" }} className="pr-3 text-right">
                              <input
                                type="number"
                                value={level.bigBlind}
                                onChange={(e) => updateLevel(i, "bigBlind", e.target.value)}
                                style={{ backgroundColor: "var(--pcp-cell-bg, #1B2027)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                                className="w-24 border border-felt-cream/10 rounded px-2 py-1.5 text-sm text-right font-medium"
                              />
                            </td>
                            {config.antesEnabled && (
                              <td style={{ paddingTop: "var(--pcp-row-pad, 16px)", paddingBottom: "var(--pcp-row-pad, 16px)" }} className="pr-3 text-right">
                                <input
                                  type="number"
                                  value={level.ante ?? ""}
                                  onChange={(e) => updateLevel(i, "ante", e.target.value)}
                                  style={{ backgroundColor: "var(--pcp-cell-bg, #14181C)", color: "var(--pcp-cell-text, #EDEAE3)" }}
                                  className="w-24 border border-felt-cream/10 rounded px-2 py-1.5 text-sm text-right font-medium"
                                />
                              </td>
                            )}
                          </>
                        )}
                        <td style={{ paddingTop: "var(--pcp-row-pad, 16px)", paddingBottom: "var(--pcp-row-pad, 16px)" }} className="pl-2 pr-4 rounded-r-md">
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

            <EditableButton
              groupKey="structure-toolbar"
              id="append-level"
              onClick={appendLevelAtEnd}
              wrapperClassName="mt-4"
              className="pcp-btn px-3 py-2 bg-felt-bg border border-felt-cream/10 rounded-md text-sm font-display text-felt-cream/70 hover:text-felt-cream"
            >
              + Niveau
            </EditableButton>
          </CustomizablePanel>
        </div>
      </div>
      {insertModalType && (
        <InsertPositionModal
          type={insertModalType}
          levels={levels}
          chips={chips}
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

function InsertPositionModal({ type, levels, chips, onClose, onConfirm }) {
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
              Après le niveau {i + 1} ({l.isBreak ? l.breakLabel || "Pause" : `${chips(l.smallBlind)}/${chips(l.bigBlind)}`})
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
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
      <label className="sm:w-56 shrink-0 text-sm sm:text-base text-felt-cream/70">{label}</label>
      {children}
    </div>
  );
}

function AutoField({ label, fieldKey, config, setFieldMode, setFieldValue }) {
  const field = config.fields[fieldKey] || { mode: "auto", value: 0 };
  const isAuto = field.mode !== "manual";
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
      <label className="sm:w-56 shrink-0 text-sm sm:text-base text-felt-cream/70">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="number"
          value={field.value}
          disabled={isAuto}
          onChange={(e) => setFieldValue(fieldKey, Number(e.target.value) || 0)}
          style={{ backgroundColor: "var(--pcp-cell-bg, #14181C)", color: "var(--pcp-cell-text, #EDEAE3)" }}
          className="flex-1 border border-felt-cream/10 rounded-md px-4 py-2.5 text-base disabled:opacity-60"
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
          : "pcp-btn bg-felt-bg text-felt-cream/60 hover:text-felt-cream border border-felt-cream/10"
      }`}
    >
      {children}
    </button>
  );
}
