import { useEffect, useState } from "react";
import { Copy, Plus, Trash2, ChevronUp, ChevronDown, ArrowDownAZ, Download } from "lucide-react";
import {
  fetchFormRegistry,
  updateFormRegistry,
  fetchFormSubmissions,
  validateSubmission,
  rejectSubmission,
  deleteSubmission,
  revertSubmissionToPending,
  reorderSubmissions,
  resolveFieldValue,
  resolvePlayerName,
  fetchFormTemplates,
  saveFormTemplate,
} from "../lib/forms.js";
import { fetchAllTournaments, updateTournamentCapacity } from "../lib/tournaments.js";
import { useConfirm } from "../context/ConfirmContext.jsx";
import CustomizablePanel from "./CustomizablePanel.jsx";

const FIELD_TYPES = [
  ["text", "Texte court"],
  ["textarea", "Texte long"],
  ["email", "Email"],
  ["tel", "Téléphone"],
  ["number", "Nombre"],
  ["date", "Date"],
  ["select", "Liste déroulante"],
  ["checkbox", "Case à cocher"],
];
const FIELD_ROLES = [
  ["", "Aucun rôle particulier"],
  ["prenom", "→ Prénom du joueur"],
  ["nom", "→ Nom du joueur"],
  ["email", "→ Email du joueur"],
  ["club", "→ Club d'appartenance"],
];

/**
 * FormRegistryDetail — un registre : onglet Constructeur (thème visuel,
 * pages/champs du formulaire public, lien au tournoi, ouvert/fermé) et
 * onglet Registre (soumissions reçues, validation -> inscription au
 * tournoi + siège attribué).
 */
export default function FormRegistryDetail({ registryId, onBack }) {
  const confirmAction = useConfirm();
  const [registry, setRegistry] = useState(null);
  const [tournaments, setTournaments] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [tab, setTab] = useState("registry");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [copied, setCopied] = useState(false);
  const [detailSubmission, setDetailSubmission] = useState(null);
  const [formTemplates, setFormTemplates] = useState([]);
  const [showApplyTemplate, setShowApplyTemplate] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    load();
    fetchAllTournaments().then(setTournaments).catch(() => {});
    fetchFormTemplates().then(setFormTemplates).catch(() => {});
  }, [registryId]);

  async function load() {
    setLoading(true);
    try {
      setRegistry(await fetchFormRegistry(registryId));
      setSubmissions(await fetchFormSubmissions(registryId));
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function persist(patch) {
    const next = { ...registry, ...patch };
    setRegistry(next);
    try {
      await updateFormRegistry(registryId, patch);
    } catch (e) {
      setError(e.message);
    }
  }

  function updateTheme(patch) {
    persist({ theme: { ...(registry.theme || {}), ...patch } });
  }

  function updatePages(nextPages) {
    persist({ pages: nextPages });
  }

  function addPage() {
    const pages = [...(registry.pages || [])];
    pages.push({ id: `page-${Date.now()}`, title: "Nouvelle page", description: "", fields: [] });
    updatePages(pages);
  }
  function deletePage(pageId) {
    updatePages((registry.pages || []).filter((p) => p.id !== pageId));
  }
  function updatePage(pageId, patch) {
    updatePages((registry.pages || []).map((p) => (p.id === pageId ? { ...p, ...patch } : p)));
  }
  function addField(pageId) {
    const pages = (registry.pages || []).map((p) => {
      if (p.id !== pageId) return p;
      return { ...p, fields: [...p.fields, { id: `field-${Date.now()}`, type: "text", label: "Nouveau champ", required: false }] };
    });
    updatePages(pages);
  }
  function updateField(pageId, fieldId, patch) {
    const pages = (registry.pages || []).map((p) => {
      if (p.id !== pageId) return p;
      return { ...p, fields: p.fields.map((f) => (f.id === fieldId ? { ...f, ...patch } : f)) };
    });
    updatePages(pages);
  }
  function deleteField(pageId, fieldId) {
    const pages = (registry.pages || []).map((p) => {
      if (p.id !== pageId) return p;
      return { ...p, fields: p.fields.filter((f) => f.id !== fieldId) };
    });
    updatePages(pages);
  }
  function moveField(pageId, index, dir) {
    const pages = (registry.pages || []).map((p) => {
      if (p.id !== pageId) return p;
      const fields = [...p.fields];
      const j = index + dir;
      if (j < 0 || j >= fields.length) return p;
      [fields[index], fields[j]] = [fields[j], fields[index]];
      return { ...p, fields };
    });
    updatePages(pages);
  }
  function movePage(index, dir) {
    const pages = [...(registry.pages || [])];
    const j = index + dir;
    if (j < 0 || j >= pages.length) return;
    [pages[index], pages[j]] = [pages[j], pages[index]];
    updatePages(pages);
  }

  function handlePageImageChange(pageId, e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updatePage(pageId, { image: reader.result });
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  function addNavButton(pageId) {
    const pages = (registry.pages || []).map((p) => {
      if (p.id !== pageId) return p;
      const navButtons = [...(p.navButtons || []), { id: `btn-${Date.now()}`, label: "Continuer", targetPageId: "" }];
      return { ...p, navButtons };
    });
    updatePages(pages);
  }
  function updateNavButton(pageId, btnId, patch) {
    const pages = (registry.pages || []).map((p) => {
      if (p.id !== pageId) return p;
      return { ...p, navButtons: (p.navButtons || []).map((b) => (b.id === btnId ? { ...b, ...patch } : b)) };
    });
    updatePages(pages);
  }
  function deleteNavButton(pageId, btnId) {
    const pages = (registry.pages || []).map((p) => {
      if (p.id !== pageId) return p;
      return { ...p, navButtons: (p.navButtons || []).filter((b) => b.id !== btnId) };
    });
    updatePages(pages);
  }

  async function handleLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => updateTheme({ logoData: reader.result });
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  async function handleValidate(sub) {
    setBusyId(sub.id);
    try {
      await validateSubmission(sub, registry);
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  }

  async function handleReject(sub) {
    if (!(await confirmAction("Refuser cette inscription ?"))) return;
    setBusyId(sub.id);
    try {
      await rejectSubmission(sub.id);
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  }

  async function handleDeleteSubmission(sub) {
    const name = resolvePlayerName(registry, sub.data) || "cette inscription";
    if (!(await confirmAction(`Supprimer définitivement ${name} du registre ?`))) return;
    setBusyId(sub.id);
    try {
      await deleteSubmission(sub.id);
      setSubmissions((all) => all.filter((s) => s.id !== sub.id));
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  }

  async function handleRevertToPending(sub) {
    const msg =
      sub.status === "validated"
        ? "Remettre cette inscription en attente ? Son inscription au tournoi (table/siège) sera retirée."
        : "Remettre cette inscription en attente ?";
    if (!(await confirmAction(msg))) return;
    setBusyId(sub.id);
    try {
      await revertSubmissionToPending(sub);
      await load();
    } catch (e) {
      setError(e.message);
    }
    setBusyId(null);
  }

  // Champ dont le libellé contient "club" (n'importe quelle page), pour
  // l'afficher directement sur la ligne sans avoir à ouvrir la fiche.
  function fieldLabelMap() {
    const map = {};
    for (const p of registry?.pages || []) {
      for (const f of p.fields || []) map[f.id] = f.label;
    }
    return map;
  }
  function findClubValue(sub) {
    return resolveFieldValue(registry, sub.data, "club");
  }

  async function moveSubmission(groupList, index, dir) {
    const arr = [...groupList];
    const j = index + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[index], arr[j]] = [arr[j], arr[index]];
    const orderedIds = arr.map((s) => s.id);
    setSubmissions((all) => {
      const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
      return all.map((s) => (orderMap.has(s.id) ? { ...s, sort_order: orderMap.get(s.id) } : s));
    });
    try {
      await reorderSubmissions(orderedIds);
    } catch (e) {
      setError(e.message);
      await load();
    }
  }

  async function sortGroupAlphabetically(groupList) {
    const sorted = [...groupList].sort((a, b) => {
      const nameA = resolvePlayerName(registry, a.data).toLowerCase();
      const nameB = resolvePlayerName(registry, b.data).toLowerCase();
      return nameA.localeCompare(nameB);
    });
    const orderedIds = sorted.map((s) => s.id);
    setSubmissions((all) => {
      const orderMap = new Map(orderedIds.map((id, i) => [id, i]));
      return all.map((s) => (orderMap.has(s.id) ? { ...s, sort_order: orderMap.get(s.id) } : s));
    });
    try {
      await reorderSubmissions(orderedIds);
    } catch (e) {
      setError(e.message);
      await load();
    }
  }

  async function exportGroupToExcel(groupList, groupName) {
    const map = fieldLabelMap();
    const fieldEntries = Object.entries(map); // [[fieldId, label], ...] — ordre stable et déterministe
    const XLSX = await import("xlsx");
    const headers = ["N°", ...fieldEntries.map(([, label]) => label), "Statut"];
    const rows = groupList.map((s, i) => [
      i + 1,
      ...fieldEntries.map(([fieldId]) => s.data?.[fieldId] ?? ""),
      s.status === "validated" ? "Validée" : s.status === "rejected" ? "Refusée" : "En attente",
    ]);
    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, groupName.slice(0, 31) || "Inscriptions");
    XLSX.writeFile(wb, `${registry.name}-${groupName}.xlsx`.replace(/[^a-z0-9-]+/gi, "_"));
  }

  async function handleUpdateCapacity(tournamentId, patch) {
    try {
      await updateTournamentCapacity(tournamentId, patch);
      setTournaments((list) => list.map((t) => (t.id === tournamentId ? { ...t, ...patch } : t)));
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleApplyTemplate(template) {
    if (!(await confirmAction(`Remplacer les pages actuelles du constructeur par le modèle « ${template.name} » ?`))) return;
    await persist({ pages: template.pages, theme: { ...(registry.theme || {}), ...template.theme, title: registry.theme?.title } });
    setShowApplyTemplate(false);
  }

  async function handleSaveTemplate() {
    if (!templateName.trim()) return;
    setSavingTemplate(true);
    try {
      const created = await saveFormTemplate(templateName.trim(), registry.pages || [], registry.theme || {});
      setFormTemplates((prev) => [created, ...prev]);
      setTemplateName("");
      setShowSaveTemplate(false);
    } catch (e) {
      setError(e.message);
    }
    setSavingTemplate(false);
  }

  function copyLink() {
    const url = `${window.location.origin}/inscription/${registry.slug}`;
    navigator.clipboard?.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  if (loading || !registry) {
    return <div className="p-6 text-felt-cream/60 font-body">Chargement…</div>;
  }

  const theme = registry.theme || {};

  // Un même registre peut alimenter plusieurs tournois différents (une
  // page par tournoi, ex : Day1A / Day1B) : chaque tournoi cible obtient
  // son propre tableau dans le registre.
  function tournamentName(id) {
    if (!id) return "Sans tournoi lié";
    return tournaments.find((t) => t.id === id)?.name || "Tournoi supprimé";
  }
  const groupIds = [...new Set(submissions.map((s) => s.tournament_id || null))];
  const groups = groupIds
    .map((id) => ({
      id,
      name: tournamentName(id),
      validated: submissions.filter((s) => (s.tournament_id || null) === id && s.status === "validated"),
      pending: submissions.filter((s) => (s.tournament_id || null) === id && s.status === "pending"),
      rejected: submissions.filter((s) => (s.tournament_id || null) === id && s.status === "rejected"),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="h-full overflow-y-auto font-body text-white">
      <div className="flex items-center gap-3 px-4 sm:px-6 py-4 border-b border-felt-cream/10">
        <button onClick={onBack} className="text-felt-cream/60 hover:text-white text-xl leading-none">
          ←
        </button>
        <div className="font-display text-lg truncate flex-1">{registry.name}</div>
        <button
          onClick={copyLink}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-white"
        >
          <Copy size={13} /> {copied ? "Copié !" : "Lien du formulaire"}
        </button>
        <button
          onClick={() => persist({ is_open: !registry.is_open })}
          className={`text-xs px-3 py-1.5 rounded-md font-display ${
            registry.is_open ? "bg-emerald-500/15 text-emerald-400" : "bg-felt-bg text-felt-cream/50"
          }`}
        >
          {registry.is_open ? "● Ouvert" : "Fermé"}
        </button>
      </div>

      <div className="flex gap-1 px-4 sm:px-6 pt-4">
        <TabButton active={tab === "registry"} onClick={() => setTab("registry")}>
          Registre {submissions.length > 0 && `(${submissions.length})`}
        </TabButton>
        <TabButton active={tab === "builder"} onClick={() => setTab("builder")}>
          Constructeur
        </TabButton>
      </div>

      {error && <div className="text-felt-alert text-sm px-4 sm:px-6 pt-3">{error}</div>}

      {tab === "builder" ? (
        <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
          <div className="bg-felt-panel border border-felt-cream/10 rounded-xl p-4">
            <div className="font-display text-base mb-1">Tournoi par défaut</div>
            <div className="text-xs text-felt-cream/40 mb-3">
              Utilisé pour les pages qui n'ont pas leur propre tournoi lié (réglable par page, plus bas).
            </div>
            <select
              value={registry.tournament_id || ""}
              onChange={(e) => persist({ tournament_id: e.target.value || null })}
              className="w-full bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-sm text-felt-cream"
            >
              <option value="">Aucun tournoi lié</option>
              {tournaments.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {registry.tournament_id && (
              <TournamentCapacityEditor
                tournament={tournaments.find((t) => t.id === registry.tournament_id)}
                onChange={(patch) => handleUpdateCapacity(registry.tournament_id, patch)}
              />
            )}
            <label className="flex items-center gap-2 text-sm text-felt-cream/80 mt-3 pt-3 border-t border-felt-cream/10">
              <input
                type="checkbox"
                checked={!!registry.block_duplicates}
                onChange={(e) => persist({ block_duplicates: e.target.checked })}
              />
              Bloquer les joueurs déjà inscrits (empêche une double inscription au même formulaire, par nom ou email)
            </label>
          </div>

          <div className="bg-felt-panel border border-felt-cream/10 rounded-xl p-4">
            <div className="font-display text-base mb-3">Visuel</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
              <ColorField label="Fond de page" value={theme.bgColor} onChange={(v) => updateTheme({ bgColor: v })} />
              <ColorField label="Fond de la carte" value={theme.cardColor} onChange={(v) => updateTheme({ cardColor: v })} />
              <ColorField label="Couleur d'accent" value={theme.accentColor} onChange={(v) => updateTheme({ accentColor: v })} />
              <ColorField label="Couleur du texte" value={theme.textColor} onChange={(v) => updateTheme({ textColor: v })} />
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mb-3">
              <label className="block text-xs text-felt-cream/50">
                Titre
                <input
                  value={theme.title || ""}
                  onChange={(e) => updateTheme({ title: e.target.value })}
                  className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream"
                />
              </label>
              <label className="block text-xs text-felt-cream/50">
                Sous-titre
                <input
                  value={theme.subtitle || ""}
                  onChange={(e) => updateTheme({ subtitle: e.target.value })}
                  className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream"
                />
              </label>
            </div>
            <div className="flex items-center gap-3">
              {theme.logoData && <img src={theme.logoData} alt="" className="w-10 h-10 rounded-full object-cover" />}
              <label className="px-3 py-1.5 text-xs bg-felt-bg border border-felt-cream/10 rounded-md cursor-pointer hover:text-felt-gold">
                {theme.logoData ? "Changer le logo" : "Ajouter un logo"}
                <input type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
              </label>
              {theme.logoData && (
                <button onClick={() => updateTheme({ logoData: null })} className="text-xs text-felt-alert/60 hover:text-felt-alert">
                  Retirer
                </button>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="font-display text-base">Pages du formulaire</div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowApplyTemplate(true)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-white"
                >
                  Utiliser un modèle
                </button>
                <button
                  onClick={() => setShowSaveTemplate(true)}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/70 hover:text-white"
                >
                  Enregistrer comme modèle
                </button>
                <button
                  onClick={addPage}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 bg-felt-gold text-felt-bg rounded-md font-display"
                >
                  <Plus size={13} /> Nouvelle page
                </button>
              </div>
            </div>
            <div className="space-y-4">
              {(registry.pages || []).map((page, i) => (
                <div key={page.id} className="bg-felt-panel border border-felt-cream/10 rounded-xl p-4">
                  <div className="flex items-start gap-2 mb-3">
                    <div className="flex-1 space-y-2">
                      <input
                        value={page.title}
                        onChange={(e) => updatePage(page.id, { title: e.target.value })}
                        className="w-full bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-sm font-display text-felt-cream"
                        placeholder="Titre de la page"
                      />
                      <textarea
                        value={page.description || ""}
                        onChange={(e) => updatePage(page.id, { description: e.target.value })}
                        rows={2}
                        className="w-full bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-xs text-felt-cream/70"
                        placeholder="Texte de la page (description, présentation du festival...)"
                      />
                      <div className="flex items-center gap-2">
                        {page.image && <img src={page.image} alt="" className="h-10 w-16 object-cover rounded" />}
                        <label className="px-2.5 py-1 text-[11px] bg-felt-bg border border-felt-cream/10 rounded cursor-pointer hover:text-felt-gold text-felt-cream/60">
                          {page.image ? "Changer l'image" : "+ Ajouter une image"}
                          <input type="file" accept="image/*" onChange={(e) => handlePageImageChange(page.id, e)} className="hidden" />
                        </label>
                        {page.image && (
                          <button onClick={() => updatePage(page.id, { image: null })} className="text-[11px] text-felt-alert/60 hover:text-felt-alert">
                            Retirer
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button onClick={() => movePage(i, -1)} className="text-felt-cream/40 hover:text-white">
                        <ChevronUp size={16} />
                      </button>
                      <button onClick={() => movePage(i, 1)} className="text-felt-cream/40 hover:text-white">
                        <ChevronDown size={16} />
                      </button>
                    </div>
                    <button onClick={() => deletePage(page.id)} className="text-felt-alert/60 hover:text-felt-alert shrink-0">
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="space-y-2">
                    {page.fields.map((f, fi) => (
                      <div key={f.id} className="bg-felt-bg rounded-md px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex flex-col shrink-0">
                            <button
                              onClick={() => moveField(page.id, fi, -1)}
                              disabled={fi === 0}
                              className="text-felt-cream/40 hover:text-white disabled:opacity-20"
                            >
                              <ChevronUp size={14} />
                            </button>
                            <button
                              onClick={() => moveField(page.id, fi, 1)}
                              disabled={fi === page.fields.length - 1}
                              className="text-felt-cream/40 hover:text-white disabled:opacity-20"
                            >
                              <ChevronDown size={14} />
                            </button>
                          </div>
                          <input
                            value={f.label}
                            onChange={(e) => updateField(page.id, f.id, { label: e.target.value })}
                            className="flex-1 min-w-[100px] bg-transparent text-sm text-felt-cream"
                          />
                          <select
                            value={f.type}
                            onChange={(e) => updateField(page.id, f.id, { type: e.target.value })}
                            className="bg-felt-panel border border-felt-cream/10 rounded px-2 py-1 text-xs text-felt-cream"
                          >
                            {FIELD_TYPES.map(([v, label]) => (
                              <option key={v} value={v}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <select
                            value={f.role || ""}
                            onChange={(e) => updateField(page.id, f.id, { role: e.target.value || null })}
                            title="Rôle du champ — permet à l'app de reconnaître le prénom/nom/email/club quel que soit le champ utilisé"
                            className="bg-felt-panel border border-felt-gold/30 rounded px-2 py-1 text-xs text-felt-gold"
                          >
                            {FIELD_ROLES.map(([v, label]) => (
                              <option key={v} value={v}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-1 text-xs text-felt-cream/50">
                            <input type="checkbox" checked={!!f.required} onChange={(e) => updateField(page.id, f.id, { required: e.target.checked })} />
                            Requis
                          </label>
                          <button onClick={() => deleteField(page.id, f.id)} className="text-felt-alert/60 hover:text-felt-alert">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        {f.type === "select" && (
                          <label className="block text-[11px] text-felt-cream/40 mt-2">
                            Options de la liste (séparées par des virgules)
                            <input
                              value={(f.options || []).join(", ")}
                              onChange={(e) =>
                                updateField(page.id, f.id, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })
                              }
                              placeholder="Ex : Débutant, Intermédiaire, Confirmé"
                              className="w-full mt-1 bg-felt-panel border border-felt-cream/10 rounded px-2 py-1.5 text-xs text-felt-cream placeholder:text-felt-cream/30"
                            />
                          </label>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => addField(page.id)}
                    className="mt-2 flex items-center gap-1 text-xs text-felt-cream/50 hover:text-felt-gold"
                  >
                    <Plus size={13} /> Ajouter un champ
                  </button>

                  <div className="mt-4 pt-3 border-t border-felt-cream/10">
                    <div className="text-[11px] text-felt-cream/40 mb-2">
                      Boutons de navigation personnalisés (facultatif — remplace le bouton "Suivant" par défaut ;
                      utile pour un choix qui redirige vers une page précise, ex : "Day1A" / "Day1B")
                    </div>
                    <div className="space-y-2">
                      {(page.navButtons || []).map((b) => (
                        <div key={b.id} className="flex flex-wrap items-center gap-2 bg-felt-bg rounded-md px-3 py-2">
                          <input
                            value={b.label}
                            onChange={(e) => updateNavButton(page.id, b.id, { label: e.target.value })}
                            placeholder="Texte du bouton"
                            className="flex-1 min-w-[100px] bg-transparent text-sm text-felt-cream"
                          />
                          <select
                            value={b.targetPageId}
                            onChange={(e) => updateNavButton(page.id, b.id, { targetPageId: e.target.value })}
                            className="bg-felt-panel border border-felt-cream/10 rounded px-2 py-1 text-xs text-felt-cream"
                          >
                            <option value="">Choisir la page cible…</option>
                            {(registry.pages || [])
                              .filter((p) => p.id !== page.id)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.title || "(sans titre)"}
                                </option>
                              ))}
                            <option value="__submit__">→ Envoyer le formulaire</option>
                          </select>
                          <button onClick={() => deleteNavButton(page.id, b.id)} className="text-felt-alert/60 hover:text-felt-alert">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => addNavButton(page.id)}
                      className="mt-2 flex items-center gap-1 text-xs text-felt-cream/50 hover:text-felt-gold"
                    >
                      <Plus size={13} /> Ajouter un bouton de navigation
                    </button>
                  </div>

                  <div className="mt-4 pt-3 border-t border-felt-cream/10">
                    <label className="block text-[11px] text-felt-cream/40">
                      Tournoi lié à cette page (si elle envoie le formulaire — sinon celui du registre est utilisé par
                      défaut)
                      <select
                        value={page.tournamentId || ""}
                        onChange={(e) => updatePage(page.id, { tournamentId: e.target.value || null })}
                        className="w-full mt-1.5 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-sm text-felt-cream"
                      >
                        <option value="">Tournoi par défaut du registre</option>
                        {tournaments.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {page.tournamentId && (
                      <TournamentCapacityEditor
                        tournament={tournaments.find((t) => t.id === page.tournamentId)}
                        onChange={(patch) => handleUpdateCapacity(page.tournamentId, patch)}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-6 max-w-full mx-auto flex flex-wrap justify-center gap-6 items-start">
          {groups.map((g) => (
            <div key={g.id || "none"} className="w-full md:w-[calc(50%-0.75rem)] xl:w-[calc(33.333%-1rem)] max-w-md">
              <div className="flex items-center justify-between gap-2 mb-3">
                <div className="font-display text-base text-felt-gold">{g.name}</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => sortGroupAlphabetically([...g.validated, ...g.pending, ...g.rejected])}
                    title="Trier par ordre alphabétique"
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/60 hover:text-white"
                  >
                    <ArrowDownAZ size={13} /> A-Z
                  </button>
                  <button
                    onClick={() => exportGroupToExcel([...g.validated, ...g.pending, ...g.rejected], g.name)}
                    title="Exporter en Excel"
                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-felt-bg border border-felt-cream/10 rounded-md text-felt-cream/60 hover:text-white"
                  >
                    <Download size={13} /> Excel
                  </button>
                </div>
              </div>
              {g.validated.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40 mb-2">Validées</div>
                  <CustomizablePanel panelKey={`form-registry-validated-${g.id || "none"}`} defaultWidth="1 1 100%" className="space-y-2">
                    {g.validated.map((s, i) => (
                      <SubmissionRow
                        key={s.id}
                        s={s}
                        name={resolvePlayerName(registry, s.data)}
                        index={i}
                        clubLabel={findClubValue(s)}
                        done
                        busy={busyId === s.id}
                        onRevert={() => handleRevertToPending(s)}
                        onDelete={() => handleDeleteSubmission(s)}
                        onOpenDetail={() => setDetailSubmission(s)}
                      />
                    ))}
                  </CustomizablePanel>
                </div>
              )}
              {g.pending.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40 mb-2">En attente</div>
                  <CustomizablePanel panelKey={`form-registry-pending-${g.id || "none"}`} defaultWidth="1 1 100%" className="space-y-2">
                    {g.pending.map((s, i) => (
                      <SubmissionRow
                        key={s.id}
                        s={s}
                        name={resolvePlayerName(registry, s.data)}
                        index={i}
                        clubLabel={findClubValue(s)}
                        canReorder
                        onMoveUp={() => moveSubmission(g.pending, i, -1)}
                        onMoveDown={() => moveSubmission(g.pending, i, 1)}
                        busy={busyId === s.id}
                        onValidate={() => handleValidate(s)}
                        onReject={() => handleReject(s)}
                        onDelete={() => handleDeleteSubmission(s)}
                        onOpenDetail={() => setDetailSubmission(s)}
                      />
                    ))}
                  </CustomizablePanel>
                </div>
              )}
              {g.rejected.length > 0 && (
                <div>
                  <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40 mb-2">Refusées</div>
                  <CustomizablePanel panelKey={`form-registry-rejected-${g.id || "none"}`} defaultWidth="1 1 100%" className="space-y-2">
                    {g.rejected.map((s, i) => (
                      <SubmissionRow
                        key={s.id}
                        s={s}
                        name={resolvePlayerName(registry, s.data)}
                        index={i}
                        clubLabel={findClubValue(s)}
                        done
                        busy={busyId === s.id}
                        onRevert={() => handleRevertToPending(s)}
                        onDelete={() => handleDeleteSubmission(s)}
                        onOpenDetail={() => setDetailSubmission(s)}
                      />
                    ))}
                  </CustomizablePanel>
                </div>
              )}
            </div>
          ))}
          {submissions.length === 0 && <div className="text-sm text-felt-cream/50">Aucune inscription reçue pour le moment.</div>}
        </div>
      )}

      {detailSubmission && (
        <SubmissionDetailModal
          submission={detailSubmission}
          name={resolvePlayerName(registry, detailSubmission.data)}
          fieldLabelMap={fieldLabelMap()}
          onClose={() => setDetailSubmission(null)}
        />
      )}

      {showApplyTemplate && (
        <div onClick={() => setShowApplyTemplate(false)} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm p-6 font-body text-felt-cream max-h-[80vh] flex flex-col"
          >
            <div className="font-display text-lg mb-4">Utiliser un modèle</div>
            {formTemplates.length === 0 ? (
              <div className="text-sm text-felt-cream/50 mb-4">
                Aucun modèle enregistré pour le moment. Construisez vos pages puis cliquez « Enregistrer comme modèle » pour
                en créer un.
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto mb-4">
                {formTemplates.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleApplyTemplate(t)}
                    className="w-full text-left px-3 py-2 bg-felt-bg border border-felt-cream/10 rounded-md text-sm text-felt-cream hover:border-felt-gold/40"
                  >
                    {t.name} <span className="text-felt-cream/40 text-xs">— {(t.pages || []).length} page(s)</span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => setShowApplyTemplate(false)} className="w-full px-4 py-2 text-felt-cream/60 hover:text-felt-cream">
              Fermer
            </button>
          </div>
        </div>
      )}

      {showSaveTemplate && (
        <div onClick={() => setShowSaveTemplate(false)} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm p-6 font-body text-felt-cream">
            <div className="font-display text-lg mb-4">Enregistrer comme modèle</div>
            <label className="block text-xs text-felt-cream/50 mb-4">
              Nom du modèle
              <input
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="Ex : Inscription festival standard"
                onKeyDown={(e) => e.key === "Enter" && handleSaveTemplate()}
                className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
              />
            </label>
            <div className="flex gap-2">
              <button onClick={() => setShowSaveTemplate(false)} className="flex-1 px-4 py-2 text-felt-cream/60 hover:text-felt-cream">
                Annuler
              </button>
              <button
                onClick={handleSaveTemplate}
                disabled={savingTemplate || !templateName.trim()}
                className="flex-1 px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
              >
                {savingTemplate ? "Enregistrement…" : "Enregistrer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TournamentCapacityEditor({ tournament, onChange }) {
  const [maxPlayers, setMaxPlayers] = useState(tournament?.max_players ?? "");
  const [perTable, setPerTable] = useState(tournament?.players_per_table ?? "");

  useEffect(() => {
    setMaxPlayers(tournament?.max_players ?? "");
    setPerTable(tournament?.players_per_table ?? "");
  }, [tournament?.id]);

  if (!tournament) return null;
  const estimatedTables = maxPlayers && perTable ? Math.ceil(Number(maxPlayers) / Number(perTable)) : null;

  return (
    <div className="mt-3 pt-3 border-t border-felt-cream/10">
      <div className="text-[11px] text-felt-cream/40 mb-2">
        Capacité de <strong className="text-felt-cream/60">{tournament.name}</strong> — détermine combien de tables
        seront ouvertes automatiquement à la validation des inscriptions.
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] text-felt-cream/50">
          Nombre de joueurs total
          <input
            type="number"
            value={maxPlayers}
            onChange={(e) => setMaxPlayers(e.target.value)}
            onBlur={() => onChange({ max_players: Number(maxPlayers) || null })}
            className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-2.5 py-1.5 text-sm text-felt-cream"
          />
        </label>
        <label className="block text-[11px] text-felt-cream/50">
          Joueurs par table
          <input
            type="number"
            value={perTable}
            onChange={(e) => setPerTable(e.target.value)}
            onBlur={() => onChange({ players_per_table: Number(perTable) || null })}
            className="w-full mt-1 bg-felt-bg border border-felt-cream/10 rounded-md px-2.5 py-1.5 text-sm text-felt-cream"
          />
        </label>
      </div>
      {estimatedTables && (
        <div className="text-[11px] text-felt-gold mt-2">
          → {estimatedTables} table(s) au total seront nécessaires pour {maxPlayers} joueurs.
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-display border-b-2 ${
        active ? "border-felt-gold text-felt-gold" : "border-transparent text-felt-cream/50 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="block text-xs text-felt-cream/50">
      {label}
      <div className="flex items-center gap-2 mt-1">
        <input type="color" value={value || "#14181C"} onChange={(e) => onChange(e.target.value)} className="w-8 h-8 bg-transparent cursor-pointer" />
      </div>
    </label>
  );
}

function SubmissionRow({
  s,
  name,
  index,
  clubLabel,
  busy,
  done,
  canReorder,
  onMoveUp,
  onMoveDown,
  onValidate,
  onReject,
  onRevert,
  onDelete,
  onOpenDetail,
}) {
  return (
    <div className="bg-felt-panel border border-felt-cream/10 rounded-lg px-3 py-2.5 flex items-center gap-3">
      {canReorder && (
        <div className="flex flex-col shrink-0">
          <button onClick={onMoveUp} className="text-felt-cream/40 hover:text-white">
            <ChevronUp size={15} />
          </button>
          <button onClick={onMoveDown} className="text-felt-cream/40 hover:text-white">
            <ChevronDown size={15} />
          </button>
        </div>
      )}
      <div className="pcp-value w-7 text-center font-display text-felt-cream/40 shrink-0">{index + 1}</div>
      <button onClick={onOpenDetail} className="flex-1 min-w-0 text-left">
        <div className="pcp-title text-lg font-display text-white truncate">{name || "(sans nom)"}</div>
        {clubLabel && <div className="pcp-body text-sm text-felt-cream/50 truncate">{clubLabel}</div>}
      </button>
      {!done ? (
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onReject}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-md border border-felt-alert/30 text-felt-alert disabled:opacity-40"
          >
            Refuser
          </button>
          <button
            onClick={onValidate}
            disabled={busy}
            className="text-xs px-3 py-1.5 rounded-md bg-felt-gold text-felt-bg font-display disabled:opacity-40"
          >
            {busy ? "…" : "Valider"}
          </button>
          <button onClick={onDelete} disabled={busy} title="Supprimer" className="text-felt-cream/30 hover:text-felt-alert disabled:opacity-40">
            <Trash2 size={15} />
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-xs px-2.5 py-1 rounded-full ${
              s.status === "validated" ? "bg-emerald-500/15 text-emerald-400" : "bg-felt-alert/15 text-felt-alert"
            }`}
          >
            {s.status === "validated" ? "Validée" : "Refusée"}
          </span>
          <button
            onClick={onRevert}
            disabled={busy}
            title="Revoir la décision (remettre en attente)"
            className="text-xs px-2.5 py-1.5 rounded-md border border-felt-cream/10 text-felt-cream/50 hover:text-white disabled:opacity-40"
          >
            ↺
          </button>
          <button onClick={onDelete} disabled={busy} title="Supprimer" className="text-felt-cream/30 hover:text-felt-alert disabled:opacity-40">
            <Trash2 size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function SubmissionDetailModal({ submission, name, fieldLabelMap, onClose }) {
  const entries = Object.entries(submission.data || {});
  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm p-6 font-body text-felt-cream max-h-[85vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="font-display text-lg">{name || "(sans nom)"}</div>
          <button onClick={onClose} className="text-felt-cream/50 hover:text-felt-cream">
            ✕
          </button>
        </div>
        <div className="space-y-3">
          {entries.map(([fieldId, value]) => (
            <div key={fieldId}>
              <div className="text-xs text-felt-cream/40 uppercase tracking-wide">{fieldLabelMap[fieldId] || fieldId}</div>
              <div className="text-sm text-white">{String(value) || "—"}</div>
            </div>
          ))}
        </div>
        <button onClick={onClose} className="w-full mt-6 px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display">
          Fermer
        </button>
      </div>
    </div>
  );
}
