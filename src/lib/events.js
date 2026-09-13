import { supabase } from "./supabase.js";

/**
 * events.js — journal d'actions d'un tournoi (inscriptions, éliminations,
 * création...), pour permettre d'annuler une action précise (façon
 * BlindValet "Journal de tournoi"). Chaque événement porte un payload
 * suffisant pour être défait individuellement.
 */
export async function logEvent(tournamentId, type, description, payload = {}) {
  try {
    await supabase.from("tournament_events").insert({
      tournament_id: tournamentId,
      type,
      description,
      payload,
    });
  } catch {
    // le journal ne doit jamais bloquer l'action principale
  }
}

export async function fetchEvents(tournamentId) {
  const { data, error } = await supabase
    .from("tournament_events")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  return data || [];
}

export async function markEventUndone(id) {
  const { error } = await supabase.from("tournament_events").update({ undone: true }).eq("id", id);
  if (error) throw error;
}
