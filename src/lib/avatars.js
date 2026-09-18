/**
 * avatars.js — pastille de secours quand un joueur n'a pas de photo.
 *
 * La couleur est tirée du nom, pas au hasard : le même joueur garde la
 * même pastille d'un écran à l'autre, ce qui aide à le repérer dans une
 * liste. Les trois écrans qui en avaient besoin en portaient chacun leur
 * copie — donc trois palettes à tenir en phase à la main.
 */
export const AVATAR_COLORS = ["#C9A15A", "#8C3A3A", "#3A6B8C", "#3A8C5E", "#8C5A3A", "#6B3A8C"];

export function avatarColor(name) {
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

/**
 * Les trois copies avaient divergé sur un point : pour un pseudo en un
 * seul mot, deux écrans affichaient une lettre et "Inscrire un joueur"
 * en affichait deux. Le paramètre garde ce choix à l'appelant plutôt que
 * de changer l'apparence d'un écran au passage — c'est une unification de
 * code, pas une refonte visuelle.
 */
export function initials(name, lettresSiUnSeulMot = 1) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, lettresSiUnSeulMot).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
