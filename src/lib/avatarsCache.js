import { supabase } from "./supabase.js";

/**
 * avatarsCache.js — les photos des membres, chargées à part et rarement.
 *
 * Un avatar est une image en base64 stockée dans la colonne : ~92 ko en
 * moyenne, 189 ko pour la plus grosse. Les joindre aux inscriptions
 * multiplie par SEIZE le poids d'un sondage — mesuré sur un tournoi de 80
 * inscrits : 493 ko avec les avatars, 31 ko sans.
 *
 * Or ces images ne changent quasiment jamais en cours de partie, alors que
 * les inscriptions sont relues toutes les cinq secondes par chaque écran
 * ouvert. On ne demande donc que les avatars encore inconnus, et on refait
 * le tour complet toutes les AVATARS_REFRESH_MS pour qu'un membre qui
 * change de photo finisse par apparaître sans rechargement de page.
 *
 * Le cache est partagé par toute l'application : l'horloge de la salle et
 * la vue des tables regardent les mêmes comptes, il n'y a aucune raison de
 * les demander deux fois.
 */

// Cinq minutes : assez rare pour ne plus rien peser, assez fréquent pour
// qu'un changement de photo apparaisse sans rechargement.
export const AVATARS_REFRESH_MS = 300000;

const parCompte = new Map();
let dernierTourComplet = 0;

/** Vide le cache. Sert aux jeux d'essai, et après un changement de photo. */
export function oublierAvatars() {
  parCompte.clear();
  dernierTourComplet = 0;
}

export function avatarDe(accountId) {
  return (accountId && parCompte.get(accountId)) || null;
}

/**
 * Charge les avatars manquants pour ces comptes. Ne demande rien si tout
 * est déjà connu et que le tour complet n'est pas dû.
 */
export async function chargerAvatars(idsComptes, maintenant = Date.now()) {
  const ids = [...new Set((idsComptes || []).filter(Boolean))];
  if (ids.length === 0) return;
  const tourComplet = maintenant - dernierTourComplet > AVATARS_REFRESH_MS;
  const aDemander = ids.filter((id) => tourComplet || !parCompte.has(id));
  if (aDemander.length === 0) return;
  const { data } = await supabase.from("accounts").select("id, avatar_data").in("id", aDemander);
  for (const compte of data || []) parCompte.set(compte.id, compte.avatar_data || null);
  if (tourComplet) dernierTourComplet = maintenant;
}

/**
 * Réinjecte l'avatar dans des lignes d'inscription, sous la forme que
 * produisait la jointure — pour que tout ce qui lit `.accounts.avatar_data`
 * continue de marcher sans être réécrit.
 */
export function avecAvatars(lignes) {
  return (lignes || []).map((r) =>
    r ? { ...r, accounts: { ...(r.accounts || {}), avatar_data: avatarDe(r.account_id) } } : r
  );
}
