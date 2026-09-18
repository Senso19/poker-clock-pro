import { supabase } from "./supabase.js";
import { saveClubTheme } from "./clubSettings.js";

/**
 * clockTemplates.js — modèles réutilisables de disposition d'horloge
 * (panneaux + images), indépendants de tout tournoi. "Appliquer" copie le
 * modèle dans club_settings.theme.layout, qui est la disposition utilisée
 * par l'horloge en direct de chaque tournoi.
 */
export async function fetchClockTemplates() {
  const { data, error } = await supabase
    .from("clock_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createClockTemplate(name, layout) {
  const { data, error } = await supabase
    .from("clock_templates")
    .insert({ name, layout })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateClockTemplate(id, name, layout) {
  const { error } = await supabase.from("clock_templates").update({ name, layout }).eq("id", id);
  if (error) throw error;
}

export async function deleteClockTemplate(id) {
  const { error } = await supabase.from("clock_templates").delete().eq("id", id);
  if (error) throw error;
}

export async function applyClockTemplateAsActive(layout) {
  const { data: existing } = await supabase.from("club_settings").select("id, theme").limit(1).maybeSingle();
  const nextTheme = { ...(existing?.theme || {}), layout };
  if (layout?.background) nextTheme.background = layout.background;
  await saveClubTheme(nextTheme);
}

// Applique un modèle d'horloge à UN tournoi précis (tournaments.clock_layout
// et clock_background), sans toucher à la disposition par défaut du club.
// C'est la disposition que EditableClock utilise en priorité pour ce tournoi.
export async function applyClockTemplateToTournament(tournamentId, layout) {
  const payload = { clock_layout: layout };
  if (layout?.background) payload.clock_background = layout.background;
  const { error } = await supabase.from("tournaments").update(payload).eq("id", tournamentId);
  if (error) throw error;
}
