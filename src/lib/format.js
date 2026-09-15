/**
 * format.js — petits utilitaires de formatage partagés entre composants
 * (évite la duplication, ex: formatTime était dupliqué à l'identique dans
 * EditableClock.jsx et MobileClockView.jsx).
 */
export function formatTime(s) {
  const total = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
