import { supabase } from "./supabase.js";

/**
 * clockState.js — persistance de l'état de l'horloge (niveau, temps
 * restant, en cours/pause) directement sur la ligne du tournoi, pour que
 * l'horloge continue correctement même après un changement d'onglet, un
 * rechargement de page, ou depuis un autre appareil.
 */
// Dernier état ÉCRIT AVEC SUCCÈS pour chaque tournoi. Sert à ne pas
// réécrire ce qui est déjà en base : l'horloge appelle cette fonction
// toutes les 5 secondes, y compris à l'arrêt, où rien ne change jamais.
// Un écran de salle allumé la journée écrivait ainsi ~720 fois par heure
// une ligne identique — et ce n'est pas une petite ligne : la disposition
// et le fond du tournoi vivent dans la même, que Postgres recopie en
// entier à chaque mise à jour.
//
// On ne retient QUE les écritures réussies : après un échec (réseau
// coupé en pleine partie), l'état suivant est forcément vu comme
// différent et repart en base.
const dernierEtatEcrit = new Map();

export async function saveClockState(tournamentId, { levelIndex, secondsLeft, isRunning }) {
  const connu = dernierEtatEcrit.get(tournamentId);
  if (connu && connu.levelIndex === levelIndex && connu.secondsLeft === secondsLeft && connu.isRunning === isRunning) {
    return;
  }
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
  if (error) {
    dernierEtatEcrit.delete(tournamentId);
    throw error;
  }
  dernierEtatEcrit.set(tournamentId, { levelIndex, secondsLeft, isRunning });
}

/**
 * À appeler quand l'état en base a pu changer sans passer par ici — une
 * autre tablette a bougé l'horloge, par exemple. Le prochain
 * saveClockState réécrira alors même si les valeurs locales n'ont pas
 * bougé.
 */
export function oublierEtatClockEcrit(tournamentId) {
  dernierEtatEcrit.delete(tournamentId);
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

/**
 * advanceForElapsed — rattrape l'horloge après une absence.
 *
 * L'état enregistré donne un niveau et un temps restant à un instant T.
 * Au retour, on consomme le temps écoulé niveau par niveau pour retrouver
 * où l'horloge en serait si personne n'avait quitté la page.
 *
 * Était recopié à l'identique dans l'horloge de bureau et l'horloge
 * mobile : deux versions d'un calcul dont le résultat doit justement être
 * le même sur les deux écrans.
 */
export function advanceForElapsed(levelIndex, secondsLeft, elapsedSeconds, levels) {
  let idx = levelIndex;
  let left = secondsLeft;
  let remaining = Math.round(elapsedSeconds);
  while (remaining > 0 && idx < levels.length) {
    if (remaining < left) {
      left -= remaining;
      remaining = 0;
    } else {
      remaining -= left;
      idx += 1;
      left = (levels[idx]?.durationMinutes || 20) * 60;
    }
  }
  if (idx >= levels.length) {
    idx = Math.max(0, levels.length - 1);
    left = 0;
  }
  return { levelIndex: idx, secondsLeft: left };
}
