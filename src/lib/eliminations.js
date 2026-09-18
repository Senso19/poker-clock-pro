import { supabase } from "./supabase.js";
import { logEvent } from "./events.js";
import { addAnnouncement } from "./announcements.js";
import { playerLabel } from "./players.js";

/**
 * eliminatePlayer — la seule écriture d'élimination de l'application.
 *
 * Elle était écrite à deux endroits, et les deux versions avaient
 * divergé : celle de la vue Élimination (utilisée par les chefs de table)
 * n'écrivait ni journal ni annonce, et ne terminait pas le tournoi quand
 * il ne restait qu'un joueur. Trois écrans en ont désormais besoin — d'où
 * cette version unique.
 *
 * `stillIn` est la liste des inscriptions encore en jeu AVANT cette
 * élimination, celle qu'on élimine incluse : la place obtenue est
 * exactement le nombre de joueurs restants au moment où il sort.
 *
 * Renvoie la place, et le nom du vainqueur si cette élimination met fin
 * au tournoi — l'annonce à l'écran reste à la charge de l'appelant, qui
 * seul sait comment il présente ses fenêtres.
 */
export async function eliminatePlayer({ tournamentId, reg, stillIn, eliminatedByRegId = null }) {
  const position = stillIn.length;

  const { data: elim, error } = await supabase
    .from("eliminations")
    .insert({
      tournament_id: tournamentId,
      registration_id: reg.id,
      finish_position: position,
      eliminated_by: eliminatedByRegId || null,
    })
    .select()
    .single();
  if (error) throw error;

  const nom = playerLabel(reg) || reg.players?.full_name || "";
  logEvent(tournamentId, "elimination", reg.players?.full_name || nom, {
    eliminationId: elim?.id,
    registrationId: reg.id,
  });
  addAnnouncement(tournamentId, `${nom} éliminé à la ${position}ᵉ place`, "elimination");

  // S'il ne reste qu'un joueur, c'est le vainqueur : le tournoi passe en
  // Terminé et l'horloge s'arrête.
  const remaining = stillIn.filter((r) => r.id !== reg.id);
  if (remaining.length === 1) {
    const winnerName = playerLabel(remaining[0]) || remaining[0].players?.full_name || "Le gagnant";
    await supabase
      .from("tournaments")
      .update({ force_finished: true, clock_is_running: false })
      .eq("id", tournamentId);
    addAnnouncement(tournamentId, `🏆 ${winnerName} a gagné le tournoi !`, "winner");
    return { position, winnerName };
  }

  return { position, winnerName: null };
}
