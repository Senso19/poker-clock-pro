import { supabase } from "./supabase.js";
export { fetchActiveTournament } from "./tournaments.js";

/**
 * levels.js — chargement/sauvegarde de la structure de blinds pour un tournoi.
 */

export async function fetchLevels(tournamentId) {
  const { data, error } = await supabase
    .from("blind_levels")
    .select("*")
    .eq("tournament_id", tournamentId)
    .order("position", { ascending: true });
  if (error) throw error;
  return (data || []).map((l) => ({
    id: l.id,
    smallBlind: l.small_blind,
    bigBlind: l.big_blind,
    ante: l.ante,
    durationMinutes: l.duration_minutes,
    isBreak: l.is_break,
    breakLabel: l.break_label,
  }));
}

// Remplace toute la structure existante par la liste fournie (ordre = position)
export async function saveLevels(tournamentId, levels) {
  const { error: delErr } = await supabase
    .from("blind_levels")
    .delete()
    .eq("tournament_id", tournamentId);
  if (delErr) throw delErr;

  if (levels.length === 0) return;

  const rows = levels.map((l, i) => ({
    tournament_id: tournamentId,
    position: i,
    small_blind: l.isBreak ? 0 : Number(l.smallBlind) || 0,
    big_blind: l.isBreak ? 0 : Number(l.bigBlind) || 0,
    ante: l.isBreak ? 0 : Number(l.ante) || 0,
    duration_minutes: Number(l.durationMinutes) || 20,
    is_break: !!l.isBreak,
    break_label: l.isBreak ? l.breakLabel || "Pause" : null,
  }));

  const { error: insErr } = await supabase.from("blind_levels").insert(rows);
  if (insErr) throw insErr;
}

export function defaultStructure() {
  return [
    { smallBlind: 25, bigBlind: 50, ante: 0, durationMinutes: 20 },
    { smallBlind: 50, bigBlind: 100, ante: 0, durationMinutes: 20 },
    { smallBlind: 75, bigBlind: 150, ante: 0, durationMinutes: 20 },
    { isBreak: true, breakLabel: "Pause 10 min", durationMinutes: 10 },
    { smallBlind: 100, bigBlind: 200, ante: 25, durationMinutes: 20 },
    { smallBlind: 150, bigBlind: 300, ante: 25, durationMinutes: 20 },
  ];
}

export async function fetchStructureTemplates() {
  const { data, error } = await supabase
    .from("structure_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function saveStructureTemplate(name, levels, structureConfig = null) {
  const { data, error } = await supabase
    .from("structure_templates")
    .insert({ name, levels, structure_config: structureConfig })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteStructureTemplate(id) {
  const { error } = await supabase.from("structure_templates").delete().eq("id", id);
  if (error) throw error;
}

export async function updateStructureTemplate(id, name, levels, structureConfig = null) {
  const { error } = await supabase
    .from("structure_templates")
    .update({ name, levels, structure_config: structureConfig })
    .eq("id", id);
  if (error) throw error;
}

// --- Configuration "façon BlindValet" : paramètres à gauche (Joueurs
// anticipés, Durée prévue, etc.) qui pilotent les champs calculables
// (icône calculatrice = valeur auto, icône crayon = valeur manuelle), et
// génération automatique de la structure de blinds à partir de ces
// paramètres. Persisté sur tournaments.structure_config (et repris tel
// quel dans structure_templates.structure_config pour les modèles).

export async function fetchStructureConfig(tournamentId) {
  const { data, error } = await supabase
    .from("tournaments")
    .select("structure_config")
    .eq("id", tournamentId)
    .maybeSingle();
  if (error) throw error;
  return data?.structure_config || null;
}

export async function saveStructureConfig(tournamentId, config) {
  const { error } = await supabase
    .from("tournaments")
    .update({ structure_config: config })
    .eq("id", tournamentId);
  if (error) throw error;
}

const CHIP_LADDER = [
  25, 50, 75, 100, 125, 150, 175, 200, 250, 300, 350, 400, 500, 600, 700, 800, 1000, 1200, 1500, 1800, 2000, 2500,
  3000, 4000, 5000, 6000, 8000, 10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000, 60000, 80000, 100000, 125000,
  150000, 200000, 250000, 300000, 400000, 500000,
];

function nearestLadderIndex(val) {
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < CHIP_LADDER.length; i++) {
    const diff = Math.abs(CHIP_LADDER[i] - val);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }
  return bestIdx;
}

const AUTO_FIELD_KEYS = [
  "startingSmallBlind",
  "startingStack",
  "minutesPerLevel",
  "expectedReentries",
  "reentryChips",
  "expectedRebuys",
  "rebuyChips",
  "expectedAddons",
  "addonChips",
];

// Calcule la valeur automatique d'un champ à partir des paramètres pilotes
// (joueurs anticipés) et des autres champs déjà calculés dans `config`.
// Heuristique simplifiée, pas une reproduction exacte de BlindValet.
export function computeAutoValue(key, config) {
  const players = Number(config.expectedPlayers) || 0;
  const fieldVal = (k) => Number(config.fields?.[k]?.value) || 0;
  switch (key) {
    case "startingSmallBlind":
      return 25;
    case "startingStack":
      return 5000;
    case "minutesPerLevel":
      return 20;
    case "expectedReentries":
      return Math.round(players * 0.33);
    case "reentryChips":
      return (fieldVal("startingStack") || 5000) * 4;
    case "expectedRebuys":
      return players;
    case "rebuyChips":
      return (fieldVal("startingSmallBlind") || 25) * 20;
    case "expectedAddons":
      return Math.round(players * 0.75);
    case "addonChips":
      return Math.round(((fieldVal("startingStack") || 5000) * 1.7) / 100) * 100;
    default:
      return 0;
  }
}

export function defaultStructureConfig() {
  const config = {
    expectedPlayers: 20,
    durationHours: 4,
    tournamentType: "freezeout",
    antesEnabled: true,
    anteType: "bb",
    halfAnteIfFewPlayers: false,
    keepAntesHeadsUp: false,
    fields: {},
  };
  for (const key of AUTO_FIELD_KEYS) {
    config.fields[key] = { mode: "auto", value: computeAutoValue(key, config) };
  }
  return config;
}

// Recalcule tous les champs actuellement en mode "auto" (calculatrice),
// dans l'ordre de dépendance, en laissant intacts les champs en mode
// "manuel" (crayon).
export function recomputeAutoFields(config) {
  const next = { ...config, fields: { ...config.fields } };
  for (const key of AUTO_FIELD_KEYS) {
    const current = next.fields[key] || { mode: "auto", value: 0 };
    if (current.mode !== "manual") {
      next.fields[key] = { mode: "auto", value: computeAutoValue(key, next) };
    }
  }
  return next;
}

// Génère une structure de blinds complète à partir de la config (utilise
// les valeurs effectives des champs, qu'ils soient auto ou manuels).
// Avance sur l'échelle de jetons par INDEX (jamais par valeur arrondie) afin
// que chaque niveau soit strictement supérieur au précédent — deux niveaux
// consécutifs ne peuvent donc jamais se retrouver identiques, même quand la
// progression géométrique brute retombe sur le même palier arrondi.
export function generateBlindLevels(config) {
  const startingSmallBlind = Number(config.fields?.startingSmallBlind?.value) || 25;
  const minutesPerLevel = Number(config.fields?.minutesPerLevel?.value) || 20;
  const durationHours = Number(config.durationHours) || 4;
  const antesEnabled = !!config.antesEnabled;
  const anteType = config.anteType || "bb";

  const numberOfLevels = Math.max(6, Math.round((durationHours * 60) / (minutesPerLevel || 20)));
  const startIdx = nearestLadderIndex(startingSmallBlind);
  // Vise une multiplication d'environ x120 sur toute la structure (repère
  // usuel pour une structure de tournoi), sans jamais dépasser l'échelle.
  const spanTarget = Math.round(numberOfLevels * 1.8);
  const endIdx = Math.min(CHIP_LADDER.length - 1, startIdx + Math.max(spanTarget, numberOfLevels));

  const levels = [];
  let idx = startIdx;
  for (let i = 0; i < numberOfLevels; i++) {
    const frac = numberOfLevels > 1 ? i / (numberOfLevels - 1) : 0;
    let targetIdx = Math.round(startIdx + frac * (endIdx - startIdx));
    if (i > 0 && targetIdx <= idx) targetIdx = idx + 1;
    targetIdx = Math.min(targetIdx, CHIP_LADDER.length - 1);
    idx = targetIdx;

    const sb = CHIP_LADDER[idx];
    const bb = sb * 2;
    let ante = 0;
    if (antesEnabled && i > 0) {
      ante = anteType === "sb" ? sb : bb;
    }
    levels.push({ smallBlind: sb, bigBlind: bb, ante, durationMinutes: minutesPerLevel });
  }
  return levels;
}
