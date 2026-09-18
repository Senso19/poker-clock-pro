import { supabase } from "./supabase.js";
import { logEvent } from "./events.js";
import { addAnnouncement } from "./announcements.js";
import { playerLabel } from "./players.js";

/**
 * tableBalance.js — tout ce qui décide QUI doit changer de table, et qui
 * applique ces déplacements.
 *
 * Ces calculs vivaient dans l'onglet Joueurs. Ils n'y existaient donc que
 * lorsque cet onglet était affiché : éliminer un joueur depuis l'onglet
 * Tables ne déclenchait aucune proposition tant qu'on n'était pas repassé
 * par Joueurs. Ils sont ici pour que la page du tournoi puisse les faire
 * tourner en permanence, quel que soit l'onglet ouvert.
 *
 * Deux règles, et elles ne déplacent JAMAIS les joueurs qui ne sont pas
 * concernés :
 *  1) Casser une table : si le nombre de tables utilisées dépasse le
 *     nombre cible (assez d'éliminations pour s'en passer), on ferme la
 *     table la moins garnie et on ne déplace QUE ses joueurs, répartis
 *     sur des sièges vides des autres tables.
 *  2) Réoptimiser un écart : si aucune table n'est à casser mais l'écart
 *     entre la table la plus et la moins garnie atteint 2 joueurs ou
 *     plus, on déplace UN seul joueur de la table la plus garnie vers la
 *     moins garnie (répété si besoin), jusqu'à ce que l'écart ne dépasse
 *     plus 1 — les autres joueurs des deux tables ne bougent pas.
 */

export function computeTargetTableCount(activeCount, perTable, finalTableSize) {
  if (activeCount <= finalTableSize) return 1;
  return Math.max(1, Math.ceil(activeCount / perTable));
}

/**
 * Les joueurs encore en jeu ET assis, regroupés par numéro de table.
 * "eliminations" accepte aussi bien les lignes de la table eliminations
 * qu'un Set d'identifiants d'inscription déjà constitué.
 */
export function groupActiveByTable(registrations, eliminations) {
  const eliminatedIds =
    eliminations instanceof Set ? eliminations : new Set((eliminations || []).map((e) => e.registration_id));
  const active = (registrations || []).filter((r) => !eliminatedIds.has(r.id) && r.table_number);
  const byTable = {};
  active.forEach((r) => {
    if (!byTable[r.table_number]) byTable[r.table_number] = [];
    byTable[r.table_number].push(r);
  });
  return { active, byTable };
}

export function findFreeSeat(occupied, table, perTable) {
  for (let seat = 1; seat <= perTable; seat++) {
    const key = `${table}-${seat}`;
    if (!occupied.has(key)) return seat;
  }
  return null;
}

export function computeBreakMoves({ registrations, eliminations, perTable = 9, finalTableSize }) {
  const taille = finalTableSize || perTable;
  const { active, byTable } = groupActiveByTable(registrations, eliminations);
  if (active.length === 0) return [];
  const usedTables = Object.keys(byTable).map(Number).sort((a, b) => a - b);
  if (usedTables.length === 0) return [];
  const targetCount = computeTargetTableCount(active.length, perTable, taille);
  if (usedTables.length <= targetCount) return [];

  // On privilégie toujours de casser la table au numéro le plus élevé
  // (la table 1 est la dernière qu'on cassera), même si elle est
  // complète — tant que les autres tables ont assez de sièges libres
  // pour absorber tous ses joueurs. Sinon on essaie la suivante par
  // ordre décroissant.
  const occupied = new Set(active.map((r) => `${r.table_number}-${r.seat_number}`));
  const descTables = [...usedTables].sort((a, b) => b - a);
  let breakTable = null;
  for (const t of descTables) {
    const others = usedTables.filter((o) => o !== t);
    const freeCapacity = others.reduce((sum, o) => sum + (perTable - byTable[o].length), 0);
    if (byTable[t].length <= freeCapacity) {
      breakTable = t;
      break;
    }
  }
  if (breakTable == null) return [];

  const moves = [];
  const destTables = usedTables.filter((t) => t !== breakTable);
  const counts = {};
  destTables.forEach((t) => (counts[t] = byTable[t].length));
  byTable[breakTable].forEach((reg) => {
    const dest = destTables.reduce((min, t) => (counts[t] < counts[min] ? t : min), destTables[0]);
    occupied.delete(`${reg.table_number}-${reg.seat_number}`);
    const seat = findFreeSeat(occupied, dest, perTable);
    if (seat == null) return;
    occupied.add(`${dest}-${seat}`);
    counts[dest] += 1;
    moves.push({ reg, fromTable: reg.table_number, fromSeat: reg.seat_number, toTable: dest, toSeat: seat });
  });
  return moves;
}

export function computeRebalanceMoves({ registrations, eliminations, perTable = 9 }) {
  const { active, byTable } = groupActiveByTable(registrations, eliminations);
  if (active.length === 0) return [];
  const usedTables = Object.keys(byTable).map(Number);
  if (usedTables.length === 0) return [];
  const occupied = new Set(active.map((r) => `${r.table_number}-${r.seat_number}`));

  // Réoptimise l'écart entre la table la plus et la moins garnie, un
  // joueur à la fois. La table source est choisie AU HASARD parmi les
  // tables actuellement au maximum de joueurs — jamais une table déjà
  // sous ce maximum, pour ne jamais créer un nouveau déséquilibre à
  // peine celui-ci corrigé.
  const tablesState = usedTables.map((t) => ({ t, players: [...byTable[t]] }));
  const moves = [];
  let guard = 0;
  while (guard++ < 200) {
    const counts = tablesState.map((s) => s.players.length);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    if (max - min < 2) break;
    const maxTables = tablesState.filter((s) => s.players.length === max);
    const maxT = maxTables[Math.floor(Math.random() * maxTables.length)];
    const minT = tablesState.reduce((a, b) => (b.players.length < a.players.length ? b : a));
    const reg = maxT.players[maxT.players.length - 1];
    occupied.delete(`${reg.table_number}-${reg.seat_number}`);
    const seat = findFreeSeat(occupied, minT.t, perTable);
    if (seat == null) break;
    occupied.add(`${minT.t}-${seat}`);
    moves.push({ reg, fromTable: reg.table_number, fromSeat: reg.seat_number, toTable: minT.t, toSeat: seat });
    maxT.players.pop();
    minT.players.push(reg);
  }
  return moves;
}

/**
 * Écrit les déplacements en base, journalise l'action (pour pouvoir
 * l'annuler depuis le Journal de tournoi) et annonce chaque joueur
 * déplacé. Renvoie la liste des déplacements avec le nom affiché, pour
 * que l'appelant puisse en faire des messages de bas de page.
 */
export async function applyTableMoves({ tournamentId, moves, kind, label }) {
  // Instantané AVANT le déplacement, pour permettre d'annuler
  // précisément depuis le Journal de tournoi.
  const before = moves.map((m) => ({ registrationId: m.reg.id, table_number: m.fromTable, seat_number: m.fromSeat }));
  await Promise.all(
    moves.map((m) => supabase.from("registrations").update({ table_number: m.toTable, seat_number: m.toSeat }).eq("id", m.reg.id))
  );
  logEvent(tournamentId, kind, label, { before });
  return moves.map((m) => {
    const nom = playerLabel(m.reg) || m.reg.players?.full_name;
    addAnnouncement(tournamentId, `${nom} déplacé Table ${m.toTable} Siège ${m.toSeat}`, "move");
    return { regId: m.reg.id, nom, toTable: m.toTable, toSeat: m.toSeat };
  });
}
