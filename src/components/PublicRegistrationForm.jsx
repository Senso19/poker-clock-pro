import { useEffect, useState } from "react";
import { fetchFormRegistryBySlug, submitFormEntry } from "../lib/forms.js";
import FormWizard from "./FormWizard.jsx";
import ClubLoader from "./ClubLoader.jsx";

/**
 * PublicRegistrationForm — formulaire d'inscription public (sans connexion),
 * accessible via /inscription/<slug>. Le rendu multi-pages lui-même est
 * géré par FormWizard (partagé avec l'aperçu de modèle dans Gérer les
 * modèles) ; ce composant se charge de charger le registre et d'enregistrer
 * réellement la soumission.
 */
export default function PublicRegistrationForm({ slug }) {
  const [registry, setRegistry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchFormRegistryBySlug(slug)
      .then((r) => {
        if (!r) setError("Formulaire introuvable.");
        else setRegistry(r);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#14181C" }} className="flex items-center justify-center">
        <ClubLoader />
      </div>
    );
  }
  if (error || !registry) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#14181C" }} className="flex items-center justify-center text-felt-cream/50 font-body">
        {error || "Formulaire introuvable."}
      </div>
    );
  }

  async function handleSubmit(values, page) {
    await submitFormEntry(registry.id, values, page.tournamentId || registry.tournament_id, page.id, registry);
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <FormWizard pages={registry.pages || []} theme={registry.theme} isOpen={registry.is_open} onSubmit={handleSubmit} />
    </div>
  );
}
