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

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
