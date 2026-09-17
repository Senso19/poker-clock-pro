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

/**
 * formatChips — abrège les montants de jetons : 10000 devient "10K",
 * 1500 "1,5K", 2000000 "2M". En dessous de 1000 rien ne change.
 *
 * Purement de l'affichage : la valeur enregistrée reste le nombre entier,
 * et les champs de saisie de la structure gardent la forme longue — on ne
 * peut pas taper "10K" dans un champ numérique.
 */
export function formatChips(value, compact = false) {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? "");
  if (!compact || Math.abs(n) < 1000) return String(n);

  let reduit = n / 1000;
  let suffixe = "K";
  // Un seul chiffre après la virgule, et pas de ",0" inutile.
  let arrondi = Math.round(reduit * 10) / 10;
  // 999 999 arrondirait à "1000K" : on passe alors au million.
  if (Math.abs(arrondi) >= 1000) {
    arrondi = Math.round((n / 1000000) * 10) / 10;
    suffixe = "M";
  }
  return `${String(arrondi).replace(".", ",")}${suffixe}`;
}

export function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
