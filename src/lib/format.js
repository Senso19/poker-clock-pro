/**
 * format.js — petits utilitaires partagés entre composants (évite la
 * duplication, ex: formatTime et clamp étaient dupliqués à l'identique
 * dans plusieurs fichiers).
 */
export function formatTime(s) {
  const total = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

// Compte à rebours long (jusqu'à 24h) : HH:MM:SS. formatTime ne convient
// pas ici — il n'affiche que des minutes, ce qui suffit pour la durée d'un
// niveau mais pas pour un rebours avant le début du tournoi.
export function formatCountdown(s) {
  const total = Math.max(0, Math.floor(s || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
