/**
 * chatVisiteur.js — le pseudo que se donne un visiteur pour écrire.
 *
 * Quelqu'un qui arrive avec le lien du site peut parler dans le chat, mais
 * pas anonymement : un message sans nom ne veut rien dire pour ceux qui le
 * lisent. Il se donne donc un pseudo, gardé sur SON appareil — jamais en
 * base — pour qu'il n'ait pas à le retaper à chaque message.
 *
 * Il s'efface au bout de 24 heures. Le visiteur d'un soir ne doit pas
 * retrouver son pseudo des semaines plus tard sur un appareil partagé, et
 * un pseudo abandonné redevient disponible.
 */
const CLE = "pcp_pseudo_visiteur";
export const DUREE_PSEUDO_VISITEUR_MS = 24 * 60 * 60 * 1000;

export function lirePseudoVisiteur(maintenant = Date.now()) {
  try {
    const brut = localStorage.getItem(CLE);
    if (!brut) return null;
    const { pseudo, expire } = JSON.parse(brut);
    if (!pseudo || !expire || maintenant >= expire) {
      localStorage.removeItem(CLE);
      return null;
    }
    return pseudo;
  } catch {
    // Navigation privée, stockage refusé, contenu abîmé : on fait comme
    // s'il n'y avait pas de pseudo. Le visiteur le redonnera.
    return null;
  }
}

export function enregistrerPseudoVisiteur(pseudo, maintenant = Date.now()) {
  const propre = String(pseudo || "").trim().slice(0, 24);
  if (!propre) return null;
  try {
    localStorage.setItem(CLE, JSON.stringify({ pseudo: propre, expire: maintenant + DUREE_PSEUDO_VISITEUR_MS }));
  } catch {
    /* le pseudo vaudra pour cette page seulement */
  }
  return propre;
}

export function oublierPseudoVisiteur() {
  try {
    localStorage.removeItem(CLE);
  } catch {
    /* rien à faire */
  }
}
