import { supabase } from "./supabase.js";
import { getCurrentTournamentId, setCurrentTournamentId } from "./currentTournament.js";

/**
 * tournaments.js — liste, sélection, création et suppression de tournois.
 * Remplace l'ancien modèle "le plus récent = actif" par une vraie sélection
 * persistée (localStorage) partagée entre les onglets Horloge/Structure/Joueurs.
 */

export async function fetchAllTournaments() {
  const { data, error } = await supabase
    .from("tournaments")
    .select("*, championships(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

// Ré-export sous le nom historique attendu par levels.js / StructureEditor
export async function fetchActiveTournament() {
  return fetchCurrentTournament();
}

export async function fetchCurrentTournament() {
  const id = getCurrentTournamentId();
  if (id) {
    const { data } = await supabase.from("tournaments").select("*").eq("id", id).maybeSingle();
    if (data) return data;
  }
  const { data } = await supabase
    .from("tournaments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data) setCurrentTournamentId(data.id);
  return data || null;
}

export function selectTournament(id) {
  setCurrentTournamentId(id);
}

export async function deleteTournament(id) {
  const { error } = await supabase.from("tournaments").delete().eq("id", id);
  if (error) throw error;
  if (getCurrentTournamentId() === id) setCurrentTournamentId(null);
}

// Réglages de capacité (nombre de joueurs attendu, joueurs par table) d'un
// tournoi, modifiables directement depuis le registre d'inscription auquel
// il est lié — évite d'avoir à ouvrir le tournoi séparément.
export async function updateTournamentCapacity(id, patch) {
  const { error } = await supabase.from("tournaments").update(patch).eq("id", id);
  if (error) throw error;
}
