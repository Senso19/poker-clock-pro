import { useEffect, useState } from "react";
import { fetchFormRegistryBySlug, submitFormEntry } from "../lib/forms.js";

const SUBMIT_TARGET = "__submit__";

/**
 * PublicRegistrationForm — formulaire d'inscription public (sans connexion),
 * accessible via /inscription/<slug>. Chaque page peut être une page de
 * contenu (image + texte + boutons personnalisés qui redirigent vers une
 * page précise — pour un choix comme "Day1A / Day1B") et/ou une page de
 * champs classiques. La navigation suit toujours l'ID de la page ciblée,
 * pas juste "page suivante", pour permettre les embranchements.
 */
export default function PublicRegistrationForm({ slug }) {
  const [registry, setRegistry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPageId, setCurrentPageId] = useState(null);
  const [history, setHistory] = useState([]);
  const [values, setValues] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [fieldError, setFieldError] = useState(null);

  useEffect(() => {
    fetchFormRegistryBySlug(slug)
      .then((r) => {
        if (!r) {
          setError("Formulaire introuvable.");
        } else {
          setRegistry(r);
          const pages = r.pages || [];
          if (pages.length > 0) setCurrentPageId(pages[0].id);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return <FormShell theme={{}}>Chargement…</FormShell>;
  }
  if (error || !registry) {
    return <FormShell theme={{}}>{error || "Formulaire introuvable."}</FormShell>;
  }

  const theme = { ...{ bgColor: "#14181C", accentColor: "#C9A15A", cardColor: "#1B2027", textColor: "#EDEAE3" }, ...(registry.theme || {}) };
  const pages = registry.pages || [];

  if (!registry.is_open) {
    return (
      <FormShell theme={theme}>
        <div className="text-center py-10" style={{ color: theme.textColor }}>
          <div className="text-lg font-display mb-2">Inscriptions fermées</div>
          <div className="text-sm opacity-60">Ce formulaire n'accepte plus de nouvelles inscriptions.</div>
        </div>
      </FormShell>
    );
  }

  if (done) {
    return (
      <FormShell theme={theme}>
        <div className="text-center py-10" style={{ color: theme.textColor }}>
          <div className="text-4xl mb-3">✓</div>
          <div className="text-xl font-display mb-2">Inscription envoyée !</div>
          <div className="text-sm opacity-60">Votre demande a bien été transmise. Vous serez contacté après validation.</div>
        </div>
      </FormShell>
    );
  }

  if (pages.length === 0) {
    return <FormShell theme={theme}>Ce formulaire n'a pas encore de contenu.</FormShell>;
  }

  const pageIndex = Math.max(0, pages.findIndex((p) => p.id === currentPageId));
  const page = pages[pageIndex];
  const navButtons = page.navButtons || [];
  const hasCustomNav = navButtons.length > 0;
  const isLastLinearPage = pageIndex === pages.length - 1;

  function setValue(fieldId, v) {
    setValues((prev) => ({ ...prev, [fieldId]: v }));
  }

  function validatePage() {
    for (const f of page.fields || []) {
      if (f.required && !String(values[f.id] || "").trim()) {
        setFieldError(`« ${f.label} » est obligatoire.`);
        return false;
      }
    }
    setFieldError(null);
    return true;
  }

  async function doSubmit() {
    setSubmitting(true);
    try {
      await submitFormEntry(registry.id, values);
      setDone(true);
    } catch (e) {
      setFieldError(e.message);
    }
    setSubmitting(false);
  }

  function goTo(targetPageId) {
    if (!validatePage()) return;
    if (targetPageId === SUBMIT_TARGET) {
      doSubmit();
      return;
    }
    setHistory((h) => [...h, page.id]);
    setCurrentPageId(targetPageId);
  }

  function handleDefaultNext() {
    if (isLastLinearPage) {
      goTo(SUBMIT_TARGET);
    } else {
      goTo(pages[pageIndex + 1].id);
    }
  }

  function handleBack() {
    setHistory((h) => {
      const next = [...h];
      const prev = next.pop();
      if (prev) setCurrentPageId(prev);
      return next;
    });
  }

  return (
    <FormShell theme={theme}>
      {pages.length > 1 && (
        <div className="flex items-center gap-1.5 mb-6">
          {pages.map((p, i) => (
            <div
              key={p.id}
              className="flex-1 h-1.5 rounded-full"
              style={{ backgroundColor: i <= pageIndex ? theme.accentColor : `${theme.textColor}20` }}
            />
          ))}
        </div>
      )}

      {page.image && <img src={page.image} alt="" className="w-full rounded-xl object-cover mb-5 max-h-56" />}

      {page.title && (
        <div className="font-display text-xl mb-1" style={{ color: theme.textColor }}>
          {page.title}
        </div>
      )}
      {page.description && (
        <div className="text-sm mb-6 opacity-70 whitespace-pre-line" style={{ color: theme.textColor }}>
          {page.description}
        </div>
      )}

      {(page.fields || []).length > 0 && (
        <div className="space-y-4 mb-6">
          {page.fields.map((f) => (
            <FieldInput key={f.id} field={f} value={values[f.id] || ""} onChange={(v) => setValue(f.id, v)} theme={theme} />
          ))}
        </div>
      )}

      {fieldError && (
        <div className="text-sm mb-4" style={{ color: "#E06060" }}>
          {fieldError}
        </div>
      )}

      {hasCustomNav ? (
        <div className="flex flex-col gap-2">
          {navButtons.map((b) => (
            <button
              key={b.id}
              onClick={() => goTo(b.targetPageId)}
              disabled={submitting}
              className="w-full px-4 py-3 rounded-lg font-display text-sm disabled:opacity-50"
              style={{ backgroundColor: theme.accentColor, color: theme.bgColor }}
            >
              {b.label}
            </button>
          ))}
          {history.length > 0 && (
            <button
              onClick={handleBack}
              className="px-4 py-2 rounded-lg font-display text-sm border"
              style={{ borderColor: `${theme.textColor}30`, color: theme.textColor }}
            >
              Précédent
            </button>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={handleBack}
              className="px-4 py-2.5 rounded-lg font-display text-sm border"
              style={{ borderColor: `${theme.textColor}30`, color: theme.textColor }}
            >
              Précédent
            </button>
          )}
          <button
            onClick={handleDefaultNext}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-lg font-display text-sm disabled:opacity-50"
            style={{ backgroundColor: theme.accentColor, color: theme.bgColor }}
          >
            {submitting ? "Envoi…" : isLastLinearPage ? "Envoyer l'inscription" : "Suivant"}
          </button>
        </div>
      )}
    </FormShell>
  );
}

function FieldInput({ field, value, onChange, theme }) {
  const baseStyle = {
    backgroundColor: `${theme.textColor}10`,
    borderColor: `${theme.textColor}25`,
    color: theme.textColor,
  };
  return (
    <label className="block text-xs" style={{ color: `${theme.textColor}90` }}>
      {field.label}
      {field.required && <span style={{ color: theme.accentColor }}> *</span>}
      {field.type === "textarea" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          style={baseStyle}
          className="w-full mt-1.5 border rounded-lg px-3 py-2.5 text-sm"
        />
      ) : field.type === "select" ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} style={baseStyle} className="w-full mt-1.5 border rounded-lg px-3 py-2.5 text-sm">
          <option value="">Choisir…</option>
          {(field.options || []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      ) : field.type === "checkbox" ? (
        <div className="mt-1.5">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} className="mr-2" />
        </div>
      ) : (
        <input
          type={field.type || "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={baseStyle}
          className="w-full mt-1.5 border rounded-lg px-3 py-2.5 text-sm"
        />
      )}
    </label>
  );
}

function FormShell({ theme, children }) {
  const bg = theme.bgColor || "#14181C";
  const card = theme.cardColor || "#1B2027";
  const text = theme.textColor || "#EDEAE3";
  return (
    <div style={{ backgroundColor: bg, minHeight: "100vh" }} className="flex items-center justify-center p-4 font-body">
      <div style={{ backgroundColor: card, color: text }} className="w-full max-w-md rounded-2xl p-6 sm:p-8 shadow-2xl">
        {theme.logoData && <img src={theme.logoData} alt="" className="h-14 w-auto max-w-full object-contain mx-auto mb-4" />}
        {theme.title && (
          <div className="font-display text-2xl text-center mb-1" style={{ color: text }}>
            {theme.title}
          </div>
        )}
        {theme.subtitle && (
          <div className="text-sm text-center mb-6 opacity-60" style={{ color: text }}>
            {theme.subtitle}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
