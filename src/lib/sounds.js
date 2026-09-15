/**
 * sounds.js — sons d'alerte pour l'horloge (fin de niveau), synthétisés
 * directement via Web Audio API. Pas de fichiers audio à héberger, marche
 * hors-ligne, et évite tout souci de droits d'auteur (pas d'extraits de
 * voix ou de musique protégée — uniquement des tonalités génériques).
 */

let sharedCtx = null;
function getCtx() {
  if (!sharedCtx) sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (sharedCtx.state === "suspended") sharedCtx.resume();
  return sharedCtx;
}

function tone(ctx, { freq, start, duration, type = "sine", gain = 0.3, freqEnd = null }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freqEnd != null) osc.frequency.linearRampToValueAtTime(freqEnd, start + duration);
  g.gain.setValueAtTime(0, start);
  g.gain.linearRampToValueAtTime(gain, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, start + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

export const SOUND_OPTIONS = [
  { id: "none", label: "Aucun" },
  { id: "alarm", label: "Alarme (sirène)" },
  { id: "trumpet", label: "Trompette (fanfare)" },
  { id: "bell", label: "Cloche" },
  { id: "buzzer", label: "Buzzer" },
  { id: "chime", label: "Carillon" },
  { id: "gong", label: "Gong" },
  { id: "airhorn", label: "Corne de brume" },
  { id: "beep3", label: "3 bips" },
  { id: "custom", label: "🎵 Fichier importé…" },
];

export function playSound(id, customUrl) {
  if (!id || id === "none") return;
  if (id === "custom") {
    if (!customUrl) return;
    try {
      const audio = new Audio(customUrl);
      audio.play().catch(() => {});
    } catch {
      // pas bloquant
    }
    return;
  }
  try {
    const ctx = getCtx();
    const t0 = ctx.currentTime;
    switch (id) {
      case "alarm": {
        // Sirène deux tons alternés, façon alarme.
        for (let i = 0; i < 4; i++) {
          tone(ctx, { freq: 880, freqEnd: 660, start: t0 + i * 0.4, duration: 0.35, type: "sawtooth", gain: 0.25 });
        }
        break;
      }
      case "trumpet": {
        // Petite fanfare ascendante.
        const notes = [392, 523.25, 659.25, 783.99]; // sol-do-mi-sol
        notes.forEach((f, i) => tone(ctx, { freq: f, start: t0 + i * 0.15, duration: 0.35, type: "sawtooth", gain: 0.28 }));
        tone(ctx, { freq: 783.99, start: t0 + notes.length * 0.15, duration: 0.6, type: "sawtooth", gain: 0.3 });
        break;
      }
      case "bell": {
        tone(ctx, { freq: 880, start: t0, duration: 1.2, type: "sine", gain: 0.35 });
        tone(ctx, { freq: 1760, start: t0, duration: 0.9, type: "sine", gain: 0.15 });
        break;
      }
      case "buzzer": {
        tone(ctx, { freq: 150, start: t0, duration: 0.5, type: "square", gain: 0.3 });
        tone(ctx, { freq: 150, start: t0 + 0.55, duration: 0.5, type: "square", gain: 0.3 });
        break;
      }
      case "chime": {
        const notes = [1046.5, 1318.5, 1568]; // do-mi-sol aigu
        notes.forEach((f, i) => tone(ctx, { freq: f, start: t0 + i * 0.2, duration: 0.8, type: "sine", gain: 0.25 }));
        break;
      }
      case "gong": {
        tone(ctx, { freq: 110, start: t0, duration: 2.2, type: "triangle", gain: 0.35 });
        tone(ctx, { freq: 165, start: t0, duration: 1.8, type: "triangle", gain: 0.15 });
        break;
      }
      case "airhorn": {
        tone(ctx, { freq: 300, start: t0, duration: 0.9, type: "sawtooth", gain: 0.32 });
        tone(ctx, { freq: 305, start: t0, duration: 0.9, type: "sawtooth", gain: 0.28 });
        break;
      }
      case "beep3": {
        for (let i = 0; i < 3; i++) tone(ctx, { freq: 1000, start: t0 + i * 0.25, duration: 0.15, type: "square", gain: 0.25 });
        break;
      }
      default:
        break;
    }
  } catch {
    // Web Audio indisponible (rare) — pas bloquant.
  }
}
