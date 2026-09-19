import { supabase } from "./supabase.js";
import { echelleDesBlinds, plusPetitJeton, defaultChipSet } from "./chips.js";
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

/**
 * Remplace toute la structure existante par la liste fournie (ordre =
 * position), en UNE transaction côté Postgres.
 *
 * C'était auparavant un DELETE puis un INSERT en deux allers-retours.
 * Entre les deux, la table est vide : une coupure réseau à cet instant
 * laissait le tournoi sans structure. Négligeable tant qu'on enregistrait
 * à la main, beaucoup moins depuis que l'éditeur enregistre tout seul à
 * chaque pause de saisie, pendant un tournoi en cours.
 */
export async function saveLevels(tournamentId, levels) {
  // Pas de tournament_id par ligne : la fonction le reçoit en paramètre et
  // l'applique à toutes, ce qui interdit d'écrire dans un autre tournoi.
  const rows = levels.map((l, i) => ({
    position: i,
    small_blind: l.isBreak ? 0 : Number(l.smallBlind) || 0,
    big_blind: l.isBreak ? 0 : Number(l.bigBlind) || 0,
    ante: l.isBreak ? 0 : Number(l.ante) || 0,
    duration_minutes: Number(l.durationMinutes) || 20,
    is_break: !!l.isBreak,
    break_label: l.isBreak ? l.breakLabel || "Pause" : null,
  }));

  const { error } = await supabase.rpc("remplacer_structure_blinds", {
    p_tournament_id: tournamentId,
    p_rows: rows,
  });
  if (error) throw error;
}

export function defaultStructure() {
  return [
    { smallBlind: 25, bigBlind: 50, ante: 0, durationMinutes: 20 },
    { smallBlind: 50, bigBlind: 100, ante: 0, durationMinutes: 20 },
    { smallBlind: 100, bigBlind: 200, ante: 0, durationMinutes: 20 },
    { isBreak: true, breakLabel: "Pause 10 min", durationMinutes: 10 },
    // L'ante vaut la grosse blind, comme partout ailleurs dans
    // l'application — et comme la colonne Ante le propose par défaut.
    { smallBlind: 150, bigBlind: 300, ante: 300, durationMinutes: 20 },
    { smallBlind: 200, bigBlind: 400, ante: 400, durationMinutes: 20 },
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

// L'échelle des blinds n'est plus une constante : elle dépend des jetons
// dont le club dispose (voir chips.js). Un jeu qui démarre à 100 ne doit
// pas produire de niveau 25/50, ni de 250 qui demanderait des jetons de 50.


function nearestLadderIndex(val, echelle) {
  let bestIdx = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < echelle.length; i++) {
    const diff = Math.abs(echelle[i] - val);
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
    // Le jeu de jetons du club : c'est lui qui décide des blinds possibles
    // et du premier niveau (voir chips.js).
    chipSet: defaultChipSet(),
    chipCounts: {},
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
/**
 * Total des jetons qui finiront sur les tables : c'est lui qui dit où la
 * structure doit s'arrêter. Les recaves, réentrées et add-ons ne comptent
 * que s'ils sont permis — dans un freezeout, leurs champs gardent des
 * valeurs par défaut qui gonfleraient le total pour rien.
 */
export function totalChipsInPlay(config) {
  const fieldVal = (k) => Number(config.fields?.[k]?.value) || 0;
  const players = Number(config.expectedPlayers) || 0;
  let total = players * fieldVal("startingStack");
  if (config.tournamentType === "rebuy") {
    total += fieldVal("expectedReentries") * fieldVal("reentryChips");
    total += fieldVal("expectedRebuys") * fieldVal("rebuyChips");
    total += fieldVal("expectedAddons") * fieldVal("addonChips");
  }
  return total;
}

export function generateBlindLevels(config) {
  // L'échelle et le premier niveau découlent du jeu de jetons : un club
  // dont la plus petite coupure est 100 commence à 100/200.
  const jeu = config.chipSet?.length ? config.chipSet : defaultChipSet();
  const echelle = echelleDesBlinds(jeu);
  const startingSmallBlind = Number(config.fields?.startingSmallBlind?.value) || plusPetitJeton(jeu);
  const minutesPerLevel = Number(config.fields?.minutesPerLevel?.value) || 20;
  const durationHours = Number(config.durationHours) || 4;
  const antesEnabled = !!config.antesEnabled;
  const anteType = config.anteType || "bb";

  // La durée prévue donne le NOMBRE de niveaux.
  const numberOfLevels = Math.max(6, Math.round((durationHours * 60) / (minutesPerLevel || 20)));
  const startIdx = nearestLadderIndex(startingSmallBlind, echelle);

  // Le tapis de départ et le nombre de joueurs donnent, eux, le POINT
  // D'ARRIVÉE — c'est ce qui manquait : la structure montait d'un facteur
  // fixe, indifférente au fait qu'on distribue 5 000 jetons à 12 joueurs
  // ou 30 000 à 80.
  //
  // Un tournoi se termine quand les tapis restants ne pèsent plus que
  // quelques grosses blinds. En visant une dernière grosse blind autour du
  // total des jetons divisé par 20, la fin tombe à peu près au moment où
  // la durée prévue s'achève.
  //
  // Avec des antes, chaque main coûte plus cher : les tapis fondent plus
  // vite et la fin arrive plus tôt dans la structure. On vise alors une
  // dernière blind plus basse, sinon les derniers niveaux ne sont jamais
  // joués.
  const totalChips = totalChipsInPlay(config);
  const diviseurFinal = antesEnabled ? 28 : 20;
  let endIdx;
  if (totalChips > 0) {
    endIdx = nearestLadderIndex(totalChips / diviseurFinal / 2, echelle);
  } else {
    // Sans joueurs ni tapis renseignés, on retombe sur l'ancien repère :
    // une progression d'environ x120 sur l'ensemble de la structure.
    endIdx = startIdx + Math.round(numberOfLevels * 1.8);
  }
  // Chaque niveau doit monter : il faut au moins autant de paliers que de
  // niveaux, et jamais plus que l'échelle n'en contient.
  endIdx = Math.max(endIdx, startIdx + numberOfLevels - 1);
  endIdx = Math.min(endIdx, echelle.length - 1);

  const levels = [];
  let idx = startIdx;
  for (let i = 0; i < numberOfLevels; i++) {
    const frac = numberOfLevels > 1 ? i / (numberOfLevels - 1) : 0;
    let targetIdx = Math.round(startIdx + frac * (endIdx - startIdx));
    if (i > 0 && targetIdx <= idx) targetIdx = idx + 1;
    targetIdx = Math.min(targetIdx, echelle.length - 1);
    idx = targetIdx;

    const sb = echelle[idx];
    const bb = sb * 2;
    let ante = 0;
    if (antesEnabled && i > 0) {
      ante = anteType === "sb" ? sb : bb;
    }
    levels.push({ smallBlind: sb, bigBlind: bb, ante, durationMinutes: minutesPerLevel });
  }
  return levels;
}
