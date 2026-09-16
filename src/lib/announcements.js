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
