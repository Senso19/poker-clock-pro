import { supabase } from "./supabase.js";
import { computeSeatAssignment } from "./seating.js";

/**
 * forms.js — registres de formulaires d'inscription (Festival/Open) :
 * création/édition du formulaire (plusieurs pages, champs, thème visuel),
 * réception des soumissions publiques, et validation d'une soumission
 * (inscrit le joueur au tournoi lié, lui attribue table+siège).
 */

const MAX_PER_TABLE = 9;

export function defaultTheme() {
  return {
    bgColor: "#14181C",
    accentColor: "#C9A15A",
    cardColor: "#1B2027",
    textColor: "#EDEAE3",
    title: "Inscription",
    subtitle: "",
    logoData: null,
  };
}

export function defaultPages() {
  return [
    {
      id: `page-${Date.now()}`,
      title: "Vos informations",
      description: "",
      fields: [
        { id: "prenom", type: "text", label: "Prénom", required: true, role: "prenom" },
        { id: "nom", type: "text", label: "Nom", required: true, role: "nom" },
        { id: "email", type: "email", label: "Email", required: false, role: "email" },
        { id: "telephone", type: "tel", label: "Téléphone", required: false },
      ],
    },
  ];
}

// Trouve la valeur d'un champ selon son "rôle" (prenom/nom/email/club),
// indépendamment de son identifiant technique — indispensable dès qu'un
// champ personnalisé est ajouté dans le constructeur (id aléatoire type
// "field-172..."), pas seulement les champs par défaut du modèle.
export function resolveFieldValue(registry, submissionData, role) {
  for (const page of registry?.pages || []) {
    for (const f of page.fields || []) {
      if (f.role === role && submissionData?.[f.id]) return submissionData[f.id];
    }
  }
  return null;
}
export function resolvePlayerName(registry, submissionData) {
  const prenom = resolveFieldValue(registry, submissionData, "prenom");
  const nom = resolveFieldValue(registry, submissionData, "nom");
  return [prenom, nom].filter(Boolean).join(" ").trim();
}

export async function fetchFormRegistries() {
  const { data, error } = await supabase
    .from("form_registries")
    .select("*, tournaments(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchFormRegistry(id) {
  const { data, error } = await supabase.from("form_registries").select("*, tournaments(name)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function fetchFormRegistryBySlug(slug) {
  const { data, error } = await supabase.from("form_registries").select("*").eq("slug", slug).maybeSingle();
  if (error) throw error;
  return data;
}

function slugify(name) {
  return (
    name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || `registre-${Date.now()}`
  );
}

export async function createFormRegistry(name) {
  let slug = slugify(name);
  const { data: existing } = await supabase.from("form_registries").select("id").eq("slug", slug);
  if (existing && existing.length > 0) slug = `${slug}-${Date.now().toString(36)}`;
  const { data, error } = await supabase
    .from("form_registries")
    .insert({ name, slug, pages: defaultPages(), theme: { ...defaultTheme(), title: name } })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateFormRegistry(id, patch) {
  const { error } = await supabase.from("form_registries").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteFormRegistry(id) {
  const { error } = await supabase.from("form_registries").delete().eq("id", id);
  if (error) throw error;
}

export async function fetchFormSubmissions(registryId) {
  const { data, error } = await supabase
    .from("form_submissions")
    .select("*")
    .eq("registry_id", registryId)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

// Réordonne manuellement une liste de soumissions (même groupe/tournoi) :
// écrit leur nouveau sort_order un par un pour refléter l'ordre affiché.
export async function reorderSubmissions(orderedIds) {
  await Promise.all(orderedIds.map((id, i) => supabase.from("form_submissions").update({ sort_order: i }).eq("id", id)));
}

// Envoi public (page sans connexion) : aucune vérification d'identité, le
// registre doit juste être ouvert. tournamentId vient de la page qui a
// envoyé le formulaire (voir "Tournoi lié" dans le constructeur) — permet
// à un même registre d'alimenter plusieurs tableaux/tournois différents
// (ex : Day1A / Day1B d'un même Main Event).
export async function submitFormEntry(registryId, data, tournamentId, pageId, registry) {
  // Si l'admin a activé "Bloquer les doublons" pour ce registre, on refuse
  // une nouvelle soumission dont le nom ou l'email correspond déjà à une
  // inscription existante (en attente ou validée) sur ce même registre.
  if (registry?.block_duplicates) {
    const playerName = resolvePlayerName(registry, data).trim().toLowerCase();
    const playerEmail = (resolveFieldValue(registry, data, "email") || "").trim().toLowerCase();
    const { data: existing } = await supabase
      .from("form_submissions")
      .select("data")
      .eq("registry_id", registryId)
      .neq("status", "rejected");
    const isDuplicate = (existing || []).some((s) => {
      const otherName = resolvePlayerName(registry, s.data).trim().toLowerCase();
      const otherEmail = (resolveFieldValue(registry, s.data, "email") || "").trim().toLowerCase();
      return (playerName && otherName && playerName === otherName) || (playerEmail && otherEmail && playerEmail === otherEmail);
    });
    if (isDuplicate) throw new Error("Vous êtes déjà inscrit à ce formulaire.");
  }

  const { error } = await supabase
    .from("form_submissions")
    .insert({ registry_id: registryId, data, status: "pending", tournament_id: tournamentId || null, page_id: pageId || null });
  if (error) throw error;

  // E-mail de confirmation au joueur (s'il a renseigné une adresse) + copie
  // au club, via la fonction Edge send-form-confirmation. Best-effort : un
  // souci d'envoi ne doit pas empêcher l'inscription elle-même de réussir.
  try {
    let tournamentName = null;
    if (tournamentId) {
      const { data: t } = await supabase.from("tournaments").select("name").eq("id", tournamentId).maybeSingle();
      tournamentName = t?.name || null;
    }
    const playerEmail = resolveFieldValue(registry, data, "email");
    const playerName = resolvePlayerName(registry, data);
    await supabase.functions.invoke("send-form-confirmation", {
      body: { registryName: registry?.name || "Inscription", tournamentName, data, playerEmail, playerName },
    });
  } catch {
    // silencieux : l'inscription est déjà enregistrée, l'e-mail est secondaire
  }
}

export async function rejectSubmission(id) {
  const { error } = await supabase.from("form_submissions").update({ status: "rejected" }).eq("id", id);
  if (error) throw error;
}

// Supprime définitivement une ligne du registre (n'annule PAS une
// éventuelle inscription au tournoi déjà créée si la soumission était
// validée — ça se gère depuis la fiche du tournoi).
export async function deleteSubmission(id) {
  const { error } = await supabase.from("form_submissions").delete().eq("id", id);
  if (error) throw error;
}

// Remet une soumission "en attente" pour pouvoir revoir la décision. Si
// elle était validée, l'inscription au tournoi (table/siège) créée à la
// validation est retirée pour rester cohérent.
export async function revertSubmissionToPending(submission) {
  if (submission.status === "validated" && submission.registration_id) {
    await supabase.from("registrations").delete().eq("id", submission.registration_id);
  }
  const { error } = await supabase
    .from("form_submissions")
    .update({ status: "pending", registration_id: null, validated_at: null })
    .eq("id", submission.id);
  if (error) throw error;
}

// Valide une soumission : crée (ou réutilise) le joueur, l'inscrit au
// tournoi lié à cette soumission (celui de sa page, sinon celui par défaut
// du registre) avec le prochain siège libre, et relie la soumission à
// cette inscription.
export async function validateSubmission(submission, registry) {
  const tournamentId = submission.tournament_id || registry.tournament_id;
  if (!tournamentId) throw new Error("Cette inscription n'est liée à aucun tournoi.");
  const { data: tournament, error: tErr } = await supabase.from("tournaments").select("*, championships(name)").eq("id", tournamentId).single();
  if (tErr) throw tErr;

  const prenom = resolveFieldValue(registry, submission.data, "prenom");
  const nom = resolveFieldValue(registry, submission.data, "nom");
  const fullName = resolvePlayerName(registry, submission.data) || "Joueur";
  const playerEmail = resolveFieldValue(registry, submission.data, "email");
  const club = resolveFieldValue(registry, submission.data, "club");
  const pseudo = resolveFieldValue(registry, submission.data, "pseudo");

  let { data: player } = await supabase.from("players").select("id").ilike("full_name", fullName).maybeSingle();
  if (!player) {
    const { data: created, error: pErr } = await supabase
      .from("players")
      .insert({
        full_name: fullName,
        first_name: prenom || null,
        last_name: nom || null,
        email: playerEmail || null,
        club: club || null,
        pseudo: pseudo || null,
      })
      .select()
      .single();
    if (pErr) throw pErr;
    player = created;
  } else if (club || prenom || nom || pseudo) {
    // Complète la fiche joueur existante si ces infos manquaient encore.
    await supabase
      .from("players")
      .update({ first_name: prenom || undefined, last_name: nom || undefined, club: club || undefined, pseudo: pseudo || undefined })
      .eq("id", player.id);
  }

  const { table, seat } = await computeSeatAssignment(tournament);

  const { data: reg, error: regErr } = await supabase
    .from("registrations")
    .insert({
      tournament_id: tournament.id,
      player_id: player.id,
      table_number: table,
      seat_number: seat,
      stack: tournament.starting_stack,
    })
    .select()
    .single();
  if (regErr) throw regErr;

  const { error: subErr } = await supabase
    .from("form_submissions")
    .update({ status: "validated", registration_id: reg.id, validated_at: new Date().toISOString() })
    .eq("id", submission.id);
  if (subErr) throw subErr;

  return reg;
}

// Modèles de formulaire — réutilisables entre registres, gérés depuis
// "Gérer les modèles" et proposés dans le constructeur de chaque registre.
export async function fetchFormTemplates() {
  const { data, error } = await supabase.from("form_templates").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveFormTemplate(name, pages, theme) {
  const { data, error } = await supabase.from("form_templates").insert({ name, pages, theme }).select().single();
  if (error) throw error;
  return data;
}

export async function deleteFormTemplate(id) {
  const { error } = await supabase.from("form_templates").delete().eq("id", id);
  if (error) throw error;
}
