import { useEffect, useState } from "react";
import { Copy, Plus, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import {
  fetchFormRegistry,
  updateFormRegistry,
  fetchFormSubmissions,
  validateSubmission,
  rejectSubmission,
} from "../lib/forms.js";
import { fetchAllTournaments } from "../lib/tournaments.js";
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
  const [tab, setTab] = useState("builder");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    load();
    fetchAllTournaments().then(setTournaments).catch(() => {});
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
      pending: submissions.filter((s) => (s.tournament_id || null) === id && s.status === "pending"),
      others: submissions.filter((s) => (s.tournament_id || null) === id && s.status !== "pending"),
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
        <TabButton active={tab === "builder"} onClick={() => setTab("builder")}>
          Constructeur
        </TabButton>
        <TabButton active={tab === "registry"} onClick={() => setTab("registry")}>
          Registre {submissions.length > 0 && `(${submissions.length})`}
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
              <button
                onClick={addPage}
                className="flex items-center gap-1 text-xs px-3 py-1.5 bg-felt-gold text-felt-bg rounded-md font-display"
              >
                <Plus size={13} /> Nouvelle page
              </button>
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
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-8">
          {groups.map((g) => (
            <div key={g.id || "none"}>
              <div className="font-display text-base text-felt-gold mb-3">{g.name}</div>
              {g.pending.length > 0 && (
                <div className="mb-4">
                  <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40 mb-2">En attente</div>
                  <CustomizablePanel panelKey={`form-registry-pending-${g.id || "none"}`} defaultWidth="1 1 100%" className="space-y-2">
                    {g.pending.map((s) => (
                      <SubmissionRow key={s.id} s={s} busy={busyId === s.id} onValidate={() => handleValidate(s)} onReject={() => handleReject(s)} />
                    ))}
                  </CustomizablePanel>
                </div>
              )}
              {g.others.length > 0 && (
                <div>
                  <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40 mb-2">Traitées</div>
                  <CustomizablePanel panelKey={`form-registry-done-${g.id || "none"}`} defaultWidth="1 1 100%" className="space-y-2">
                    {g.others.map((s) => (
                      <SubmissionRow key={s.id} s={s} done />
                    ))}
                  </CustomizablePanel>
                </div>
              )}
            </div>
          ))}
          {submissions.length === 0 && <div className="text-sm text-felt-cream/50">Aucune inscription reçue pour le moment.</div>}
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

function SubmissionRow({ s, busy, done, onValidate, onReject }) {
  const entries = Object.entries(s.data || {});
  return (
    <div className="bg-felt-panel border border-felt-cream/10 rounded-lg px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <div className="text-white">
          {s.data?.prenom} {s.data?.nom}
        </div>
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
          </div>
        ) : (
          <span
            className={`text-xs px-2.5 py-1 rounded-full shrink-0 ${
              s.status === "validated" ? "bg-emerald-500/15 text-emerald-400" : "bg-felt-alert/15 text-felt-alert"
            }`}
          >
            {s.status === "validated" ? "Validée" : "Refusée"}
          </span>
        )}
      </div>
      <div className="text-xs text-felt-cream/40">
        {entries
          .filter(([k]) => k !== "prenom" && k !== "nom")
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · ")}
      </div>
    </div>
  );
}
