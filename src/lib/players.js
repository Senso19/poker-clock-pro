/**
 * players.js — nom affiché d'une inscription, et tri des listes de joueurs.
 *
 * Centralisé ici parce que le libellé se reconstruit à partir de plusieurs
 * tables jointes et que plusieurs écrans le refaisaient chacun de leur
 * côté, avec des ordres de priorité différents — d'où des listes classées
 * différemment d'un écran à l'autre.
 */
export function playerLabel(registration) {
  const r = registration || {};
  return r.players?.pseudo || r.accounts?.pseudo || r.players?.full_name || "";
}

/**
 * Tri alphabétique sur le pseudo affiché. Fait côté app et pas en SQL :
 * le libellé vient de plusieurs tables jointes, et localeCompare("fr")
 * classe correctement les accents, là où l'ordre SQL par défaut place
 * "Émile" après "Zoé".
 */
export function sortByPlayerLabel(list) {
  return (list || [])
    .slice()
    .sort((a, b) => playerLabel(a).localeCompare(playerLabel(b), "fr", { sensitivity: "base" }));
}
