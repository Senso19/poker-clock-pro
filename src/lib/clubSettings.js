import { supabase } from "./supabase.js";

/**
 * clubSettings.js — l'unique écriture dans club_settings.
 *
 * La table ne contient qu'une ligne, mais il n'y a pas de contrainte qui
 * le garantisse : chaque écriture doit donc lire l'identifiant existant
 * puis choisir entre UPDATE et INSERT. Cette danse était recopiée dans
 * dix endroits — six composants et quatre fonctions de lib — à
 * l'identique. Une seule faute de frappe dans l'une d'elles aurait créé
 * une deuxième ligne de réglages, que plus rien n'aurait lue.
 */
export async function upsertClubSettings(patch) {
  const { data: existing } = await supabase.from("club_settings").select("id").limit(1).maybeSingle();
  const payload = { club_name: "19PokerClub", ...patch };
  const { error } = existing
    ? await supabase.from("club_settings").update(payload).eq("id", existing.id)
    : await supabase.from("club_settings").insert(payload);
  if (error) throw error;
}

/** Raccourci du cas le plus fréquent : enregistrer le thème du club. */
export async function saveClubTheme(theme) {
  return upsertClubSettings({ theme });
}
