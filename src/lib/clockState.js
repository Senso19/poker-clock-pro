import { supabase } from "./supabase.js";

/**
 * clockState.js — persistance de l'état de l'horloge (niveau, temps
 * restant, en cours/pause) directement sur la ligne du tournoi, pour que
 * l'horloge continue correctement même après un changement d'onglet, un
 * rechargement de page, ou depuis un autre appareil.
 */
export async function saveClockState(tournamentId, { levelIndex, secondsLeft, isRunning }) {
  const payload = {
    clock_level_index: levelIndex,
    clock_seconds_left: secondsLeft,
    clock_is_running: isRunning,
    clock_updated_at: new Date().toISOString(),
  };
  // Une fois l'horloge lancée au moins une fois, le tournoi passe "En
  // cours" pour de bon (même mise en pause, il ne redevient jamais
  // "Programmé") — voir statusForTournament dans TournamentsGrid.
  if (isRunning) payload.clock_started = true;
  const { error } = await supabase.from("tournaments").update(payload).eq("id", tournamentId);
  if (error) throw error;
}
