import { supabase } from "./supabase.js";
import { getCurrentTournamentId, setCurrentTournamentId } from "./currentTournament.js";

/**
 * tournaments.js — liste, sélection, création et suppression de tournois.
 * Remplace l'ancien modèle "le plus récent = actif" par une vraie sélection
 * persistée (localStorage) partagée entre les onglets Horloge/Structure/Joueurs.
 */

/**
 * Toutes les colonnes d'un tournoi SAUF les trois lourdes. La mise en page
 * de l'horloge pèse à elle seule 3,7 ko par tournoi, contre ~240 octets
 * pour tout le reste réuni : la liste des tournois, qui ne fait qu'afficher
 * un nom, une date et un badge, traînait donc l'intégralité des horloges
 * archivées. Seule la duplication a besoin de ces trois colonnes, et elle
 * les relit pour le seul tournoi concerné (fetchTournamentBlueprint).
 */
const COLONNES_LISTE = [
  "id", "name", "date", "buy_in", "rebuy_amount", "addon_amount", "starting_stack",
  "status", "current_level_index", "level_started_at", "created_at", "championship_id",
  "stage_label", "registration_open", "scheduled_at", "clock_level_index",
  "clock_seconds_left", "clock_is_running", "clock_updated_at", "max_players",
  "players_per_table", "final_table_size", "reserved_seats", "location",
  "track_knockouts", "manage_payouts", "manage_players", "seats_drawn",
  "clock_started", "force_finished", "max_tables", "public_view", "is_interclub",
  "clock_layout_fingerprint",
].join(", ");

export async function fetchAllTournaments() {
  const { data, error } = await supabase
    .from("tournaments")
    .select(`${COLONNES_LISTE}, championships(name)`)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

/** Les trois colonnes lourdes d'un tournoi, pour le dupliquer. */
export async function fetchTournamentBlueprint(id) {
  const { data, error } = await supabase
    .from("tournaments")
    .select("structure_config, clock_layout, clock_background")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data || {};
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
