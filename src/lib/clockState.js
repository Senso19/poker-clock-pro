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

// Fenêtre, en heures, pendant laquelle l'horloge d'un tournoi encore
// "Programmé" affiche le compte à rebours avant son heure de début au lieu
// du temps du niveau 1.
export const COUNTDOWN_WINDOW_HOURS = 24;

/**
 * Secondes restant avant l'heure de début programmée d'un tournoi, ou
 * `null` si l'horloge doit afficher le niveau normalement : tournoi déjà
 * lancé au moins une fois (clock_started), sans heure programmée, heure
 * déjà passée, ou début encore à plus de COUNTDOWN_WINDOW_HOURS.
 *
 * Purement un affichage : le départ de l'horloge reste toujours manuel,
 * ce rebours ne la lance jamais de lui-même, et à 0 l'horloge revient
 * simplement au temps du niveau 1 en attendant que l'admin appuie sur
 * "Lecture".
 */
export function secondsUntilScheduledStart(tournament, now = Date.now()) {
  if (!tournament || tournament.clock_started || tournament.force_finished) return null;
  if (!tournament.scheduled_at) return null;
  const start = new Date(tournament.scheduled_at).getTime();
  if (!Number.isFinite(start)) return null;
  const seconds = (start - now) / 1000;
  if (seconds <= 0 || seconds > COUNTDOWN_WINDOW_HOURS * 3600) return null;
  return Math.ceil(seconds);
}
