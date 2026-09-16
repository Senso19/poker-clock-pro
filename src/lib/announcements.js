import { supabase } from "./supabase.js";

/**
 * announcements.js — annonces d'un tournoi, partagées entre tous les
 * écrans (gestion des joueurs, horloge...). Toute action pertinente
 * (élimination, déplacement de joueur, pause imminente...) écrit ici, et
 * le panneau Annonces de l'horloge affiche les plus récentes. Les notes
 * manuelles de l'admin passent par le même mécanisme (kind: "manual").
 */
export async function addAnnouncement(tournamentId, text, kind = "manual") {
  if (!tournamentId || !text?.trim()) return;
  try {
    await supabase.from("tournament_announcements").insert({ tournament_id: tournamentId, text: text.trim(), kind });
    // Purge légère et occasionnelle (pas à chaque appel) des annonces
    // "ticker" de plus de 24h, pour que la table ne grossisse pas sans
    // fin. On ne touche jamais aux lignes "draw"/"draw_stop" : elles
    // doivent rester tant que l'admin n'a pas explicitement arrêté le
    // défilement du tirage.
    if (Math.random() < 0.1) {
      const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      await supabase
        .from("tournament_announcements")
        .delete()
        .eq("tournament_id", tournamentId)
        .lt("created_at", cutoff)
        .not("kind", "in", "(draw,draw_stop)");
    }
  } catch {
    // une annonce ratée ne doit jamais bloquer l'action principale
  }
}

export async function fetchRecentAnnouncements(tournamentId, limit = 20) {
  if (!tournamentId) return [];
  const { data, error } = await supabase
    .from("tournament_announcements")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  return data || [];
}
