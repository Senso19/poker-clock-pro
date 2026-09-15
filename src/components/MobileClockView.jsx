import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { fetchCurrentTournament } from "../lib/tournaments.js";
import { saveClockState } from "../lib/clockState.js";
import { canControlClock } from "../lib/auth.js";
import { formatTime } from "../lib/format.js";
import { useAccount } from "../context/AccountContext.jsx";

// Avance le niveau/temps restant d'un nombre de secondes écoulées, comme
// dans EditableClock (pour rattraper l'horloge après une absence).
function advanceForElapsed(levelIndex, secondsLeft, elapsedSeconds, levels) {
  let idx = levelIndex;
  let left = secondsLeft;
  let remaining = Math.round(elapsedSeconds);
  while (remaining > 0 && idx < levels.length) {
    if (remaining < left) {
      left -= remaining;
      remaining = 0;
    } else {
      remaining -= left;
      idx += 1;
      left = (levels[idx]?.durationMinutes || 20) * 60;
    }
  }
  if (idx >= levels.length) {
    idx = Math.max(0, levels.length - 1);
    left = 0;
  }
  return { levelIndex: idx, secondsLeft: left };
}


/**
 * MobileClockView — écran d'horloge simplifié pour téléphone : une seule
 * colonne qui défile, gros chiffres, gros boutons tactiles, sans les
 * panneaux en glisser-déposer (pensés pour un écran de TV/vidéoprojecteur
 * et peu adaptés à un petit écran tactile).
 */
export default function MobileClockView({ levels }) {
  const { account } = useAccount();
  const canEdit = canControlClock(account.role);

  const [tournamentId, setTournamentId] = useState(null);
  const [levelIndex, setLevelIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState((levels[0]?.durationMinutes || 20) * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [registrations, setRegistrations] = useState([]);
  const [eliminations, setEliminations] = useState([]);
  const [showStructure, setShowStructure] = useState(false);
  const intervalRef = useRef(null);
  const clockStateRef = useRef({ levelIndex: 0, secondsLeft: 0, isRunning: false });

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    const t = await fetchCurrentTournament();
    if (!t) return;
    setTournamentId(t.id);
    await fetchRegsAndElims(t.id);
    if (t.clock_seconds_left != null) {
      let li = t.clock_level_index || 0;
      let sl = t.clock_seconds_left;
      if (t.clock_is_running) {
        const elapsed = Math.max(0, (Date.now() - new Date(t.clock_updated_at).getTime()) / 1000);
        const adv = advanceForElapsed(li, sl, elapsed, levels);
        li = adv.levelIndex;
        sl = adv.secondsLeft;
      }
      setLevelIndex(li);
      setSecondsLeft(sl);
      setIsRunning(!!t.clock_is_running);
    }
  }

  async function fetchRegsAndElims(tId) {
    const { data: regs } = await supabase
      .from("registrations")
      .select("*, players(full_name), accounts(avatar_data)")
      .eq("tournament_id", tId);
    const { data: elims } = await supabase
      .from("eliminations")
      .select("*, registrations!eliminations_registration_id_fkey(players(full_name))")
      .eq("tournament_id", tId)
      .eq("undone", false)
      .order("finish_position", { ascending: true });
    setRegistrations(regs || []);
    setEliminations(elims || []);
  }

  useEffect(() => {
    if (!tournamentId) return;
    const t = setInterval(() => fetchRegsAndElims(tournamentId), 6000);
    return () => clearInterval(t);
  }, [tournamentId]);

  useEffect(() => {
    clockStateRef.current = { levelIndex, secondsLeft, isRunning };
  }, [levelIndex, secondsLeft, isRunning]);

  useEffect(() => {
    if (!tournamentId) return;
    const t = setInterval(() => {
      saveClockState(tournamentId, clockStateRef.current).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [tournamentId]);

  useEffect(() => {
    if (!isRunning) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          setLevelIndex((li) => Math.min(li + 1, levels.length - 1));
          return (levels[levelIndex + 1]?.durationMinutes || 20) * 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, levelIndex]);

  function persistNow(li, sl, running) {
    if (!tournamentId) return;
    saveClockState(tournamentId, { levelIndex: li, secondsLeft: sl, isRunning: running }).catch(() => {});
  }

  function togglePlay() {
    const next = !isRunning;
    setIsRunning(next);
    persistNow(levelIndex, secondsLeft, next);
  }
  function goPrev() {
    const prev = Math.max(0, levelIndex - 1);
    const sl = (levels[prev]?.durationMinutes || 20) * 60;
    setLevelIndex(prev);
    setSecondsLeft(sl);
    persistNow(prev, sl, isRunning);
  }
  function goNext() {
    const next = Math.min(levelIndex + 1, levels.length - 1);
    const sl = (levels[next]?.durationMinutes || 20) * 60;
    setLevelIndex(next);
    setSecondsLeft(sl);
    persistNow(next, sl, isRunning);
  }

  const currentLevel = levels[levelIndex];
  const nextLevel = levels[levelIndex + 1];
  const eliminatedIds = new Set(eliminations.map((e) => e.registration_id));
  const stillIn = registrations.filter((r) => !eliminatedIds.has(r.id));
  const avgStack =
    stillIn.length > 0 ? Math.round(registrations.reduce((s, r) => s + (r.stack || 0), 0) / stillIn.length) : 0;
  const avgStackBB = currentLevel?.bigBlind ? Math.round(avgStack / currentLevel.bigBlind) : 0;
  const progress = currentLevel ? 100 - (secondsLeft / ((currentLevel.durationMinutes || 20) * 60)) * 100 : 0;

  if (!currentLevel) {
    return <div className="p-6 text-felt-cream/50 font-body text-center">Aucune structure de blinds.</div>;
  }

  return (
    <div className="h-full overflow-y-auto font-body text-felt-cream px-4 pb-8 pt-4">
      <div className="text-center mb-1">
        <div className="text-felt-gold/80 font-display tracking-wide">
          {currentLevel.isBreak ? currentLevel.breakLabel || "PAUSE" : `NIVEAU ${levelIndex + 1}`}
        </div>
      </div>
      <div className="text-center font-display text-7xl tabular-nums leading-none mb-3">{formatTime(secondsLeft)}</div>
      <div className="h-2 bg-felt-panel rounded-full overflow-hidden mb-5">
        <div className="h-full bg-felt-gold" style={{ width: `${progress}%` }} />
      </div>

      {!currentLevel.isBreak && (
        <div className="flex items-center justify-center gap-4 text-3xl font-display mb-5">
          <span>{currentLevel.smallBlind}</span>
          <span className="text-felt-cream/30">/</span>
          <span>{currentLevel.bigBlind}</span>
          {currentLevel.ante > 0 && <span className="text-felt-gold text-lg ml-1">ante {currentLevel.ante}</span>}
        </div>
      )}

      {canEdit && (
        <div className="flex justify-center gap-3 mb-6">
          <button onClick={goPrev} className="w-14 h-14 rounded-full bg-felt-panel border border-felt-cream/10 text-xl">
            ◀
          </button>
          <button
            onClick={togglePlay}
            className="px-8 h-14 rounded-full bg-felt-gold text-felt-bg font-display text-lg"
          >
            {isRunning ? "Pause" : "Lecture"}
          </button>
          <button onClick={goNext} className="w-14 h-14 rounded-full bg-felt-panel border border-felt-cream/10 text-xl">
            ▶
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-felt-panel border border-felt-cream/10 rounded-lg p-3 text-center">
          <div className="text-xs text-felt-cream/40 uppercase mb-1">Joueurs</div>
          <div className="font-display text-xl">
            {stillIn.length}/{registrations.length}
          </div>
        </div>
        <div className="bg-felt-panel border border-felt-cream/10 rounded-lg p-3 text-center">
          <div className="text-xs text-felt-cream/40 uppercase mb-1">Tapis moyen</div>
          <div className="font-display text-xl">
            {avgStack.toLocaleString()} <span className="text-felt-gold text-sm">({avgStackBB} BB)</span>
          </div>
        </div>
      </div>

      {nextLevel && (
        <div className="bg-felt-panel border border-felt-cream/10 rounded-lg p-3 mb-4 flex items-center justify-between">
          <span className="text-xs text-felt-cream/40 uppercase">Prochaine blind</span>
          <span className="font-display">
            {nextLevel.isBreak
              ? nextLevel.breakLabel || "Pause"
              : `${nextLevel.smallBlind}/${nextLevel.bigBlind}${nextLevel.ante ? ` (ante ${nextLevel.ante})` : ""}`}
          </span>
        </div>
      )}

      {eliminations.length > 0 && (
        <div className="bg-felt-panel border border-felt-cream/10 rounded-lg p-3 mb-4">
          <div className="text-xs text-felt-cream/40 uppercase mb-2">Dernier éliminé</div>
          <div className="font-medium">{eliminations[0]?.registrations?.players?.full_name}</div>
          <div className="text-felt-gold text-sm">{eliminations[0]?.finish_position}e place</div>
        </div>
      )}

      <button
        onClick={() => setShowStructure((v) => !v)}
        className="w-full text-center text-sm text-felt-cream/60 hover:text-felt-cream py-2 mb-2"
      >
        {showStructure ? "▲ Masquer la structure" : "▼ Voir toute la structure"}
      </button>
      {showStructure && (
        <div className="space-y-1.5">
          {levels.map((l, i) => (
            <div
              key={i}
              className={`flex items-center justify-between px-3 py-2 rounded-md text-sm ${
                i === levelIndex ? "bg-felt-gold/15 text-felt-gold" : "bg-felt-panel/60 text-felt-cream/70"
              }`}
            >
              <span className="text-felt-cream/40 w-8">{i + 1}</span>
              <span className="text-felt-cream/40 w-12">{l.durationMinutes}'</span>
              <span className="flex-1 text-right">
                {l.isBreak ? l.breakLabel || "Pause" : `${l.smallBlind}/${l.bigBlind}${l.ante ? ` (${l.ante})` : ""}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
