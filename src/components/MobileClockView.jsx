import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { fetchCurrentTournament } from "../lib/tournaments.js";
import { saveClockState, synchroniserEtatHorloge, secondsUntilScheduledStart, COUNTDOWN_WINDOW_HOURS, advanceForElapsed } from "../lib/clockState.js";
import { canControlClock } from "../lib/auth.js";
import { formatTime, formatCountdown, formatChips } from "../lib/format.js";
import { computeFinishPositions } from "../lib/points.js";
import { useAccount } from "../context/AccountContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";



/**
 * MobileClockView — écran d'horloge simplifié pour téléphone : une seule
 * colonne qui défile, gros chiffres, gros boutons tactiles, sans les
 * panneaux en glisser-déposer (pensés pour un écran de TV/vidéoprojecteur
 * et peu adaptés à un petit écran tactile).
 */
export default function MobileClockView({ levels, canEdit: canEditOverride }) {
  const { account } = useAccount();
  const { theme } = useTheme();
  // Même raccourci que sur l'horloge de bureau : le réglage "Montants
  // abrégés" vaut pour tous les affichages de jetons.
  const chips = (v) => formatChips(v, !!theme.compactChips);
  const canEdit = canEditOverride !== undefined ? canEditOverride : canControlClock(account?.role);

  const [tournamentId, setTournamentId] = useState(null);
  // Ligne du tournoi (heure programmée, horloge déjà lancée ou non) : sert
  // au compte à rebours affiché avant le début d'un tournoi programmé.
  const [tournamentMeta, setTournamentMeta] = useState(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [levelIndex, setLevelIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState((levels[0]?.durationMinutes || 20) * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [registrations, setRegistrations] = useState([]);
  const [eliminations, setEliminations] = useState([]);
  const [showStructure, setShowStructure] = useState(false);

  // La structure peut être modifiée en pleine partie. Si le niveau courant
  // devient plus court que le temps encore affiché, le rebours doit
  // suivre : sans ça l'horloge restait sur l'ancienne durée — un niveau 17
  // ramené de 20 à 10 minutes continuait d'afficher 20:00 jusqu'au
  // changement de niveau.
  //
  // On raccourcit seulement, jamais l'inverse : rallonger un niveau ne
  // doit pas rendre du temps déjà joué. La dépendance porte sur la DURÉE
  // et non sur le tableau des niveaux, qui est relu toutes les 10 secondes
  // et change d'identité à chaque fois.
  const dureeNiveauSec = (levels[levelIndex]?.durationMinutes || 0) * 60;
  useEffect(() => {
    if (!dureeNiveauSec) return;
    setSecondsLeft((s) => (s > dureeNiveauSec ? dureeNiveauSec : s));
  }, [dureeNiveauSec]);

  const intervalRef = useRef(null);
  const levelsRef = useRef([]);
  const clockStateRef = useRef({ levelIndex: 0, secondsLeft: 0, isRunning: false });

  useEffect(() => {
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init() {
    const t = await fetchCurrentTournament();
    if (!t) return;
    setTournamentId(t.id);
    setTournamentMeta(t);
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
    // Les niveaux aussi : l'intervalle de synchronisation ne se relance
    // jamais, il capturerait sinon la structure telle qu'elle était à
    // l'ouverture et rattraperait le temps avec d'anciennes durées.
    levelsRef.current = levels;
  }, [levelIndex, secondsLeft, isRunning]);

  useEffect(() => {
    if (!tournamentId) return;
    const t = setInterval(async () => {
      try {
        // Un autre appareil a-t-il bougé l'horloge ? Si oui on adopte son
        // état plutôt que d'écraser sa décision avec la nôtre.
        const distant = await synchroniserEtatHorloge(tournamentId, levelsRef.current);
        if (distant) {
          setLevelIndex(distant.levelIndex);
          setSecondsLeft(distant.secondsLeft);
          setIsRunning(distant.isRunning);
          return;
        }
        await saveClockState(tournamentId, clockStateRef.current);
      } catch {
        /* réseau : on retentera dans cinq secondes */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [tournamentId]);

  // Tournoi encore "Programmé" avec une heure de début : on fait battre une
  // horloge à la seconde pour le rebours, et on relit la ligne du tournoi
  // de temps en temps — l'horloge peut être lancée depuis un autre
  // appareil, auquel cas le rebours doit disparaître ici aussi.
  const awaitingScheduledStart = !!tournamentMeta?.scheduled_at && !tournamentMeta?.clock_started;
  useEffect(() => {
    if (!awaitingScheduledStart || !tournamentId) return;
    const tick = setInterval(() => setNowTs(Date.now()), 1000);
    const refresh = setInterval(async () => {
      // Deux colonnes, pas la ligne entière : elle porte la disposition et
      // le fond de l'horloge (~884 kB). Sur un téléphone en 4G, c'était le
      // plus gros poste de consommation de cet écran.
      const { data } = await supabase
        .from("tournaments")
        .select("id, scheduled_at, clock_started")
        .eq("id", tournamentId)
        .maybeSingle();
      if (data) setTournamentMeta((m) => ({ ...m, ...data }));
    }, 30000);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [awaitingScheduledStart, tournamentId]);

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
    // Le départ manuel fait sortir le tournoi de l'état "Programmé" (comme
    // saveClockState le fait en base) : le compte à rebours disparaît
    // aussitôt, sans attendre la prochaine relecture de la ligne.
    if (next) setTournamentMeta((m) => (m ? { ...m, clock_started: true } : m));
    persistNow(levelIndex, secondsLeft, next);
  }
  // Deux temps, comme sur l'horloge du grand écran : si le niveau en
  // cours est entamé, le premier appui le remet à son temps plein ; c'est
  // seulement le suivant qui recule d'un niveau.
  function goPrev() {
    const total = (levels[levelIndex]?.durationMinutes || 20) * 60;
    if (secondsLeft < total) {
      setSecondsLeft(total);
      persistNow(levelIndex, total, isRunning);
      return;
    }
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
  // Secondes avant le début programmé, ou null = affichage normal du
  // niveau. Le départ reste manuel : à 0 on revient simplement au temps du
  // niveau 1, en attendant que quelqu'un appuie sur "Lecture".
  const countdownSeconds = secondsUntilScheduledStart(tournamentMeta, nowTs);
  const inCountdown = countdownSeconds != null;
  const eliminatedIds = new Set(eliminations.map((e) => e.registration_id));
  const stillIn = registrations.filter((r) => !eliminatedIds.has(r.id));
  const avgStack =
    stillIn.length > 0 ? Math.round(registrations.reduce((s, r) => s + (r.stack || 0), 0) / stillIn.length) : 0;
  const avgStackBB = currentLevel?.bigBlind ? Math.round(avgStack / currentLevel.bigBlind) : 0;
  const progress = inCountdown
    ? 100 - (countdownSeconds / (COUNTDOWN_WINDOW_HOURS * 3600)) * 100
    : currentLevel
    ? 100 - (secondsLeft / ((currentLevel.durationMinutes || 20) * 60)) * 100
    : 0;

  // Recalcule la vraie place de chaque joueur (voir EditableClock.jsx pour
  // le détail) plutôt que d'utiliser la valeur figée en base.
  const positionByReg = computeFinishPositions(registrations.length, eliminations);
  const rankedEliminations = [...eliminations]
    .map((e) => ({ ...e, finish_position: positionByReg.get(e.registration_id) }))
    .sort((a, b) => a.finish_position - b.finish_position);

  if (!currentLevel) {
    return <div className="p-6 text-felt-cream/50 font-body text-center">Aucune structure de blinds.</div>;
  }

  return (
    <div className="h-full overflow-y-auto font-body text-felt-cream px-4 pb-8 pt-4">
      <div className="text-center mb-1">
        <div className="text-felt-gold/80 font-display tracking-wide">
          {inCountdown
            ? "DÉBUT DANS"
            : currentLevel.isBreak
            ? currentLevel.breakLabel || "PAUSE"
            : `NIVEAU ${levelIndex + 1}`}
        </div>
        {inCountdown && (
          <div className="text-xs text-felt-cream/40 mt-0.5">
            Départ programmé à{" "}
            {new Date(tournamentMeta.scheduled_at).toLocaleString("fr-FR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        )}
      </div>
      <div className={`text-center font-display tabular-nums leading-none mb-3 ${inCountdown ? "text-6xl" : "text-7xl"}`}>
        {inCountdown ? formatCountdown(countdownSeconds) : formatTime(secondsLeft)}
      </div>
      <div className="h-2 bg-felt-panel rounded-full overflow-hidden mb-5">
        <div className="h-full bg-felt-gold" style={{ width: `${progress}%` }} />
      </div>

      {!currentLevel.isBreak && (
        <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-3xl font-display mb-5 px-2">
          <span>{chips(currentLevel.smallBlind)}</span>
          <span className="text-felt-cream/30">/</span>
          <span>{chips(currentLevel.bigBlind)}</span>
          {currentLevel.ante > 0 && <span className="text-felt-gold text-lg ml-1">ante {chips(currentLevel.ante)}</span>}
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
            {theme.compactChips ? chips(avgStack) : avgStack.toLocaleString("fr-FR")} <span className="text-felt-gold text-sm">({avgStackBB} BB)</span>
          </div>
        </div>
      </div>

      {nextLevel && (
        <div className="bg-felt-panel border border-felt-cream/10 rounded-lg p-3 mb-4 flex items-center justify-between">
          <span className="text-xs text-felt-cream/40 uppercase">Prochaine blind</span>
          <span className="font-display">
            {nextLevel.isBreak
              ? nextLevel.breakLabel || "Pause"
              : `${chips(nextLevel.smallBlind)}/${chips(nextLevel.bigBlind)}${nextLevel.ante ? ` (ante ${chips(nextLevel.ante)})` : ""}`}
          </span>
        </div>
      )}

      {rankedEliminations.length > 0 && (
        <div className="bg-felt-panel border border-felt-cream/10 rounded-lg p-3 mb-4">
          <div className="text-xs text-felt-cream/40 uppercase mb-2">Dernier éliminé</div>
          <div className="font-medium">{rankedEliminations[0]?.registrations?.players?.full_name}</div>
          <div className="text-felt-gold text-sm">{rankedEliminations[0]?.finish_position}e place</div>
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
                {l.isBreak ? l.breakLabel || "Pause" : `${chips(l.smallBlind)}/${chips(l.bigBlind)}${l.ante ? ` (${chips(l.ante)})` : ""}`}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
