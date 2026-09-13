import { supabase } from "./supabase.js";

/**
 * points.js — classement par points avec formule libre façon BlindValet.
 *
 * Variables disponibles dans la formule (comme BlindValet) :
 *   p = nombre de joueurs        f = place finale
 *   b = buy-in (0, non utilisé)  c = coût total (0, non utilisé)
 *   k = knockouts                z = dotation (0, non utilisé)
 *   n = nombre d'entrées (avec réentrées si activé, sinon = p)
 *   x = balles utilisées (1 + rebuys du joueur)
 *   w = gains (0, non utilisé)   m = places payées (0, non utilisé)
 *   r = nombre de recaves        a = nombre d'addons
 *   t = type de tournoi (1 = standard, toujours 1 ici)
 *   d = tours depuis la table finale (1 par défaut)
 *
 * Fonctions dispo dans la formule : sqrt, log (=ln), log10, abs, pow, min, max, round, floor, ceil
 */

const DEFAULT_FORMULA = "100*sqrt(p/f)";

export function evaluateFormula(formulaText, vars) {
  try {
    const expr = (formulaText || DEFAULT_FORMULA).replace(/\^/g, "**");
    const helpers = {
      sqrt: Math.sqrt,
      log: Math.log,
      ln: Math.log,
      log10: Math.log10,
      abs: Math.abs,
      pow: Math.pow,
      min: Math.min,
      max: Math.max,
      round: Math.round,
      floor: Math.floor,
      ceil: Math.ceil,
    };
    const varNames = Object.keys(vars);
    const varValues = Object.values(vars);
    const helperNames = Object.keys(helpers);
    const helperValues = Object.values(helpers);
    // eslint-disable-next-line no-new-func
    const fn = new Function(...varNames, ...helperNames, `"use strict"; return (${expr});`);
    const result = fn(...varValues, ...helperValues);
    return Number.isFinite(result) ? Math.round(result * 100) / 100 : 0;
  } catch {
    return 0;
  }
}

export async function fetchChampionships() {
  const { data, error } = await supabase
    .from("championships")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createChampionship({ name, formulaText, bestStagesCount = null, countRebuysInRanking = false }) {
  const { data, error } = await supabase
    .from("championships")
    .insert({
      name,
      formula_text: formulaText || DEFAULT_FORMULA,
      best_stages_count: bestStagesCount,
      count_rebuys_in_ranking: countRebuysInRanking,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteChampionship(id) {
  const { error } = await supabase.from("championships").delete().eq("id", id);
  if (error) throw error;
}

export async function assignTournamentToChampionship(tournamentId, championshipId, stageLabel) {
  const { error } = await supabase
    .from("tournaments")
    .update({ championship_id: championshipId, stage_label: stageLabel })
    .eq("id", tournamentId);
  if (error) throw error;
}

// Points d'un joueur dans UN tournoi, selon la formule du championnat.
export function computeTournamentPoints({ formulaText, totalPlayers, totalEntries, position, koCount, rebuys, addons }) {
  return evaluateFormula(formulaText, {
    p: totalPlayers,
    f: position,
    b: 0,
    c: 0,
    k: koCount,
    z: 0,
    n: totalEntries,
    x: 1 + rebuys,
    w: 0,
    m: 0,
    r: rebuys,
    a: addons,
    t: 1,
    d: 1,
  });
}

// Classement général d'un championnat : cumule les points de chaque joueur
// sur tous les tournois (étapes) terminés qui lui sont rattachés.
export async function fetchChampionshipStandings(championshipId) {
  const { data: champ, error: champErr } = await supabase
    .from("championships")
    .select("*")
    .eq("id", championshipId)
    .single();
  if (champErr) throw champErr;

  const { data: stages, error: stagesErr } = await supabase
    .from("tournaments")
    .select("*")
    .eq("championship_id", championshipId);
  if (stagesErr) throw stagesErr;

  const standings = new Map();

  // Une requête par étape en parallèle (plutôt qu'en séquence) : avec des
  // dizaines d'étapes dans un même championnat, l'ancienne boucle
  // séquentielle devenait sensiblement plus lente à mesure que l'historique
  // du club grandissait.
  const stageData = await Promise.all(
    stages.map(async (stage) => {
      const [{ data: registrations }, { data: eliminations }] = await Promise.all([
        supabase.from("registrations").select("*, players(id, full_name)").eq("tournament_id", stage.id),
        supabase.from("eliminations").select("*").eq("tournament_id", stage.id).eq("undone", false),
      ]);
      return { stage, registrations: registrations || [], eliminations: eliminations || [] };
    })
  );

  for (const { stage, registrations, eliminations } of stageData) {
    if (registrations.length === 0) continue;

    const eliminatedIds = new Set(eliminations.map((e) => e.registration_id));
    const stillIn = registrations.filter((r) => !eliminatedIds.has(r.id));
    if (stillIn.length !== 1) continue; // seules les étapes terminées comptent

    const totalPlayers = registrations.length;
    const totalRebuys = registrations.reduce((s, r) => s + (r.rebuys || 0), 0);
    const totalEntries = champ.count_rebuys_in_ranking ? totalPlayers + totalRebuys : totalPlayers;

    const koCounts = new Map();
    eliminations.forEach((e) => {
      if (e.eliminated_by) koCounts.set(e.eliminated_by, (koCounts.get(e.eliminated_by) || 0) + 1);
    });
    const positionByReg = new Map();
    positionByReg.set(stillIn[0].id, 1);
    eliminations.forEach((e) => positionByReg.set(e.registration_id, e.finish_position));

    for (const reg of registrations) {
      const position = positionByReg.get(reg.id);
      const pts = computeTournamentPoints({
        formulaText: champ.formula_text,
        totalPlayers,
        totalEntries,
        position,
        koCount: koCounts.get(reg.id) || 0,
        rebuys: reg.rebuys || 0,
        addons: reg.addons || 0,
      });
      const playerId = reg.players?.id;
      const playerName = reg.players?.full_name || "?";
      if (!playerId) continue;
      if (!standings.has(playerId)) {
        standings.set(playerId, { playerId, name: playerName, totalPoints: 0, stagePoints: [] });
      }
      const entry = standings.get(playerId);
      entry.totalPoints += pts;
      entry.stagePoints.push({
        stageId: stage.id,
        stageLabel: stage.stage_label || stage.name,
        points: pts,
        position,
      });
    }
  }

  const bestN = champ.best_stages_count;
  let results = Array.from(standings.values());
  if (bestN) {
    results = results.map((r) => {
      const sorted = [...r.stagePoints].sort((a, b) => b.points - a.points).slice(0, bestN);
      return { ...r, totalPoints: Math.round(sorted.reduce((s, sp) => s + sp.points, 0) * 100) / 100 };
    });
  } else {
    results = results.map((r) => ({ ...r, totalPoints: Math.round(r.totalPoints * 100) / 100 }));
  }
  results.sort((a, b) => b.totalPoints - a.totalPoints);
  return { championship: champ, standings: results };
}

export { DEFAULT_FORMULA };
