import { supabase } from "./supabase.js";

/**
 * seating.js — attribution automatique et progressive des tables/sièges.
 *
 * Principe : on ne "crée" jamais de tables explicitement en base — le
 * nombre de tables actuellement "ouvertes" est recalculé à chaque
 * attribution à partir de l'état réel des inscriptions actives. Cela
 * évite tout état à synchroniser/désynchroniser.
 *
 * Règles :
 * - On démarre avec 4 tables ouvertes (1 à 4).
 * - Un nouveau joueur est placé au hasard sur une table ouverte qui a
 *   encore de la place, en évitant si possible la table du dernier
 *   joueur inscrit (jamais 2 inscriptions de suite à la même table).
 * - Dès qu'une table ouverte atteint 60% de sa capacité, on ouvre 2
 *   nouvelles tables. Le seuil suivant attend 2 tables SUPPLÉMENTAIRES
 *   à 60% (cumulatif) avant de rouvrir 2 tables de plus, et ainsi de
 *   suite jusqu'au nombre de tables maximum du tournoi.
 */

const FILL_THRESHOLD = 0.6;
const INITIAL_TABLES = 4;
const BATCH_SIZE = 2;

export async function computeSeatAssignment(tournament) {
  const perTable = tournament.players_per_table || 9;
  // Pas de plafond défini (ou 0) -> on se base sur Max Joueurs, sinon une
  // limite large qui ne bloquera jamais en pratique.
  const maxTables =
    tournament.max_tables && tournament.max_tables > 0
      ? tournament.max_tables
      : tournament.max_players
      ? Math.max(INITIAL_TABLES, Math.ceil(tournament.max_players / perTable))
      : 50;

  const [{ data: regs, error: regsErr }, { data: elims, error: elimsErr }] = await Promise.all([
    supabase.from("registrations").select("id, table_number, seat_number, registered_at").eq("tournament_id", tournament.id),
    supabase.from("eliminations").select("registration_id").eq("tournament_id", tournament.id).eq("undone", false),
  ]);
  if (regsErr) throw regsErr;
  if (elimsErr) throw elimsErr;
  const eliminatedIds = new Set((elims || []).map((e) => e.registration_id));
  const active = (regs || []).filter((r) => !eliminatedIds.has(r.id) && r.table_number);

  const countsByTable = {};
  for (const r of active) {
    countsByTable[r.table_number] = (countsByTable[r.table_number] || 0) + 1;
  }

  // Combien de tables sont actuellement ouvertes, en rejouant les paliers
  // de 60% déjà franchis.
  let openTables = Math.min(INITIAL_TABLES, maxTables);
  let batchesTriggered = 0;
  while (openTables < maxTables) {
    const tablesAt60 = Object.entries(countsByTable).filter(
      ([t, c]) => Number(t) <= openTables && c >= Math.ceil(perTable * FILL_THRESHOLD)
    ).length;
    const neededForNextBatch = 1 + batchesTriggered * BATCH_SIZE;
    if (tablesAt60 >= neededForNextBatch) {
      openTables = Math.min(openTables + BATCH_SIZE, maxTables);
      batchesTriggered += 1;
    } else break;
  }

  // Table du dernier joueur inscrit, à éviter si possible.
  const lastReg = [...active].sort((a, b) => new Date(b.registered_at) - new Date(a.registered_at))[0];
  const lastTable = lastReg?.table_number ?? null;

  function tablesWithRoom(upTo) {
    const list = [];
    for (let t = 1; t <= upTo; t++) {
      if ((countsByTable[t] || 0) < perTable) list.push(t);
    }
    return list;
  }

  let candidates = tablesWithRoom(openTables);
  if (candidates.length === 0 && openTables < maxTables) {
    // Filet de sécurité : toutes les tables ouvertes sont pleines sans
    // avoir déclenché l'ouverture suivante (ne devrait pas arriver avec
    // le calcul ci-dessus, mais on ne bloque jamais une inscription).
    openTables = Math.min(openTables + BATCH_SIZE, maxTables);
    candidates = tablesWithRoom(openTables);
  }

  let pool = candidates.filter((t) => t !== lastTable);
  if (pool.length === 0) pool = candidates;
  if (pool.length === 0) {
    // Toutes les tables (jusqu'au max) sont pleines : on déborde sur la
    // table suivante plutôt que d'échouer.
    const table = openTables + 1;
    return { table, seat: 1 };
  }

  const table = pool[Math.floor(Math.random() * pool.length)];
  const takenSeats = new Set(active.filter((r) => r.table_number === table).map((r) => r.seat_number));
  let seat = 1;
  while (takenSeats.has(seat) && seat <= perTable) seat += 1;

  return { table, seat };
}
