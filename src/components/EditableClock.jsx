import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useTheme } from "../context/ThemeContext.jsx";
import { fetchCurrentTournament } from "../lib/tournaments.js";
import { saveClockState } from "../lib/clockState.js";
import { playSound, SOUND_OPTIONS } from "../lib/sounds.js";
import { formatTime, clamp } from "../lib/format.js";
import { fetchClubSettings, setLiveAnnouncement } from "../lib/auth.js";
import { compressImageFile, uploadImageToStorage } from "../lib/imageUtils.js";
import EditableButton from "./EditableButton.jsx";

/**
 * EditableClock — tableau de bord de tournoi façon BlindValet. Panneaux en %
 * (responsive), déplaçables, redimensionnables, personnalisables. L'état de
 * l'horloge (niveau/temps/marche-arrêt) est persisté sur le tournoi en base
 * pour continuer correctement après un changement d'onglet ou un rechargement.
 */
const BASE_STYLE = {
  color: "#EDEAE3", fontSize: 24, align: "left", valign: "top", font: "display",
  showTitle: true, customTitle: "", titleFontSize: 10, bgColor: null, transparent: false,
};

const DEFAULT_PANELS = {
  timer: {
    x: 2, y: 2, w: 34, h: 30, removed: false,
    style: { ...BASE_STYLE, fontSize: 60, align: "center", indicatorFontSize: 11, oneMinuteSound: "beep3", levelEndSound: "alarm" },
  },
  controls: {
    x: 2, y: 33, w: 34, h: 9, removed: false,
    style: { ...BASE_STYLE, align: "center", showTitle: false, buttonSize: "md", buttonLayout: "row", buttonAlign: "center", buttonColor: "#C9A15A" },
  },
  blinds: { x: 38, y: 2, w: 16, h: 34, removed: false, style: { ...BASE_STYLE, fontSize: 30, align: "center" } },
  players: { x: 56, y: 2, w: 20, h: 16, removed: false, style: { ...BASE_STYLE, fontSize: 30, align: "center" } },
  next: { x: 56, y: 20, w: 20, h: 16, removed: false, style: { ...BASE_STYLE, fontSize: 14, font: "body" } },
  ranking: { x: 78, y: 2, w: 20, h: 34, removed: false, style: { ...BASE_STYLE, fontSize: 13, font: "body" } },
  structure: { x: 2, y: 44, w: 34, h: 28, removed: false, style: { ...BASE_STYLE, fontSize: 15, font: "body" } },
  eliminated: { x: 38, y: 38, w: 18, h: 34, removed: false, style: { ...BASE_STYLE, fontSize: 16 } },
  headsup: { x: 58, y: 38, w: 20, h: 34, removed: false, style: { ...BASE_STYLE, fontSize: 14 } },
  carousel: {
    x: 78, y: 38, w: 20, h: 34, removed: false,
    style: { ...BASE_STYLE, fontSize: 13, font: "body", intervalSeconds: 8, included: { structure: true, eliminated: true, headsup: true, ranking: true, winner: true } },
  },
  sponsors: {
    x: 2, y: 74, w: 46, h: 24, removed: true,
    style: { ...BASE_STYLE, fontSize: 14, intervalSeconds: 6, sponsorImages: [] },
  },
  announcements: {
    x: 50, y: 74, w: 48, h: 24, removed: true,
    style: { ...BASE_STYLE, fontSize: 18, font: "body", align: "center" },
  },
  nextbreak: {
    x: 78, y: 2, w: 20, h: 10, removed: true,
    style: { ...BASE_STYLE, fontSize: 22, align: "center", customTitle: "Prochaine pause" },
  },
  customtext: {
    x: 2, y: 2, w: 30, h: 8, removed: true,
    style: { ...BASE_STYLE, fontSize: 16, align: "left", showTitle: false, customTitle: "", text: "Votre texte ici" },
  },
  avgstack: {
    x: 78, y: 14, w: 20, h: 10, removed: true,
    style: { ...BASE_STYLE, fontSize: 22, align: "center" },
  },
  playercount: {
    x: 78, y: 26, w: 20, h: 10, removed: true,
    style: { ...BASE_STYLE, fontSize: 24, align: "center" },
  },
  level: {
    x: 2, y: 14, w: 16, h: 10, removed: true,
    style: { ...BASE_STYLE, fontSize: 24, align: "center" },
  },
  prizepool: {
    x: 2, y: 26, w: 22, h: 30, removed: true,
    style: { ...BASE_STYLE, fontSize: 14, align: "center", payouts: [] },
  },
};

const PANEL_LABELS = {
  timer: "Horloge", controls: "Contrôles", blinds: "Blinds", players: "Joueurs", next: "Prochaine blind",
  ranking: "Classement", structure: "Structure des blinds", eliminated: "Élimination",
  headsup: "Heads Up", carousel: "Carrousel", sponsors: "Sponsors", announcements: "Annonces",
  nextbreak: "Prochaine pause (compte à rebours)", customtext: "Texte libre",
  avgstack: "Tapis moyen", playercount: "Joueurs (restant/total)", level: "Niveau", prizepool: "Prizepool (dotation)",
};

const FONT_FAMILY = {
  display: "'Oswald', sans-serif",
  body: "'Inter', sans-serif",
  mono: "monospace",
  poster: "'Luckiest Guy', cursive",
  anton: "'Anton', sans-serif",
  bungee: "'Bungee', sans-serif",
  righteous: "'Righteous', cursive",
  orbitron: "'Orbitron', sans-serif",
  blackops: "'Black Ops One', cursive",
  fjalla: "'Fjalla One', sans-serif",
  titanone: "'Titan One', cursive",
  michroma: "'Michroma', sans-serif",
  audiowide: "'Audiowide', sans-serif",
  aldrich: "'Aldrich', sans-serif",
  zendots: "'Zen Dots', cursive",
  chewy: "'Chewy', cursive",
  baloo2: "'Baloo 2', cursive",
};
const BUTTON_SIZE = { sm: "px-2 py-1 text-xs", md: "px-3 py-1.5 text-sm", lg: "px-5 py-3 text-lg" };
const H_ALIGN = { left: "justify-start", center: "justify-center", right: "justify-end" };
const V_ALIGN = { top: "flex-start", center: "center", bottom: "flex-end" };
const CAROUSEL_LABELS = { structure: "Structure des blinds", eliminated: "Élimination", headsup: "Heads Up", ranking: "Classement", winner: "Vainqueur" };


function hexToRgba(hex, alpha = 1) {
  const clean = (hex || "#000000").replace("#", "");
  const bigint = parseInt(clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const SNAP_THRESHOLD = 0.5;

// Accroche une valeur sur la cible la plus proche (bord d'un autre panneau
// ou bord du canevas 0/50/100) si elle est à moins de SNAP_THRESHOLD %.
function snapValue(val, targets) {
  let best = val;
  let bestDiff = SNAP_THRESHOLD;
  for (const t of targets) {
    const diff = Math.abs(val - t);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = t;
    }
  }
  return best;
}

// Accroche un segment [pos, pos+size] : essaie d'abord le bord de départ,
// puis le bord de fin (le premier qui matche l'emporte).
function snapSegment(pos, size, targets) {
  const snappedStart = snapValue(pos, targets);
  if (snappedStart !== pos) return snappedStart;
  const snappedEnd = snapValue(pos + size, targets);
  if (snappedEnd !== pos + size) return snappedEnd - size;
  return pos;
}

// Calcule les bords (x et y) de tous les panneaux visibles, pour que le
// glisser-déposer et le redimensionnement puissent s'aimanter dessus.
function computeSnapTargets(panels) {
  const xs = [0, 50, 100];
  const ys = [0, 50, 100];
  Object.values(panels).forEach((p) => {
    if (p.removed) return;
    xs.push(p.x, p.x + p.w);
    ys.push(p.y, p.y + p.h);
  });
  return { xs, ys };
}

function mergeLayout(saved) {
  const panels = {};
  for (const key of Object.keys(DEFAULT_PANELS)) {
    const merged = {
      ...DEFAULT_PANELS[key],
      ...(saved?.[key] || {}),
      style: { ...DEFAULT_PANELS[key].style, ...(saved?.[key]?.style || {}) },
    };
    if (merged.x > 100 || merged.y > 100 || merged.w > 100 || merged.h > 100) {
      merged.x = DEFAULT_PANELS[key].x;
      merged.y = DEFAULT_PANELS[key].y;
      merged.w = DEFAULT_PANELS[key].w;
      merged.h = DEFAULT_PANELS[key].h;
    }
    panels[key] = merged;
  }
  let images = saved?.images || [];
  if ((!images || images.length === 0) && saved?.background?.imageData) {
    images = [{ id: "legacy-bg", x: 0, y: 0, w: 100, h: 100, imageData: saved.background.imageData, layer: "back", fit: "contain" }];
  }
  images = images.map((im) => (im.x > 100 || im.y > 100 || im.w > 100 || im.h > 100 ? { ...im, x: 10, y: 10, w: 40, h: 40 } : im));
  return { panels, images };
}

// Avance le niveau/temps restant d'un nombre de secondes écoulées (pour
// rattraper l'horloge après une absence pendant qu'elle tournait).
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

export default function EditableClock({ levels, canEdit, designOnly = false, templateMode = false, initialLayout = null, onSaveLayout = null }) {
  const { theme, setTheme } = useTheme();
  const merged0 = mergeLayout(initialLayout || theme.layout);
  const effectiveDesignOnly = designOnly || templateMode;
  const [panels, setPanels] = useState(merged0.panels);
  const [images, setImages] = useState(merged0.images);
  const [editing, setEditing] = useState(false);
  const [stylingId, setStylingId] = useState(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [toolbarOffset, setToolbarOffset] = useState({ x: 0, y: 0 });
  const bgFileRef = useRef(null);
  const tournamentBgFileRef = useRef(null);
  const containerRef = useRef(null);
  const toolbarDrag = useRef(null);

  const [levelIndex, setLevelIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState((levels[0]?.durationMinutes || 20) * 60);
  const [isRunning, setIsRunning] = useState(false);
  const [tournamentId, setTournamentId] = useState(null);
  const intervalRef = useRef(null);
  const clockStateRef = useRef({ levelIndex: 0, secondsLeft: 0, isRunning: false });

  const [registrations, setRegistrations] = useState([]);
  const [eliminations, setEliminations] = useState([]);
  const [sponsorIdx, setSponsorIdx] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [tournamentBg, setTournamentBg] = useState(effectiveDesignOnly ? initialLayout?.background || null : null);
  const [bgSaveError, setBgSaveError] = useState(null);
  const [showBgPicker, setShowBgPicker] = useState(false);
  const tournamentLayoutAppliedRef = useRef(false);

  useEffect(() => {
    if (templateMode) return;
    // Une fois qu'on gère la disposition propre à un tournoi, on ne doit
    // plus la faire écraser par la disposition par défaut du club.
    if (tournamentLayoutAppliedRef.current) return;
    const m = mergeLayout(theme.layout);
    setPanels(m.panels);
    setImages(m.images);
  }, [theme.layout, templateMode]);

  useEffect(() => {
    if (!effectiveDesignOnly) initTournament();
    function onFsChange() {
      const isFs = !!document.fullscreenElement;
      setIsFullscreen(isFs);
      if (isFs) {
        setEditing(false);
        setStylingId(null);
        setShowLibrary(false);
      }
    }
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sonde légère : rafraîchit inscriptions/éliminations toutes les 5s, sans
  // toucher à l'état de l'horloge (pour que les panneaux Élimination,
  // Classement, Joueurs, etc. se mettent à jour pendant que le tournoi tourne).
  // Désactivée en mode conception (designOnly) : cet onglet ne doit jamais
  // interagir avec un tournoi réel.
  useEffect(() => {
    if (effectiveDesignOnly || !tournamentId) return;
    const t = setInterval(() => {
      fetchRegsAndElims(tournamentId);
    }, 5000);
    return () => clearInterval(t);
  }, [effectiveDesignOnly, tournamentId]);

  // Sauvegarde périodique de l'état de l'horloge (toutes les 5s) via une ref
  // pour toujours écrire la valeur la plus récente sans redémarrer l'intervalle.
  useEffect(() => {
    clockStateRef.current = { levelIndex, secondsLeft, isRunning };
  }, [levelIndex, secondsLeft, isRunning]);

  useEffect(() => {
    if (effectiveDesignOnly || !tournamentId) return;
    const t = setInterval(() => {
      saveClockState(tournamentId, clockStateRef.current).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [effectiveDesignOnly, tournamentId]);

  // Sauvegarde de secours : à chaque changement de tournoi courant ou au
  // démontage du composant (ex. changement d'onglet), on écrit l'état le
  // plus récent immédiatement, pour éviter un décalage de plusieurs
  // secondes au retour sur l'horloge.
  useEffect(() => {
    if (effectiveDesignOnly || !tournamentId) return;
    return () => {
      saveClockState(tournamentId, clockStateRef.current).catch(() => {});
    };
  }, [effectiveDesignOnly, tournamentId]);

  useEffect(() => {
    const secs = panels.carousel?.style?.intervalSeconds || 8;
    const t = setInterval(() => setCarouselIdx((i) => i + 1), secs * 1000);
    return () => clearInterval(t);
  }, [panels.carousel?.style?.intervalSeconds]);

  useEffect(() => {
    const secs = panels.sponsors?.style?.intervalSeconds || 6;
    const t = setInterval(() => setSponsorIdx((i) => i + 1), secs * 1000);
    return () => clearInterval(t);
  }, [panels.sponsors?.style?.intervalSeconds]);

  useEffect(() => {
    function loadAnnouncement() {
      fetchClubSettings()
        .then((s) => setAnnouncement(s?.live_announcement || ""))
        .catch(() => {});
    }
    loadAnnouncement();
    const t = setInterval(loadAnnouncement, 5000);
    return () => clearInterval(t);
  }, []);

  async function handleEditAnnouncement() {
    const next = prompt("Message à afficher sur le panneau Annonces :", announcement);
    if (next === null) return;
    setAnnouncement(next);
    try {
      await setLiveAnnouncement(next);
    } catch {
      // silencieux
    }
  }

  async function fetchRegsAndElims(tId) {
    const { data: regs } = await supabase
      .from("registrations")
      .select("*, players(full_name), accounts(avatar_data)")
      .eq("tournament_id", tId);
    const { data: elims } = await supabase
      .from("eliminations")
      .select("*, registrations!eliminations_registration_id_fkey(players(full_name), accounts(avatar_data))")
      .eq("tournament_id", tId)
      .eq("undone", false)
      .order("finish_position", { ascending: true });
    setRegistrations(regs || []);
    setEliminations(elims || []);
  }

  async function initTournament() {
    const t = await fetchCurrentTournament();
    if (!t) return;
    setTournamentId(t.id);
    // Dès qu'on connaît le tournoi, on gère sa propre disposition d'horloge
    // (plus jamais celle par défaut du club, sauf s'il n'en a pas encore).
    tournamentLayoutAppliedRef.current = true;
    if (t.clock_layout) {
      const m = mergeLayout(t.clock_layout);
      setPanels(m.panels);
      setImages(m.images);
    }
    setTournamentBg(t.clock_background || null);
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

  function persistNow(li, sl, running) {
    if (effectiveDesignOnly || !tournamentId) return;
    saveClockState(tournamentId, { levelIndex: li, secondsLeft: sl, isRunning: running }).catch(() => {});
  }

  const currentLevel = levels[levelIndex];
  const nextLevel = levels[levelIndex + 1];

  useEffect(() => {
    if (!isRunning) return;
    intervalRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          goToNextLevel();
          return (levels[levelIndex + 1]?.durationMinutes || 20) * 60;
        }
        if (s - 1 === 60) playSound(panels.timer.style.oneMinuteSound, panels.timer.style.oneMinuteSoundUrl);
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, levelIndex]);

  function goToNextLevel() {
    const next = levelIndex + 1;
    if (next < levels.length) {
      setLevelIndex(next);
      playSound(panels.timer.style.levelEndSound, panels.timer.style.levelEndSoundUrl);
    } else setIsRunning(false);
  }
  function goToPrevLevel() {
    const prev = Math.max(0, levelIndex - 1);
    const sl = (levels[prev]?.durationMinutes || 20) * 60;
    setLevelIndex(prev);
    setSecondsLeft(sl);
    persistNow(prev, sl, isRunning);
  }
  function skipToNext() {
    const next = levelIndex + 1;
    if (next < levels.length) {
      const sl = (levels[next]?.durationMinutes || 20) * 60;
      setLevelIndex(next);
      setSecondsLeft(sl);
      persistNow(next, sl, isRunning);
    } else {
      setIsRunning(false);
      persistNow(levelIndex, secondsLeft, false);
    }
  }
  function toggleRunning() {
    const next = !isRunning;
    setIsRunning(next);
    persistNow(levelIndex, secondsLeft, next);
  }

  // Raccourci clavier : Entrée bascule lecture/pause de l'horloge (sauf
  // pendant la saisie dans un champ texte, ou en mode réorganisation).
  // Refs pour éviter de réabonner l'écouteur à chaque tick de l'horloge.
  const toggleRunningRef = useRef(toggleRunning);
  toggleRunningRef.current = toggleRunning;
  const editingRef = useRef(editing);
  editingRef.current = editing;
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== "Enter") return;
      if (editingRef.current) return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.isContentEditable) return;
      e.preventDefault();
      toggleRunningRef.current();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
  function handleProgressClick(e) {
    if (editing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const total = (currentLevel?.durationMinutes || 20) * 60;
    const newSecondsLeft = Math.round(total * (1 - fraction));
    setSecondsLeft(newSecondsLeft);
    persistNow(levelIndex, newSecondsLeft, isRunning);
  }

  let elapsedSeconds = 0;
  for (let i = 0; i < levelIndex; i++) elapsedSeconds += (levels[i]?.durationMinutes || 20) * 60;
  elapsedSeconds += (levels[levelIndex]?.durationMinutes || 20) * 60 - secondsLeft;

  let breakInSeconds = secondsLeft;
  let hasUpcomingBreak = false;
  for (let i = levelIndex + 1; i < levels.length; i++) {
    if (levels[i].isBreak) {
      hasUpcomingBreak = true;
      break;
    }
    breakInSeconds += (levels[i].durationMinutes || 20) * 60;
  }
  if (currentLevel?.isBreak) hasUpcomingBreak = false;

  const eliminatedIds = new Set(eliminations.map((e) => e.registration_id));
  const stillIn = registrations.filter((r) => !eliminatedIds.has(r.id));
  const avgStack = stillIn.length > 0 ? Math.round(registrations.reduce((s, r) => s + (r.stack || 0), 0) / stillIn.length) : 0;
  const avgStackBB = currentLevel?.bigBlind ? Math.round(avgStack / currentLevel.bigBlind) : 0;
  const lastElimination = eliminations[0];
  const isFinished = registrations.length > 1 && stillIn.length === 1;
  const winner = isFinished ? stillIn[0] : null;

  async function persist(nextPanels, nextImages) {
    setPanels(nextPanels);
    setImages(nextImages);
    if (templateMode) return;
    if (!effectiveDesignOnly && tournamentId) {
      // Disposition propre à CE tournoi (n'affecte pas les autres tournois
      // ni la disposition par défaut du club).
      const layout = { ...nextPanels, images: nextImages };
      const { error } = await supabase.from("tournaments").update({ clock_layout: layout }).eq("id", tournamentId);
      if (!error) return;
    }
    const nextTheme = { ...theme, layout: { ...nextPanels, images: nextImages } };
    setTheme(nextTheme);
    const { data: existing } = await supabase.from("club_settings").select("id").limit(1).maybeSingle();
    const payload = { club_name: "19PokerClub", theme: nextTheme };
    if (existing) await supabase.from("club_settings").update(payload).eq("id", existing.id);
    else await supabase.from("club_settings").insert(payload);
  }

  function movePanel(id, x, y) {
    setPanels((prev) => ({ ...prev, [id]: { ...prev[id], x, y } }));
  }
  function commitPanels() {
    persist(panels, images);
  }
  function resizePanel(id, w, h, preview = false) {
    const next = { ...panels, [id]: { ...panels[id], w, h } };
    setPanels(next);
    if (!preview) persist(next, images);
  }
  // Redimensionnement depuis un bord (haut/bas/gauche/droite) : peut aussi
  // déplacer x/y en plus de w/h (ex. tirer le bord gauche déplace x et
  // réduit w en même temps).
  function resizePanelEdge(id, patch, preview = false) {
    const next = { ...panels, [id]: { ...panels[id], ...patch } };
    setPanels(next);
    if (!preview) persist(next, images);
  }
  function updateStyle(id, patch) {
    const next = { ...panels, [id]: { ...panels[id], style: { ...panels[id].style, ...patch } } };
    persist(next, images);
  }
  function removePanel(id) {
    const next = { ...panels, [id]: { ...panels[id], removed: true } };
    setStylingId(null);
    persist(next, images);
  }
  function restorePanel(id) {
    const next = { ...panels, [id]: { ...panels[id], removed: false, x: DEFAULT_PANELS[id].x, y: DEFAULT_PANELS[id].y, w: DEFAULT_PANELS[id].w, h: DEFAULT_PANELS[id].h } };
    persist(next, images);
    setShowLibrary(false);
  }
  function toggleCarouselIncluded(type) {
    const next = { ...panels.carousel.style.included, [type]: !panels.carousel.style.included[type] };
    updateStyle("carousel", { included: next });
  }

  function moveImage(id, x, y) {
    setImages((prev) => prev.map((im) => (im.id === id ? { ...im, x, y } : im)));
  }
  function commitImages() {
    persist(panels, images);
  }
  function resizeImage(id, w, h, preview = false) {
    const next = images.map((im) => (im.id === id ? { ...im, w, h } : im));
    setImages(next);
    if (!preview) persist(panels, next);
  }
  function toggleImageLayer(id) {
    const next = images.map((im) => (im.id === id ? { ...im, layer: im.layer === "back" ? "front" : "back" } : im));
    persist(panels, next);
  }
  function toggleImageFit(id) {
    const next = images.map((im) => (im.id === id ? { ...im, fit: im.fit === "cover" ? "contain" : "cover" } : im));
    persist(panels, next);
  }
  function toggleImageGrayscale(id) {
    const next = images.map((im) => (im.id === id ? { ...im, grayscale: !im.grayscale } : im));
    persist(panels, next);
  }
  function removeImage(id) {
    persist(panels, images.filter((im) => im.id !== id));
  }
  async function addImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgSaveError(null);
    try {
      const url = await uploadImageToStorage(file, { maxSize: 1000, folder: "clock-images" });
      const newImg = { id: `img-${Date.now()}`, x: 10, y: 10, w: 40, h: 40, imageData: url, layer: "back", fit: "contain" };
      persist(panels, [...images, newImg]);
    } catch (err) {
      console.error("addImage failed:", err);
      setBgSaveError(err?.message || "Échec de l'envoi de l'image.");
    }
    e.target.value = "";
  }

  async function handleTournamentBgImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBgSaveError(null);
    try {
      const url = await uploadImageToStorage(file, { maxSize: 1600, quality: 0.8, folder: "clock-backgrounds" });
      saveTournamentBg({ ...tournamentBg, type: "image", value: url });
    } catch (err) {
      console.error("handleTournamentBgImage failed:", err);
      setBgSaveError(err?.message || "Échec de l'envoi de l'image.");
    }
    e.target.value = "";
  }

  const [soundUploadError, setSoundUploadError] = useState(null);
  async function handleSoundUpload(e, urlKey, selectKey) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSoundUploadError(null);
    try {
      const ext = file.name.split(".").pop() || "mp3";
      const path = `clock-sounds/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
      const { error: uploadError } = await supabase.storage.from("pokerclock-media").upload(path, file, { contentType: file.type, upsert: true });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("pokerclock-media").getPublicUrl(path);
      updateStyle("timer", { [selectKey]: "custom", [urlKey]: urlData.publicUrl });
    } catch (err) {
      console.error("handleSoundUpload failed:", err);
      setSoundUploadError(err?.message || "Échec de l'envoi du son.");
    }
    e.target.value = "";
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else containerRef.current?.requestFullscreen();
  }

  function handleToolbarPointerDown(e) {
    e.preventDefault();
    toolbarDrag.current = { startX: e.clientX, startY: e.clientY, origX: toolbarOffset.x, origY: toolbarOffset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handleToolbarPointerMove(e) {
    if (!toolbarDrag.current) return;
    const d = toolbarDrag.current;
    setToolbarOffset({ x: d.origX + (e.clientX - d.startX), y: d.origY + (e.clientY - d.startY) });
  }
  function handleToolbarPointerUp(e) {
    toolbarDrag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function textStyle(style) {
    return {
      color: style.color,
      fontSize: `${style.fontSize}px`,
      textAlign: style.align,
      fontFamily: FONT_FAMILY[style.font] || FONT_FAMILY.display,
      fontWeight: style.bold ? "bold" : "normal",
      fontStyle: style.italic ? "italic" : "normal",
    };
  }
  function titleStyle(style) {
    return {
      fontSize: `${style.titleFontSize || 10}px`,
      textAlign: style.titlePosition === "left" || style.titlePosition === "right" ? "left" : style.align,
      color: style.titleColor || undefined,
      fontFamily: FONT_FAMILY[style.titleFont] || FONT_FAMILY.display,
      fontWeight: style.titleBold ? "bold" : "normal",
      fontStyle: style.titleItalic ? "italic" : "normal",
    };
  }
  // Enveloppe titre + contenu d'un panneau, pour pouvoir positionner le
  // titre en haut/bas/gauche/droite (au lieu de systématiquement au-dessus).
  const TITLE_FLEX_DIRECTION = { top: "flex-col", bottom: "flex-col-reverse", left: "flex-row", right: "flex-row-reverse" };
  function PanelBody({ style, title, children }) {
    const dir = TITLE_FLEX_DIRECTION[style.titlePosition] || "flex-col";
    const isRow = style.titlePosition === "left" || style.titlePosition === "right";
    const gap = style.titleGap ?? (isRow ? 8 : 4);
    return (
      <div className={`flex ${dir} ${isRow ? "items-center" : ""} w-full h-full`} style={{ gap: `${gap}px` }}>
        {style.showTitle && (
          <div className={`text-felt-cream/30 uppercase tracking-wide ${isRow ? "shrink-0" : ""}`} style={titleStyle(style)}>
            {title}
          </div>
        )}
        <div className={isRow ? "flex-1 min-w-0" : "w-full"}>{children}</div>
      </div>
    );
  }

  const backImages = images.filter((im) => im.layer !== "front");
  const frontImages = images.filter((im) => im.layer === "front");
  const removedTypes = Object.keys(panels).filter((k) => panels[k].removed);
  const panelBorderColor = theme.panelBorderColor;
  const snapTargets = useMemo(() => computeSnapTargets(panels), [panels]);

  const carouselTypes = ["structure", "eliminated", "headsup", "ranking", "winner"].filter(
    (t) => panels.carousel.style.included?.[t]
  );
  const eligible = carouselTypes.filter((t) => {
    if (t === "eliminated") return !!lastElimination;
    if (t === "headsup") return stillIn.length === 2;
    if (t === "ranking") return eliminations.length > 0;
    if (t === "winner") return isFinished;
    return true;
  });
  const currentCarouselType = eligible.length > 0 ? eligible[carouselIdx % eligible.length] : null;

  const bg = tournamentBg || theme.background;
  const clockBgStyle = bg?.type === "image" ? { backgroundColor: "#14181C" } : { backgroundColor: bg?.baseColor || bg?.value || "#14181C" };
  const bgImageLayerStyle =
    bg?.type === "image"
      ? {
          backgroundImage: `url(${bg.value})`,
          backgroundSize: "cover",
          backgroundPosition: `${bg.posX ?? 50}% ${bg.posY ?? 50}%`,
          transform: `scale(${1 + (bg.zoom || 0) / 100})`,
          filter: bg.grayscale ? "grayscale(1)" : undefined,
        }
      : null;
  const stripeBars = bg?.bars || [];
  const bgTintStyle =
    bg?.type === "image" && bg.tint?.color
      ? { backgroundColor: bg.tint.color, opacity: bg.tint.opacity ?? 0.5, mixBlendMode: "color" }
      : null;

  async function saveTournamentBg(next) {
    setTournamentBg(next);
    setBgSaveError(null);
    if (!tournamentId) return;
    try {
      const { error } = await supabase.from("tournaments").update({ clock_background: next }).eq("id", tournamentId);
      if (error) {
        console.error("saveTournamentBg failed:", error);
        setBgSaveError(error.message || "Échec de l'enregistrement du fond.");
      }
    } catch (err) {
      console.error("saveTournamentBg failed:", err);
      setBgSaveError(err?.message || "Échec de l'enregistrement du fond.");
    }
  }

  function addStripeBar() {
    const base = tournamentBg || { type: "color", value: "#14181C", bars: [] };
    const colors = ["#C9A15A", "#1E6FEB", "#D85A30", "#639922"];
    const nextColor = colors[(base.bars?.length || 0) % colors.length];
    const bars = [...(base.bars || []), { color: nextColor, opacity: 1, width: 40, x: 10 + (base.bars?.length || 0) * 15 }];
    saveTournamentBg({ ...base, bars });
  }

  function updateStripeBar(index, patch) {
    if (!tournamentBg?.bars) return;
    const bars = tournamentBg.bars.map((b, i) => (i === index ? { ...b, ...patch } : b));
    saveTournamentBg({ ...tournamentBg, bars });
  }

  function removeStripeBar(index) {
    if (!tournamentBg?.bars) return;
    const bars = tournamentBg.bars.filter((_, i) => i !== index);
    saveTournamentBg({ ...tournamentBg, bars });
  }

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden" style={clockBgStyle}>
      {bgImageLayerStyle && <div className="absolute inset-0 pointer-events-none" style={bgImageLayerStyle} />}
      {bgTintStyle && <div className="absolute inset-0 pointer-events-none" style={bgTintStyle} />}
      {stripeBars.map((bar, i) => (
        <div
          key={i}
          className="absolute inset-y-0 pointer-events-none"
          style={{
            left: `${bar.x ?? 0}%`,
            width: `${bar.width ?? 40}px`,
            backgroundColor: hexToRgba(bar.color || "#C9A15A", bar.opacity ?? 1),
          }}
        />
      ))}
      {!isFullscreen && (
        <div
          className="absolute top-2 right-2 z-40 flex flex-wrap justify-end items-center gap-1 max-w-[95%]"
          style={{ transform: `translate(${toolbarOffset.x}px, ${toolbarOffset.y}px)` }}
        >
          {canEdit && editing && (
            <span
              onPointerDown={handleToolbarPointerDown}
              onPointerMove={handleToolbarPointerMove}
              onPointerUp={handleToolbarPointerUp}
              title="Déplacer cette barre d'outils"
              className="cursor-move px-1.5 py-1.5 text-felt-cream/40 hover:text-felt-gold select-none"
              style={{ touchAction: "none" }}
            >
              ⠿
            </span>
          )}
          {canEdit && editing && (
            <>
              <button onClick={() => bgFileRef.current?.click()} className="text-xs px-3 py-1.5 rounded-md font-display bg-felt-panel border border-felt-cream/10 text-felt-cream/60">
                🖼 + Image
              </button>
              <input ref={bgFileRef} type="file" accept="image/*" onChange={addImage} className="hidden" />
              <div className="relative">
                <button onClick={() => setShowLibrary((v) => !v)} className="text-xs px-3 py-1.5 rounded-md font-display bg-felt-panel border border-felt-cream/10 text-felt-cream/60">
                  ➕ Panneau
                </button>
                {showLibrary && (
                  <div className="absolute top-9 right-0 bg-felt-bg border border-felt-gold/40 rounded-md p-2 w-48 text-xs text-felt-cream shadow-lg z-50">
                    {removedTypes.length === 0 ? (
                      <div className="text-felt-cream/40 px-2 py-1">Tous les panneaux sont déjà affichés.</div>
                    ) : (
                      removedTypes.map((k) => (
                        <button
                          key={k}
                          onClick={() => restorePanel(k)}
                          className="w-full text-left px-2 py-1.5 rounded hover:bg-felt-panel text-felt-cream/80"
                        >
                          + {PANEL_LABELS[k]}
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
              <div className="relative">
                <button
                  onClick={() => setShowBgPicker((v) => !v)}
                  className="text-xs px-3 py-1.5 rounded-md font-display bg-felt-panel border border-felt-cream/10 text-felt-cream/60"
                >
                  🎨 Fond
                </button>
                {showBgPicker && (
                  <div className="absolute top-9 right-0 bg-felt-bg border border-felt-gold/40 rounded-md p-3 w-60 text-xs text-felt-cream shadow-lg z-50 max-h-[70vh] overflow-y-auto">
                    <div className="mb-2 text-felt-cream/50">Fond de l'horloge (ce tournoi uniquement)</div>
                    {bgSaveError && (
                      <div className="mb-2 text-felt-alert text-[11px] bg-felt-alert/10 border border-felt-alert/30 rounded px-2 py-1">
                        ⚠ {bgSaveError}
                      </div>
                    )}
                    <input
                      type="color"
                      value={tournamentBg?.type === "color" || !tournamentBg?.type ? tournamentBg?.value || "#14181C" : "#14181C"}
                      onChange={(e) => saveTournamentBg({ ...tournamentBg, type: "color", value: e.target.value })}
                      className="w-full h-8 bg-transparent cursor-pointer mb-2"
                    />
                    <button
                      onClick={() => tournamentBgFileRef.current?.click()}
                      className="w-full text-left px-2 py-1.5 rounded hover:bg-felt-panel text-felt-cream/80 mb-1"
                    >
                      🖼 Utiliser une image
                    </button>
                    <input ref={tournamentBgFileRef} type="file" accept="image/*" onChange={handleTournamentBgImage} className="hidden" />

                    {tournamentBg?.type === "image" && (
                      <div className="border-t border-felt-cream/10 mt-2 pt-2">
                        <div className="text-felt-cream/50 mb-1">Ajuster l'image</div>
                        <label className="flex items-center gap-2 mb-1.5">
                          <span className="text-felt-cream/50 shrink-0 w-16">Zoom</span>
                          <input
                            type="range"
                            min="0"
                            max="150"
                            value={tournamentBg.zoom || 0}
                            onChange={(e) => saveTournamentBg({ ...tournamentBg, zoom: Number(e.target.value) })}
                            className="flex-1"
                          />
                        </label>
                        <label className="flex items-center gap-2 mb-1.5">
                          <span className="text-felt-cream/50 shrink-0 w-16">Position X</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={tournamentBg.posX ?? 50}
                            onChange={(e) => saveTournamentBg({ ...tournamentBg, posX: Number(e.target.value) })}
                            className="flex-1"
                          />
                        </label>
                        <label className="flex items-center gap-2 mb-2">
                          <span className="text-felt-cream/50 shrink-0 w-16">Position Y</span>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={tournamentBg.posY ?? 50}
                            onChange={(e) => saveTournamentBg({ ...tournamentBg, posY: Number(e.target.value) })}
                            className="flex-1"
                          />
                        </label>
                        {(tournamentBg.zoom || tournamentBg.posX != null || tournamentBg.posY != null) && (
                          <button
                            onClick={() => saveTournamentBg({ ...tournamentBg, zoom: 0, posX: 50, posY: 50 })}
                            className="text-felt-cream/40 hover:text-felt-cream text-[11px] mb-2"
                          >
                            ↺ Réinitialiser le cadrage
                          </button>
                        )}
                        <label className="flex items-center justify-between mb-2">
                          Image en noir et blanc
                          <input
                            type="checkbox"
                            checked={!!tournamentBg.grayscale}
                            onChange={(e) => saveTournamentBg({ ...tournamentBg, grayscale: e.target.checked })}
                          />
                        </label>
                        <div className="text-felt-cream/50 mb-1">Teinte sur l'image</div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <input
                            type="color"
                            value={tournamentBg.tint?.color || "#1E6FEB"}
                            onChange={(e) =>
                              saveTournamentBg({ ...tournamentBg, tint: { ...(tournamentBg.tint || {}), color: e.target.value, opacity: tournamentBg.tint?.opacity ?? 0.5 } })
                            }
                            className="w-8 h-6 bg-transparent cursor-pointer"
                          />
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={tournamentBg.tint?.opacity ?? 0.5}
                            onChange={(e) =>
                              saveTournamentBg({ ...tournamentBg, tint: { color: tournamentBg.tint?.color || "#1E6FEB", opacity: Number(e.target.value) } })
                            }
                            className="flex-1"
                          />
                        </div>
                        {tournamentBg.tint && (
                          <button
                            onClick={() => saveTournamentBg({ ...tournamentBg, tint: null })}
                            className="w-full text-left px-2 py-1 rounded hover:bg-felt-panel text-felt-cream/50"
                          >
                            Retirer la teinte
                          </button>
                        )}
                      </div>
                    )}

                    <div className="border-t border-felt-cream/10 mt-2 pt-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-felt-cream/50">Bandes de couleur</span>
                        <button onClick={addStripeBar} className="text-felt-gold/80 hover:text-felt-gold">
                          + Ajouter une bande
                        </button>
                      </div>
                      {stripeBars.length === 0 && <div className="text-felt-cream/30 text-[11px] mb-1">Aucune bande pour l'instant.</div>}
                      <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                        {stripeBars.map((bar, i) => (
                          <div key={i} className="bg-felt-panel/60 border border-felt-cream/10 rounded p-2">
                            <div className="flex items-center gap-2 mb-1.5">
                              <input
                                type="color"
                                value={bar.color || "#C9A15A"}
                                onChange={(e) => updateStripeBar(i, { color: e.target.value })}
                                className="w-7 h-6 bg-transparent cursor-pointer shrink-0"
                              />
                              <input
                                type="number"
                                title="Taille horizontale (px)"
                                value={bar.width ?? 40}
                                onChange={(e) => updateStripeBar(i, { width: Number(e.target.value) || 1 })}
                                className="w-14 bg-felt-bg border border-felt-cream/10 rounded px-1 py-1 text-felt-cream"
                              />
                              <button onClick={() => removeStripeBar(i)} className="ml-auto text-felt-alert/70 hover:text-felt-alert shrink-0">
                                ✕
                              </button>
                            </div>
                            <label className="flex items-center gap-2 mb-1">
                              <span className="text-felt-cream/40 shrink-0 w-16">Transparence</span>
                              <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={bar.opacity ?? 1}
                                onChange={(e) => updateStripeBar(i, { opacity: Number(e.target.value) })}
                                className="flex-1"
                              />
                            </label>
                            <label className="flex items-center gap-2">
                              <span className="text-felt-cream/40 shrink-0 w-16">Position</span>
                              <input
                                type="range"
                                min="0"
                                max="100"
                                value={bar.x ?? 0}
                                onChange={(e) => updateStripeBar(i, { x: Number(e.target.value) })}
                                className="flex-1"
                              />
                            </label>
                          </div>
                        ))}
                      </div>
                    </div>

                    {tournamentBg && (
                      <button
                        onClick={() => saveTournamentBg(null)}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-felt-panel text-felt-cream/60 mt-2 border-t border-felt-cream/10 pt-2"
                      >
                        ↺ Revenir au fond du club
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
          {canEdit && (
            <EditableButton
              groupKey="clock-toolbar"
              id="reorganize"
              onClick={() => {
                setEditing((v) => !v);
                setStylingId(null);
                setShowLibrary(false);
              }}
              className={`text-xs px-3 py-1.5 rounded-md font-display ${editing ? "bg-felt-gold text-felt-bg" : "bg-felt-panel border border-felt-cream/10 text-felt-cream/60"}`}
            >
              {editing ? "✓ Terminer la réorganisation" : "✥ Réorganiser l'affichage"}
            </EditableButton>
          )}
          {templateMode && onSaveLayout && (
            <button
              onClick={() => onSaveLayout(panels, images, tournamentBg)}
              className="text-xs px-3 py-1.5 rounded-md font-display bg-felt-gold text-felt-bg"
            >
              💾 Enregistrer le modèle
            </button>
          )}
          {!templateMode && (
            <EditableButton
              groupKey="clock-toolbar"
              id="fullscreen"
              defaultOrder={1}
              onClick={toggleFullscreen}
              className="text-xs px-3 py-1.5 rounded-md font-display bg-felt-panel border border-felt-cream/10 text-felt-cream/60"
            >
              ⛶ Plein écran
            </EditableButton>
          )}
        </div>
      )}


      {backImages.map((im) => (
        <ImagePanel key={im.id} img={im} editing={editing} containerRef={containerRef} zIndex={1} onMove={moveImage} onCommit={commitImages} onResize={resizeImage} onToggleLayer={toggleImageLayer} onToggleFit={toggleImageFit} onToggleGrayscale={toggleImageGrayscale} onRemove={removeImage} />
      ))}

      {!panels.timer.removed && (
        <Panel id="timer" layout={panels.timer} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Horloge" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets} onUploadSound={handleSoundUpload}>
          <div className="flex items-center justify-between text-felt-cream/50 mb-2 px-1" style={{ fontSize: `${panels.timer.style.indicatorFontSize || 11}px` }}>
            {panels.timer.style.showElapsed !== false && <span>⏱ {formatTime(elapsedSeconds)}</span>}
            {panels.timer.style.showNextBreak !== false && <span>☕ {hasUpcomingBreak ? formatTime(breakInSeconds) : "--:--"}</span>}
          </div>
          <PanelBody
            style={panels.timer.style}
            title={
              currentLevel?.isBreak
                ? currentLevel.breakLabel || "PAUSE"
                : panels.timer.style.customTitle
                ? panels.timer.style.customTitle.replace(/\{n\}/g, levelIndex + 1)
                : `NIVEAU ${levelIndex + 1}`
            }
          >
            <div
              className="leading-none tabular-nums"
              style={{ ...textStyle(panels.timer.style), textAlign: panels.timer.style.centerTime ? "center" : textStyle(panels.timer.style).textAlign, width: "100%" }}
            >
              {formatTime(secondsLeft)}
            </div>
          </PanelBody>
          <div
            onClick={handleProgressClick}
            title="Cliquer pour ajuster le temps restant"
            className={`mt-3 h-1.5 bg-felt-bg rounded-full overflow-hidden mx-1 ${editing ? "" : "cursor-pointer hover:h-2.5 transition-[height]"}`}
          >
            <div
              className="h-full bg-felt-gold pointer-events-none"
              style={{ width: `${100 - (secondsLeft / ((currentLevel?.durationMinutes || 20) * 60)) * 100}%` }}
            />
          </div>
        </Panel>
      )}

      {!panels.controls.removed && (
        <Panel id="controls" layout={panels.controls} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Contrôles" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} showButtonOptions borderColor={panelBorderColor} snapTargets={snapTargets}>
          {panels.controls.style.showTitle && (
            <div className="text-felt-cream/30 uppercase tracking-wide mb-1" style={titleStyle(panels.controls.style)}>
              {panels.controls.style.customTitle || "Contrôles"}
            </div>
          )}
          {!editing && (
            <div className={`flex gap-2 ${panels.controls.style.buttonLayout === "col" ? "flex-col" : "flex-row"} ${H_ALIGN[panels.controls.style.buttonAlign] || "justify-center"}`}>
              <ClockBtn size={panels.controls.style.buttonSize} onClick={goToPrevLevel}>◀</ClockBtn>
              <ClockBtn size={panels.controls.style.buttonSize} primary color={panels.controls.style.buttonColor} onClick={toggleRunning}>
                {isRunning ? "Pause" : "Lecture"}
              </ClockBtn>
              <ClockBtn size={panels.controls.style.buttonSize} onClick={skipToNext}>▶</ClockBtn>
            </div>
          )}
          {editing && <div className="text-felt-cream/30 text-xs text-center">Lecture · Précédent · Suivant</div>}
        </Panel>
      )}

      {!panels.blinds.removed && (
        <Panel id="blinds" layout={panels.blinds} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Blinds" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          <PanelBody style={panels.blinds.style} title={panels.blinds.style.customTitle || "Blinds"}>
            {currentLevel && !currentLevel.isBreak ? (
              panels.blinds.style.blindsLayout === "row" ? (
                <div className="flex items-center justify-center gap-3">
                  <div style={textStyle(panels.blinds.style)}>{currentLevel.smallBlind}</div>
                  <div className="w-px h-6 bg-felt-cream/20" />
                  <div className="flex flex-col items-center">
                    <div style={textStyle(panels.blinds.style)}>{currentLevel.bigBlind}</div>
                    {currentLevel.ante > 0 && (
                      <>
                        <div className="text-felt-cream/30 uppercase tracking-wide text-[9px] mt-1">Ante</div>
                        <div className="text-felt-gold text-xs">{currentLevel.ante}</div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div style={textStyle(panels.blinds.style)}>{currentLevel.smallBlind}</div>
                  <div className="w-3/4 h-px bg-felt-cream/20 my-1" />
                  <div style={textStyle(panels.blinds.style)}>{currentLevel.bigBlind}</div>
                  {currentLevel.ante > 0 && <div className="text-felt-gold text-xs mt-1">({currentLevel.ante})</div>}
                </div>
              )
            ) : (
              <div className="text-felt-cream/50 text-sm text-center">Pause</div>
            )}
          </PanelBody>
        </Panel>
      )}

      {!panels.nextbreak.removed && (
        <Panel id="nextbreak" layout={panels.nextbreak} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Prochaine pause" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          <PanelBody style={panels.nextbreak.style} title={panels.nextbreak.style.customTitle || "Prochaine pause"}>
            <div className="tabular-nums" style={textStyle(panels.nextbreak.style)}>
              {hasUpcomingBreak ? formatTime(breakInSeconds) : "--:--"}
            </div>
          </PanelBody>
        </Panel>
      )}

      {!panels.customtext.removed && (
        <Panel id="customtext" layout={panels.customtext} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Texte libre" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          {panels.customtext.style.showTitle && (
            <div className="text-felt-cream/30 uppercase tracking-wide mb-1" style={titleStyle(panels.customtext.style)}>
              {panels.customtext.style.customTitle}
            </div>
          )}
          {editing ? (
            <input
              onPointerDown={(e) => e.stopPropagation()}
              value={panels.customtext.style.text || ""}
              onChange={(e) => updateStyle("customtext", { text: e.target.value })}
              placeholder="Votre texte ici"
              className="w-full bg-transparent border-b border-dashed border-felt-cream/30 outline-none"
              style={textStyle(panels.customtext.style)}
            />
          ) : (
            <div style={textStyle(panels.customtext.style)}>{panels.customtext.style.text || ""}</div>
          )}
        </Panel>
      )}

      {!panels.avgstack.removed && (
        <Panel id="avgstack" layout={panels.avgstack} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Tapis moyen" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          <PanelBody style={panels.avgstack.style} title={panels.avgstack.style.customTitle || "Tapis moyen"}>
            <div style={textStyle(panels.avgstack.style)}>
              {avgStack.toLocaleString()} <span className="text-felt-gold" style={{ fontSize: `${panels.avgstack.style.fontSize * 0.5}px` }}>({avgStackBB} BB)</span>
            </div>
          </PanelBody>
        </Panel>
      )}

      {!panels.playercount.removed && (
        <Panel id="playercount" layout={panels.playercount} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Joueurs (restant/total)" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          <PanelBody style={panels.playercount.style} title={panels.playercount.style.customTitle || "Joueurs"}>
            <div style={textStyle(panels.playercount.style)}>
              {stillIn.length}/{registrations.length}
            </div>
          </PanelBody>
        </Panel>
      )}

      {!panels.level.removed && (
        <Panel id="level" layout={panels.level} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Niveau" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          <PanelBody style={panels.level.style} title={panels.level.style.customTitle || "Niveau"}>
            <div style={textStyle(panels.level.style)}>
              {currentLevel?.isBreak ? currentLevel.breakLabel || "PAUSE" : levelIndex + 1}
            </div>
          </PanelBody>
        </Panel>
      )}

      {!panels.prizepool.removed && (
        <Panel id="prizepool" layout={panels.prizepool} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Prizepool" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          {panels.prizepool.style.showTitle && (
            <div className="text-felt-cream/30 uppercase tracking-wide mb-1 text-center" style={titleStyle(panels.prizepool.style)}>
              {panels.prizepool.style.customTitle || "Prizepool"}
            </div>
          )}
          <div className="overflow-y-auto" style={{ maxHeight: "100%" }}>
            {(panels.prizepool.style.payouts || []).map((p, i) => (
              <div key={i} className="flex items-center gap-2 mb-1" style={textStyle({ ...panels.prizepool.style, fontSize: panels.prizepool.style.fontSize * 0.8 })}>
                {editing ? (
                  <>
                    <input
                      onPointerDown={(e) => e.stopPropagation()}
                      value={p.position}
                      onChange={(e) => {
                        const payouts = panels.prizepool.style.payouts.map((r, j) => (j === i ? { ...r, position: e.target.value } : r));
                        updateStyle("prizepool", { payouts });
                      }}
                      placeholder="1er"
                      className="w-14 bg-transparent border-b border-dashed border-felt-cream/30 outline-none"
                    />
                    <input
                      onPointerDown={(e) => e.stopPropagation()}
                      value={p.amount}
                      onChange={(e) => {
                        const payouts = panels.prizepool.style.payouts.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r));
                        updateStyle("prizepool", { payouts });
                      }}
                      placeholder="500€"
                      className="flex-1 bg-transparent border-b border-dashed border-felt-cream/30 outline-none"
                    />
                    <button
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={() => updateStyle("prizepool", { payouts: panels.prizepool.style.payouts.filter((_, j) => j !== i) })}
                      className="text-felt-alert/70 hover:text-felt-alert text-xs"
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-felt-cream/50">{p.position}</span>
                    <span className="flex-1 text-right text-felt-gold">{p.amount}</span>
                  </>
                )}
              </div>
            ))}
          </div>
          {editing && (
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => updateStyle("prizepool", { payouts: [...(panels.prizepool.style.payouts || []), { position: "", amount: "" }] })}
              className="w-full text-center text-felt-gold/70 hover:text-felt-gold text-xs mt-1"
            >
              + Ajouter une position
            </button>
          )}
        </Panel>
      )}

      {!panels.players.removed && (
        <Panel id="players" layout={panels.players} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Joueurs" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          <PanelBody style={panels.players.style} title={panels.players.style.customTitle || "Joueurs"}>
            <div style={textStyle(panels.players.style)}>
              {stillIn.length}/{registrations.length}
            </div>
            <div className="text-felt-cream/40 mt-1" style={{ fontSize: `${panels.players.style.titleFontSize || 10}px`, textAlign: panels.players.style.align }}>TAPIS MOYEN</div>
            <div style={{ ...textStyle(panels.players.style), fontSize: `${panels.players.style.fontSize * 0.75}px` }}>
              {avgStack.toLocaleString()} <span className="text-felt-gold" style={{ fontSize: `${panels.players.style.fontSize * 0.4}px` }}>({avgStackBB} BB)</span>
            </div>
          </PanelBody>
        </Panel>
      )}

      {!panels.next.removed && (
        <Panel id="next" layout={panels.next} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Prochaine blind" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          <PanelBody style={panels.next.style} title={panels.next.style.customTitle || "Prochaine blind"}>
            {nextLevel ? (
              nextLevel.isBreak ? (
                <div style={textStyle(panels.next.style)}>{nextLevel.breakLabel || "Pause"}</div>
              ) : panels.next.style.blindsLayout === "stack" ? (
                <div className="flex flex-col items-center">
                  <div style={textStyle(panels.next.style)}>{nextLevel.smallBlind}</div>
                  <div className="w-3/4 h-px bg-felt-cream/20 my-1" />
                  <div style={textStyle(panels.next.style)}>{nextLevel.bigBlind}</div>
                  {nextLevel.ante > 0 && <div className="text-felt-gold text-xs mt-1">({nextLevel.ante})</div>}
                </div>
              ) : (
                <div className="flex items-center justify-center" style={{ gap: `${panels.next.style.itemGap ?? 8}px` }}>
                  <span style={textStyle(panels.next.style)}>{levelIndex + 2}</span>
                  <span style={textStyle(panels.next.style)}>
                    {nextLevel.smallBlind}/{nextLevel.bigBlind}
                  </span>
                  {nextLevel.ante > 0 && <span style={textStyle(panels.next.style)}>({nextLevel.ante})</span>}
                  {nextLevel.durationMinutes && <span style={textStyle(panels.next.style)}>{nextLevel.durationMinutes} min</span>}
                </div>
              )
            ) : (
              <div className="text-felt-cream/40 text-sm">Dernier niveau</div>
            )}
          </PanelBody>
        </Panel>
      )}

      {!panels.ranking.removed && (
        <Panel id="ranking" layout={panels.ranking} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Classement" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          {panels.ranking.style.showTitle && <div className="text-felt-cream/30 uppercase tracking-wide mb-2" style={titleStyle(panels.ranking.style)}>{panels.ranking.style.customTitle || "Classement"}</div>}
          <RankingContent style={panels.ranking.style} eliminations={eliminations} textStyle={textStyle} />
        </Panel>
      )}

      {!panels.structure.removed && (
        <Panel id="structure" layout={panels.structure} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Structure des blinds" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          {panels.structure.style.showTitle && <div className="text-felt-cream/30 uppercase tracking-wide mb-2" style={titleStyle(panels.structure.style)}>{panels.structure.style.customTitle || "Structure des blinds"}</div>}
          <StructureContent style={panels.structure.style} levels={levels} levelIndex={levelIndex} />
        </Panel>
      )}

      {!panels.eliminated.removed && (
        <Panel id="eliminated" layout={panels.eliminated} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Élimination" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} showAvatarOptions borderColor={panelBorderColor} snapTargets={snapTargets}>
          {panels.eliminated.style.showTitle && <div className="text-felt-cream/30 uppercase tracking-wide mb-2 text-center" style={titleStyle(panels.eliminated.style)}>{panels.eliminated.style.customTitle || "Élimination"}</div>}
          <EliminatedContent style={panels.eliminated.style} lastElimination={lastElimination} total={registrations.length} textStyle={textStyle} />
        </Panel>
      )}

      {!panels.headsup.removed && (
        <Panel id="headsup" layout={panels.headsup} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Heads Up" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} showAvatarOptions borderColor={panelBorderColor} snapTargets={snapTargets}>
          {panels.headsup.style.showTitle && <div className="text-felt-cream/30 uppercase tracking-wide mb-2 text-center" style={titleStyle(panels.headsup.style)}>{panels.headsup.style.customTitle || "Heads Up"}</div>}
          <HeadsupContent style={panels.headsup.style} stillIn={stillIn} textStyle={textStyle} />
        </Panel>
      )}

      {!panels.carousel.removed && (
        <Panel id="carousel" layout={panels.carousel} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Carrousel" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} showCarouselOptions onToggleCarouselIncluded={toggleCarouselIncluded} showAvatarOptions borderColor={panelBorderColor} snapTargets={snapTargets}>
          {panels.carousel.style.showTitle && (
            <div className="text-felt-cream/30 uppercase tracking-wide mb-2 text-center" style={titleStyle(panels.carousel.style)}>
              {panels.carousel.style.customTitle || (currentCarouselType ? CAROUSEL_LABELS[currentCarouselType] : "Carrousel")}
            </div>
          )}
          <div key={currentCarouselType} style={{ animation: "pcp-fade 400ms ease" }}>
            {currentCarouselType === "structure" && <StructureContent style={panels.carousel.style} levels={levels} levelIndex={levelIndex} />}
            {currentCarouselType === "eliminated" && <EliminatedContent style={panels.carousel.style} lastElimination={lastElimination} total={registrations.length} textStyle={textStyle} />}
            {currentCarouselType === "headsup" && <HeadsupContent style={panels.carousel.style} stillIn={stillIn} textStyle={textStyle} />}
            {currentCarouselType === "ranking" && <RankingContent style={panels.carousel.style} eliminations={eliminations} textStyle={textStyle} />}
            {currentCarouselType === "winner" && <WinnerContent style={panels.carousel.style} winner={winner} textStyle={textStyle} />}
            {!currentCarouselType && <div className="text-felt-cream/40 text-sm text-center">Rien à afficher pour l'instant</div>}
          </div>
        </Panel>
      )}

      {!panels.sponsors.removed && (
        <Panel id="sponsors" layout={panels.sponsors} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Sponsors" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} showSponsorOptions borderColor={panelBorderColor} snapTargets={snapTargets}>
          {panels.sponsors.style.showTitle && (
            <div className="text-felt-cream/30 uppercase tracking-wide mb-2 text-center" style={titleStyle(panels.sponsors.style)}>
              {panels.sponsors.style.customTitle || "Sponsors"}
            </div>
          )}
          <SponsorsContent style={panels.sponsors.style} sponsorIdx={sponsorIdx} />
        </Panel>
      )}

      {!panels.announcements.removed && (
        <Panel id="announcements" layout={panels.announcements} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Annonces" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          {panels.announcements.style.showTitle && (
            <div className="text-felt-cream/30 uppercase tracking-wide mb-2 text-center flex items-center justify-center gap-2" style={titleStyle(panels.announcements.style)}>
              {panels.announcements.style.customTitle || "Annonces"}
              {canEdit && !editing && (
                <button onClick={handleEditAnnouncement} className="text-felt-gold/70 hover:text-felt-gold" title="Modifier l'annonce">
                  ✎
                </button>
              )}
            </div>
          )}
          <AnnouncementsContent style={panels.announcements.style} announcement={announcement} textStyle={textStyle} />
        </Panel>
      )}

      {frontImages.map((im) => (
        <ImagePanel key={im.id} img={im} editing={editing} containerRef={containerRef} zIndex={20} onMove={moveImage} onCommit={commitImages} onResize={resizeImage} onToggleLayer={toggleImageLayer} onToggleFit={toggleImageFit} onToggleGrayscale={toggleImageGrayscale} onRemove={removeImage} />
      ))}

      <style>{`@keyframes pcp-fade { from { opacity: 0; transform: translateX(12px); } to { opacity: 1; transform: translateX(0); } }`}</style>
    </div>
  );
}

function Avatar({ data, name, size }) {
  if (data) {
    return <img src={data} alt="" style={{ width: size, height: size }} className="rounded-full object-cover" />;
  }
  return (
    <div style={{ width: size, height: size }} className="rounded-full bg-felt-bg flex items-center justify-center text-felt-cream/50 font-display">
      {name?.[0]?.toUpperCase() || "?"}
    </div>
  );
}

function EliminatedContent({ style, lastElimination, total, textStyle }) {
  if (!lastElimination) return <div className="text-felt-cream/40 text-sm text-center">Aucune élimination</div>;
  return (
    <div className="flex flex-col items-center gap-1">
      <Avatar data={lastElimination.registrations?.accounts?.avatar_data} name={lastElimination.registrations?.players?.full_name} size={style.avatarSize || 88} />
      <div style={textStyle(style)}>{lastElimination.registrations?.players?.full_name}</div>
      <div className="text-felt-gold text-xs">{lastElimination.finish_position} / {total}</div>
    </div>
  );
}

function HeadsupContent({ style, stillIn, textStyle }) {
  if (stillIn.length !== 2) return <div className="text-felt-cream/40 text-sm text-center">{stillIn.length} joueurs restants</div>;
  return (
    <div className="flex items-center justify-center gap-6">
      {stillIn.map((r) => (
        <div key={r.id} className="flex flex-col items-center gap-1">
          <Avatar data={r.accounts?.avatar_data} name={r.players?.full_name} size={style.avatarSize || 88} />
          <div style={textStyle(style)} className="text-center">{r.players?.full_name}</div>
        </div>
      ))}
    </div>
  );
}

function RankingContent({ style, eliminations, textStyle }) {
  if (eliminations.length === 0) return <div className="text-felt-cream/40 text-xs">Aucune élimination pour l'instant.</div>;
  return (
    <div className="space-y-1 overflow-y-auto" style={{ ...textStyle(style), maxHeight: "calc(100% - 20px)" }}>
      {eliminations.map((e) => (
        <div key={e.id} className="flex items-center justify-between border-b border-felt-cream/5 pb-1">
          <span className="text-felt-gold/70">{e.finish_position}</span>
          <span className="flex-1 ml-2 truncate">{e.registrations?.players?.full_name}</span>
        </div>
      ))}
    </div>
  );
}

function WinnerContent({ style, winner, textStyle }) {
  if (!winner) return <div className="text-felt-cream/40 text-sm text-center">Tournoi en cours</div>;
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-3xl">🏆</div>
      <Avatar data={winner.accounts?.avatar_data} name={winner.players?.full_name} size={style.avatarSize || 104} />
      <div style={textStyle(style)}>{winner.players?.full_name}</div>
      <div className="text-felt-gold text-xs">Vainqueur</div>
    </div>
  );
}

function SponsorsContent({ style, sponsorIdx }) {
  const images = style.sponsorImages || [];
  if (images.length === 0) {
    return (
      <div className="text-felt-cream/30 text-sm text-center h-full flex items-center justify-center">
        Ajoute des logos sponsors via l'icône 🎨 en mode édition.
      </div>
    );
  }
  const current = images[sponsorIdx % images.length];
  return (
    <div key={sponsorIdx % images.length} className="w-full h-full flex items-center justify-center" style={{ animation: "pcp-fade 400ms ease" }}>
      <img src={current} alt="" className="max-w-full max-h-full object-contain" />
    </div>
  );
}

function AnnouncementsContent({ style, announcement, textStyle }) {
  if (!announcement?.trim()) {
    return <div className="text-felt-cream/30 text-sm text-center">Aucune annonce pour le moment.</div>;
  }
  return (
    <div className="w-full h-full flex items-center justify-center text-center break-words" style={textStyle(style)}>
      {announcement}
    </div>
  );
}

function StructureContent({ style, levels, levelIndex }) {
  const visible = levels.slice(levelIndex, levelIndex + 5);
  return (
    <div className="space-y-1 overflow-hidden" style={{ ...style && { fontFamily: FONT_FAMILY[style.font] || FONT_FAMILY.body } }}>
      {visible.map((l, i) => {
        const isCurrent = i === 0;
        return (
          <div
            key={levelIndex + i}
            className={`flex items-center gap-3 px-2 py-1.5 rounded ${isCurrent ? "bg-felt-gold/15" : ""}`}
            style={{ color: isCurrent ? "#C9A15A" : style.color, fontSize: `${isCurrent ? style.fontSize * 1.15 : style.fontSize * 0.85}px` }}
          >
            <span className="w-6 text-felt-cream/40 shrink-0">{levelIndex + i + 1}</span>
            <span className="w-10 text-felt-cream/40 shrink-0">{l.durationMinutes}'</span>
            <span className="flex-1 text-right">
              {l.isBreak ? l.breakLabel || "Pause" : `${l.smallBlind}/${l.bigBlind}${l.ante ? ` (${l.ante})` : ""}`}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function useDragResize(id, layout, editing, containerRef, onMove, onCommit, onResize, extraSkip, snapTargets) {
  const dragState = useRef(null);
  const resizeState = useRef(null);
  const snap = snapTargets || { xs: [], ys: [] };

  function handlePointerDown(e) {
    if (!editing) return;
    if (e.target.dataset.resizeHandle || e.target.closest("[data-style-popover]") || e.target.closest("[data-panel-toolbar]")) return;
    if (extraSkip && extraSkip(e)) return;
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: layout.x, origY: layout.y, rectW: rect.width, rectH: rect.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e) {
    if (!dragState.current) return;
    const d = dragState.current;
    const dxPct = ((e.clientX - d.startX) / d.rectW) * 100;
    const dyPct = ((e.clientY - d.startY) / d.rectH) * 100;
    let x = clamp(d.origX + dxPct, -20, 100);
    let y = clamp(d.origY + dyPct, -20, 100);
    x = snapSegment(x, layout.w, snap.xs);
    y = snapSegment(y, layout.h, snap.ys);
    onMove(id, x, y);
  }
  function handlePointerUp(e) {
    if (!dragState.current) return;
    dragState.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    onCommit();
  }
  function handleResizePointerDown(e) {
    e.stopPropagation();
    e.preventDefault();
    const rect = containerRef.current.getBoundingClientRect();
    resizeState.current = { startX: e.clientX, startY: e.clientY, origW: layout.w, origH: layout.h, rectW: rect.width, rectH: rect.height };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function computeCornerResize(e) {
    const d = resizeState.current;
    const dwPct = ((e.clientX - d.startX) / d.rectW) * 100;
    const dhPct = ((e.clientY - d.startY) / d.rectH) * 100;
    let w = clamp(d.origW + dwPct, 8, 100);
    let h = clamp(d.origH + dhPct, 6, 100);
    const snappedRight = snapValue(layout.x + w, snap.xs);
    if (snappedRight !== layout.x + w) w = snappedRight - layout.x;
    const snappedBottom = snapValue(layout.y + h, snap.ys);
    if (snappedBottom !== layout.y + h) h = snappedBottom - layout.y;
    return { w, h };
  }
  function handleResizePointerMove(e) {
    if (!resizeState.current) return;
    const { w, h } = computeCornerResize(e);
    onResize(id, w, h, true);
  }
  function handleResizePointerUp(e) {
    if (!resizeState.current) return;
    const { w, h } = computeCornerResize(e);
    resizeState.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    onResize(id, w, h, false);
  }

  // Redimensionnement depuis un bord précis (n/s/e/w) : ajuste x/y en plus
  // de w/h selon le bord tiré, pour un contrôle plus fin qu'avec le seul
  // coin bas-droit. S'aimante lui aussi sur les bords des autres panneaux.
  const edgeState = useRef(null);
  function makeEdgeHandlers(edge, onEdgeResize) {
    function down(e) {
      e.stopPropagation();
      e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      edgeState.current = {
        startX: e.clientX,
        startY: e.clientY,
        origX: layout.x,
        origY: layout.y,
        origW: layout.w,
        origH: layout.h,
        rectW: rect.width,
        rectH: rect.height,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    function compute(e) {
      const d = edgeState.current;
      const dxPct = ((e.clientX - d.startX) / d.rectW) * 100;
      const dyPct = ((e.clientY - d.startY) / d.rectH) * 100;
      let { origX: x, origY: y, origW: w, origH: h } = d;
      if (edge === "e") {
        w = clamp(w + dxPct, 8, 100);
        const snapped = snapValue(x + w, snap.xs);
        if (snapped !== x + w) w = snapped - x;
      }
      if (edge === "w") {
        const newW = clamp(w - dxPct, 8, 100);
        let newX = x + (w - newW);
        const snapped = snapValue(newX, snap.xs);
        if (snapped !== newX) newX = snapped;
        w = x + w - newX;
        x = newX;
      }
      if (edge === "s") {
        h = clamp(h + dyPct, 6, 100);
        const snapped = snapValue(y + h, snap.ys);
        if (snapped !== y + h) h = snapped - y;
      }
      if (edge === "n") {
        const newH = clamp(h - dyPct, 6, 100);
        let newY = y + (h - newH);
        const snapped = snapValue(newY, snap.ys);
        if (snapped !== newY) newY = snapped;
        h = y + h - newY;
        y = newY;
      }
      return { x, y, w, h };
    }
    function move(e) {
      if (!edgeState.current) return;
      onEdgeResize(id, compute(e), true);
    }
    function up(e) {
      if (!edgeState.current) return;
      const patch = compute(e);
      edgeState.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      onEdgeResize(id, patch, false);
    }
    return { onPointerDown: down, onPointerMove: move, onPointerUp: up };
  }

  return {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleResizePointerDown,
    handleResizePointerMove,
    handleResizePointerUp,
    makeEdgeHandlers,
  };
}

function Panel({ id, layout, editing, containerRef, onMove, onCommit, onResize, onEdgeResize, onRemovePanel, defaultTitle, children, stylingId, setStylingId, onStyleChange, showButtonOptions, showCarouselOptions, onToggleCarouselIncluded, showSponsorOptions, showAvatarOptions, borderColor, snapTargets, onUploadSound }) {
  const isStyling = stylingId === id;
  const h = useDragResize(id, layout, editing, containerRef, onMove, onCommit, onResize, undefined, snapTargets);
  const noDefaultBg = layout.style.transparent || layout.style.bgColor;
  const bgStyle = layout.style.transparent ? { backgroundColor: "transparent" } : layout.style.bgColor ? { backgroundColor: layout.style.bgColor } : {};
  // Bordure : un panneau peut redéfinir la sienne (couleur propre ou "sans
  // bordure") ; sinon il suit le réglage global de Paramètres du club.
  const hasOverride = layout.style.borderOverride !== undefined && layout.style.borderOverride !== null;
  const effectiveBorder = hasOverride ? layout.style.borderOverride : borderColor;
  const borderStyle = !editing && effectiveBorder ? { borderColor: effectiveBorder } : {};

  return (
    <div
      onPointerDown={h.handlePointerDown}
      onPointerMove={h.handlePointerMove}
      onPointerUp={h.handlePointerUp}
      style={{ position: "absolute", left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.w}%`, height: `${layout.h}%`, zIndex: 10, touchAction: "none", ...bgStyle, ...borderStyle }}
      className={`rounded-md border p-3 ${!noDefaultBg ? "bg-felt-panel/95" : ""} ${editing ? "border-felt-gold cursor-move select-none" : (effectiveBorder ? "" : "border-felt-cream/10")}`}
    >
      {editing && (
        <div className="absolute top-1 right-1 flex gap-1 z-10">
          <button
            data-style-popover="1"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setStylingId(isStyling ? null : id)}
            className="text-[11px] text-felt-cream/40 hover:text-felt-gold"
          >
            🎨
          </button>
          <button
            data-style-popover="1"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onRemovePanel(id)}
            className="text-[11px] text-felt-cream/40 hover:text-felt-alert"
            title="Supprimer ce panneau"
          >
            🗑
          </button>
        </div>
      )}
      <div className="flex flex-col h-full overflow-hidden" style={{ justifyContent: V_ALIGN[layout.style.valign] || "flex-start" }}>
        {children}
      </div>
      {editing && (
        <div
          data-resize-handle="1"
          onPointerDown={h.handleResizePointerDown}
          onPointerMove={h.handleResizePointerMove}
          onPointerUp={h.handleResizePointerUp}
          style={{ touchAction: "none" }}
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize bg-felt-gold/40 rounded-tl"
        />
      )}
      {editing && onEdgeResize && (
        <>
          <div
            data-resize-handle="1"
            {...h.makeEdgeHandlers("n", onEdgeResize)}
            style={{ touchAction: "none", left: "50%", transform: "translateX(-50%)" }}
            className="absolute -top-1.5 w-4 h-3 cursor-n-resize bg-felt-gold/60 rounded-sm"
          />
          <div
            data-resize-handle="1"
            {...h.makeEdgeHandlers("s", onEdgeResize)}
            style={{ touchAction: "none", left: "50%", transform: "translateX(-50%)" }}
            className="absolute -bottom-1.5 w-4 h-3 cursor-s-resize bg-felt-gold/60 rounded-sm"
          />
          <div
            data-resize-handle="1"
            {...h.makeEdgeHandlers("w", onEdgeResize)}
            style={{ touchAction: "none", top: "50%", transform: "translateY(-50%)" }}
            className="absolute -left-1.5 h-4 w-3 cursor-w-resize bg-felt-gold/60 rounded-sm"
          />
          <div
            data-resize-handle="1"
            {...h.makeEdgeHandlers("e", onEdgeResize)}
            style={{ touchAction: "none", top: "50%", transform: "translateY(-50%)" }}
            className="absolute -right-1.5 h-4 w-3 cursor-e-resize bg-felt-gold/60 rounded-sm"
          />
        </>
      )}
      {isStyling && (
        <StylePopover
          style={layout.style}
          defaultTitle={defaultTitle}
          showButtonOptions={showButtonOptions}
          showCarouselOptions={showCarouselOptions}
          onToggleCarouselIncluded={onToggleCarouselIncluded}
          showSponsorOptions={showSponsorOptions}
          showAvatarOptions={showAvatarOptions}
          onChange={(patch) => onStyleChange(id, patch)}
          onClose={() => setStylingId(null)}
          onUploadSound={onUploadSound}
        />
      )}
    </div>
  );
}

function ImagePanel({ img, editing, containerRef, zIndex, onMove, onCommit, onResize, onToggleLayer, onToggleFit, onToggleGrayscale, onRemove }) {
  const h = useDragResize(img.id, img, editing, containerRef, onMove, onCommit, onResize, (e) => e.target.closest("[data-image-toolbar]"));
  const fit = img.fit === "cover" ? "cover" : "contain";

  return (
    <div
      onPointerDown={h.handlePointerDown}
      onPointerMove={h.handlePointerMove}
      onPointerUp={h.handlePointerUp}
      style={{ position: "absolute", left: `${img.x}%`, top: `${img.y}%`, width: `${img.w}%`, height: `${img.h}%`, zIndex, touchAction: "none", overflow: "hidden" }}
      className={editing ? "border-2 border-dashed border-felt-gold/50 cursor-move" : ""}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          backgroundImage: `url(${img.imageData})`,
          backgroundSize: fit,
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
          filter: img.grayscale ? "grayscale(1)" : undefined,
        }}
      />
      {editing && (
        <div data-image-toolbar="1" className="absolute top-1 left-1 flex gap-1 flex-wrap">
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onToggleLayer(img.id)}
            className="text-[10px] px-2 py-0.5 rounded bg-felt-bg/90 text-felt-cream border border-felt-gold/40"
          >
            {img.layer === "front" ? "⬇ Arrière-plan" : "⬆ Premier plan"}
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onToggleFit(img.id)}
            className="text-[10px] px-2 py-0.5 rounded bg-felt-bg/90 text-felt-cream border border-felt-gold/40"
          >
            {fit === "cover" ? "⛶ Remplir" : "⬚ Ajuster"}
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onToggleGrayscale(img.id)}
            className={`text-[10px] px-2 py-0.5 rounded border ${img.grayscale ? "bg-felt-gold text-felt-bg border-felt-gold" : "bg-felt-bg/90 text-felt-cream border-felt-gold/40"}`}
          >
            N&B
          </button>
          <button
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onRemove(img.id)}
            className="text-[10px] px-2 py-0.5 rounded bg-felt-alert/80 text-felt-cream"
          >
            🗑
          </button>
        </div>
      )}
      {editing && (
        <div
          data-resize-handle="1"
          onPointerDown={h.handleResizePointerDown}
          onPointerMove={h.handleResizePointerMove}
          onPointerUp={h.handleResizePointerUp}
          style={{ touchAction: "none" }}
          className="absolute bottom-0 right-0 w-5 h-5 cursor-se-resize bg-felt-gold/60 rounded-tl"
        />
      )}
    </div>
  );
}

function StylePopover({ style, defaultTitle, showButtonOptions, showCarouselOptions, onToggleCarouselIncluded, showSponsorOptions, showAvatarOptions, onChange, onClose, onUploadSound }) {
  return (
    <div
      data-style-popover="1"
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute z-20 top-6 right-1 bg-felt-bg border border-felt-gold/40 rounded-md p-3 w-56 text-xs text-felt-cream shadow-lg max-h-96 overflow-y-auto"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-display">Style du panneau</span>
        <button onClick={onClose} className="text-felt-cream/40 hover:text-felt-cream">✕</button>
      </div>
      <label className="flex items-center justify-between mb-2">
        Afficher le titre
        <input type="checkbox" checked={style.showTitle !== false} onChange={(e) => onChange({ showTitle: e.target.checked })} />
      </label>
      <label className="block mb-2">
        Titre
        <input
          value={style.customTitle || ""}
          onChange={(e) => onChange({ customTitle: e.target.value })}
          placeholder={defaultTitle}
          className="w-full mt-1 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream placeholder:text-felt-cream/30"
        />
        {defaultTitle === "Horloge" && (
          <div className="text-[10px] text-felt-cream/40 mt-1">
            Utilisez <code className="text-felt-gold/70">{"{n}"}</code> pour le numéro de niveau (ex: « LEVEL {"{n}"} »
            → LEVEL 1, LEVEL 2...). Sans ça, le texte reste figé et ne suit pas le niveau.
          </div>
        )}
      </label>
      <label className="flex items-center justify-between mb-2">
        Taille du titre (px)
        <input type="number" value={style.titleFontSize || 10} onChange={(e) => onChange({ titleFontSize: Number(e.target.value) || 8 })} className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1 py-0.5 text-felt-cream" />
      </label>
      {(defaultTitle === "Blinds" || defaultTitle === "Prochaine blind") && (
        <label className="flex items-center justify-between mb-2">
          Disposition des blinds
          <select
            value={style.blindsLayout || (defaultTitle === "Blinds" ? "stack" : "row")}
            onChange={(e) => onChange({ blindsLayout: e.target.value })}
            className="bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream"
          >
            <option value="stack">SB au-dessus de BB</option>
            <option value="row">SB à côté de BB</option>
          </select>
        </label>
      )}
      {defaultTitle === "Horloge" && (
        <>
          <label className="flex items-center justify-between mb-2">
            Afficher le temps total de jeu (⏱)
            <input type="checkbox" checked={style.showElapsed !== false} onChange={(e) => onChange({ showElapsed: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between mb-2">
            Afficher le minuteur vers la pause (☕)
            <input type="checkbox" checked={style.showNextBreak !== false} onChange={(e) => onChange({ showNextBreak: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between mb-2">
            Centrer le temps (sans toucher au titre)
            <input type="checkbox" checked={!!style.centerTime} onChange={(e) => onChange({ centerTime: e.target.checked })} />
          </label>
          <label className="flex items-center justify-between mb-2">
            Son à 1 minute restante
            <select
              value={style.oneMinuteSound || "none"}
              onChange={(e) => onChange({ oneMinuteSound: e.target.value })}
              className="bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream"
            >
              {SOUND_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {style.oneMinuteSound === "custom" && onUploadSound && (
            <label className="block mb-2 text-[11px] text-felt-cream/50">
              {style.oneMinuteSoundUrl ? "✓ Fichier importé — " : ""}
              <span className="cursor-pointer text-felt-gold/80 hover:text-felt-gold underline">
                {style.oneMinuteSoundUrl ? "remplacer" : "choisir un fichier audio"}
              </span>
              <input type="file" accept="audio/*" className="hidden" onChange={(e) => onUploadSound(e, "oneMinuteSoundUrl", "oneMinuteSound")} />
            </label>
          )}
          {style.oneMinuteSound && style.oneMinuteSound !== "none" && (style.oneMinuteSound !== "custom" || style.oneMinuteSoundUrl) && (
            <button
              type="button"
              onClick={() => playSound(style.oneMinuteSound, style.oneMinuteSoundUrl)}
              className="w-full text-center text-felt-gold/70 hover:text-felt-gold text-xs mb-2"
            >
              🔊 Tester le son
            </button>
          )}
          <label className="flex items-center justify-between mb-2">
            Son de fin de niveau
            <select
              value={style.levelEndSound || "none"}
              onChange={(e) => onChange({ levelEndSound: e.target.value })}
              className="bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream"
            >
              {SOUND_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          {style.levelEndSound === "custom" && onUploadSound && (
            <label className="block mb-2 text-[11px] text-felt-cream/50">
              {style.levelEndSoundUrl ? "✓ Fichier importé — " : ""}
              <span className="cursor-pointer text-felt-gold/80 hover:text-felt-gold underline">
                {style.levelEndSoundUrl ? "remplacer" : "choisir un fichier audio"}
              </span>
              <input type="file" accept="audio/*" className="hidden" onChange={(e) => onUploadSound(e, "levelEndSoundUrl", "levelEndSound")} />
            </label>
          )}
          {style.levelEndSound && style.levelEndSound !== "none" && (style.levelEndSound !== "custom" || style.levelEndSoundUrl) && (
            <button
              type="button"
              onClick={() => playSound(style.levelEndSound, style.levelEndSoundUrl)}
              className="w-full text-center text-felt-gold/70 hover:text-felt-gold text-xs mb-2"
            >
              🔊 Tester le son
            </button>
          )}
        </>
      )}
      {defaultTitle === "Prochaine blind" && style.blindsLayout !== "stack" && (
        <label className="flex items-center justify-between mb-2">
          Espace entre les données (px)
          <input
            type="number"
            value={style.itemGap ?? 8}
            onChange={(e) => onChange({ itemGap: Number(e.target.value) })}
            className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream"
          />
        </label>
      )}
      <label className="flex items-center justify-between mb-2">
        Position du titre
        <select
          value={style.titlePosition || "top"}
          onChange={(e) => onChange({ titlePosition: e.target.value })}
          className="bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream"
        >
          <option value="top">Haut</option>
          <option value="bottom">Bas</option>
          <option value="left">Gauche</option>
          <option value="right">Droite</option>
        </select>
      </label>
      <label className="flex items-center justify-between mb-2">
        Espace titre / contenu (px)
        <input
          type="number"
          value={style.titleGap ?? ""}
          placeholder="auto"
          onChange={(e) => onChange({ titleGap: e.target.value === "" ? null : Number(e.target.value) })}
          className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream placeholder:text-felt-cream/30"
        />
      </label>
      <label className="flex items-center justify-between mb-2">
        Couleur du titre
        <input type="color" value={style.titleColor || "#C9A15A"} onChange={(e) => onChange({ titleColor: e.target.value })} className="w-8 h-6 bg-transparent cursor-pointer" />
      </label>
      <label className="flex items-center justify-between mb-2">
        Police du titre
        <select value={style.titleFont || "display"} onChange={(e) => onChange({ titleFont: e.target.value })} className="bg-felt-panel border border-felt-cream/10 rounded px-1 py-0.5 text-felt-cream">
          <option value="display">Titre</option>
          <option value="body">Texte</option>
          <option value="mono">Mono</option>
          <option value="poster">Poster (bold arrondi)</option>
          <option value="anton">Affiche condensée</option>
          <option value="bungee">Bungee (rétro)</option>
          <option value="righteous">Righteous (rond, façon écran digital)</option>
          <option value="orbitron">Orbitron (futuriste/digital)</option>
          <option value="blackops">Black Ops (pochoir)</option>
          <option value="fjalla">Fjalla (condensée nette)</option>
          <option value="titanone">Titan One (bombée, façon sticker)</option>
          <option value="michroma">Michroma (technique/sci-fi)</option>
          <option value="audiowide">Audiowide (large, futuriste)</option>
          <option value="aldrich">Aldrich (technique, monospace)</option>
          <option value="zendots">Zen Dots (pointillé arrondi)</option>
          <option value="chewy">Chewy (rond enfantin)</option>
          <option value="baloo2">Baloo 2 (rond épais)</option>
        </select>
      </label>
      <label className="flex items-center justify-between mb-2">
        Style du titre
        <span className="flex gap-1">
          <button
            type="button"
            onClick={() => onChange({ titleBold: !style.titleBold })}
            className={`px-2 py-0.5 rounded border font-bold ${style.titleBold ? "bg-felt-gold text-felt-bg border-felt-gold" : "border-felt-cream/20 text-felt-cream/60"}`}
          >
            G
          </button>
          <button
            type="button"
            onClick={() => onChange({ titleItalic: !style.titleItalic })}
            className={`px-2 py-0.5 rounded border italic ${style.titleItalic ? "bg-felt-gold text-felt-bg border-felt-gold" : "border-felt-cream/20 text-felt-cream/60"}`}
          >
            I
          </button>
        </span>
      </label>
      <label className="flex items-center justify-between mb-2">
        Couleur du texte
        <input type="color" value={style.color} onChange={(e) => onChange({ color: e.target.value })} className="w-8 h-6 bg-transparent cursor-pointer" />
      </label>
      <label className="flex items-center justify-between mb-2">
        Taille du texte (px)
        <input type="number" value={style.fontSize} onChange={(e) => onChange({ fontSize: Number(e.target.value) || 12 })} className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1 py-0.5 text-felt-cream" />
      </label>
      <label className="flex items-center justify-between mb-2">
        Alignement horizontal
        <select value={style.align} onChange={(e) => onChange({ align: e.target.value })} className="bg-felt-panel border border-felt-cream/10 rounded px-1 py-0.5 text-felt-cream">
          <option value="left">Gauche</option>
          <option value="center">Centre</option>
          <option value="right">Droite</option>
        </select>
      </label>
      <label className="flex items-center justify-between mb-2">
        Alignement vertical
        <select value={style.valign || "top"} onChange={(e) => onChange({ valign: e.target.value })} className="bg-felt-panel border border-felt-cream/10 rounded px-1 py-0.5 text-felt-cream">
          <option value="top">Haut</option>
          <option value="center">Centre</option>
          <option value="bottom">Bas</option>
        </select>
      </label>
      <label className="flex items-center justify-between mb-2">
        Police
        <select value={style.font} onChange={(e) => onChange({ font: e.target.value })} className="bg-felt-panel border border-felt-cream/10 rounded px-1 py-0.5 text-felt-cream">
          <option value="display">Titre</option>
          <option value="body">Texte</option>
          <option value="mono">Mono</option>
          <option value="poster">Poster (bold arrondi)</option>
          <option value="anton">Affiche condensée</option>
          <option value="bungee">Bungee (rétro)</option>
          <option value="righteous">Righteous (rond, façon écran digital)</option>
          <option value="orbitron">Orbitron (futuriste/digital)</option>
          <option value="blackops">Black Ops (pochoir)</option>
          <option value="fjalla">Fjalla (condensée nette)</option>
          <option value="titanone">Titan One (bombée, façon sticker)</option>
          <option value="michroma">Michroma (technique/sci-fi)</option>
          <option value="audiowide">Audiowide (large, futuriste)</option>
          <option value="aldrich">Aldrich (technique, monospace)</option>
          <option value="zendots">Zen Dots (pointillé arrondi)</option>
          <option value="chewy">Chewy (rond enfantin)</option>
          <option value="baloo2">Baloo 2 (rond épais)</option>
        </select>
      </label>
      <label className="flex items-center justify-between mb-2">
        Style du texte
        <span className="flex gap-1">
          <button
            type="button"
            onClick={() => onChange({ bold: !style.bold })}
            className={`px-2 py-0.5 rounded border font-bold ${style.bold ? "bg-felt-gold text-felt-bg border-felt-gold" : "border-felt-cream/20 text-felt-cream/60"}`}
          >
            G
          </button>
          <button
            type="button"
            onClick={() => onChange({ italic: !style.italic })}
            className={`px-2 py-0.5 rounded border italic ${style.italic ? "bg-felt-gold text-felt-bg border-felt-gold" : "border-felt-cream/20 text-felt-cream/60"}`}
          >
            I
          </button>
        </span>
      </label>
      <div className="border-t border-felt-cream/10 my-2 pt-2 text-felt-cream/50">Fond du panneau</div>
      <label className="flex items-center justify-between mb-2">
        Transparent
        <input type="checkbox" checked={!!style.transparent} onChange={(e) => onChange({ transparent: e.target.checked })} />
      </label>
      <label className="flex items-center justify-between mb-2">
        Couleur de fond
        <input
          type="color"
          disabled={style.transparent}
          value={style.bgColor || "#1B2027"}
          onChange={(e) => onChange({ bgColor: e.target.value })}
          className="w-8 h-6 bg-transparent cursor-pointer disabled:opacity-30"
        />
      </label>
      {style.bgColor && !style.transparent && (
        <button onClick={() => onChange({ bgColor: null })} className="text-[11px] text-felt-cream/40 hover:text-felt-cream mb-2">
          Réinitialiser la couleur de fond
        </button>
      )}

      {showAvatarOptions && (
        <>
          <div className="border-t border-felt-cream/10 my-2 pt-2 text-felt-cream/50">Avatar</div>
          <label className="flex items-center justify-between mb-2">
            Taille (px)
            <input
              type="number"
              value={style.avatarSize || 88}
              onChange={(e) => onChange({ avatarSize: Number(e.target.value) || 40 })}
              className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1 py-0.5 text-felt-cream"
            />
          </label>
        </>
      )}

      <div className="border-t border-felt-cream/10 my-2 pt-2 text-felt-cream/50">Bordure de ce panneau</div>
      <select
        value={style.borderOverride == null ? "inherit" : style.borderOverride === "transparent" ? "none" : "custom"}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "inherit") onChange({ borderOverride: null });
          else if (v === "none") onChange({ borderOverride: "transparent" });
          else onChange({ borderOverride: style.borderOverride && style.borderOverride !== "transparent" ? style.borderOverride : "#3A3F47" });
        }}
        className="w-full mb-2 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream"
      >
        <option value="inherit">Réglage global (Paramètres du club)</option>
        <option value="none">Sans bordure</option>
        <option value="custom">Couleur personnalisée</option>
      </select>
      {style.borderOverride && style.borderOverride !== "transparent" && (
        <label className="flex items-center justify-between mb-2">
          Couleur
          <input
            type="color"
            value={style.borderOverride}
            onChange={(e) => onChange({ borderOverride: e.target.value })}
            className="w-8 h-6 bg-transparent cursor-pointer"
          />
        </label>
      )}

      {showButtonOptions && (
        <>
          <div className="border-t border-felt-cream/10 my-2 pt-2 text-felt-cream/50">Indicateurs (⏱/☕)</div>
          <label className="flex items-center justify-between mb-2">
            Taille (px)
            <input type="number" value={style.indicatorFontSize || 11} onChange={(e) => onChange({ indicatorFontSize: Number(e.target.value) || 8 })} className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1 py-0.5 text-felt-cream" />
          </label>
          <div className="border-t border-felt-cream/10 my-2 pt-2 text-felt-cream/50">Boutons</div>
          <label className="flex items-center justify-between mb-2">
            Taille
            <select value={style.buttonSize || "md"} onChange={(e) => onChange({ buttonSize: e.target.value })} className="bg-felt-panel border border-felt-cream/10 rounded px-1 py-0.5 text-felt-cream">
              <option value="sm">Petit</option>
              <option value="md">Moyen</option>
              <option value="lg">Grand</option>
            </select>
          </label>
          <label className="flex items-center justify-between mb-2">
            Disposition
            <select value={style.buttonLayout || "row"} onChange={(e) => onChange({ buttonLayout: e.target.value })} className="bg-felt-panel border border-felt-cream/10 rounded px-1 py-0.5 text-felt-cream">
              <option value="row">Ligne</option>
              <option value="col">Colonne</option>
            </select>
          </label>
          <label className="flex items-center justify-between mb-2">
            Alignement des boutons
            <select value={style.buttonAlign || "center"} onChange={(e) => onChange({ buttonAlign: e.target.value })} className="bg-felt-panel border border-felt-cream/10 rounded px-1 py-0.5 text-felt-cream">
              <option value="left">Gauche</option>
              <option value="center">Centre</option>
              <option value="right">Droite</option>
            </select>
          </label>
          <label className="flex items-center justify-between">
            Couleur du bouton principal
            <input type="color" value={style.buttonColor || "#C9A15A"} onChange={(e) => onChange({ buttonColor: e.target.value })} className="w-8 h-6 bg-transparent cursor-pointer" />
          </label>
        </>
      )}
      {showCarouselOptions && (
        <>
          <div className="border-t border-felt-cream/10 my-2 pt-2 text-felt-cream/50">Carrousel</div>
          <label className="flex items-center justify-between mb-2">
            Intervalle (s)
            <input type="number" value={style.intervalSeconds || 8} onChange={(e) => onChange({ intervalSeconds: Number(e.target.value) || 4 })} className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1 py-0.5 text-felt-cream" />
          </label>
          {Object.entries(CAROUSEL_LABELS).map(([key, label]) => (
            <label key={key} className="flex items-center justify-between mb-1">
              {label}
              <input type="checkbox" checked={style.included?.[key] !== false} onChange={() => onToggleCarouselIncluded(key)} />
            </label>
          ))}
        </>
      )}
      {showSponsorOptions && (
        <>
          <div className="border-t border-felt-cream/10 my-2 pt-2 text-felt-cream/50">Logos sponsors</div>
          <label className="flex items-center justify-between mb-2">
            Intervalle (s)
            <input type="number" value={style.intervalSeconds || 6} onChange={(e) => onChange({ intervalSeconds: Number(e.target.value) || 4 })} className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1 py-0.5 text-felt-cream" />
          </label>
          <label className="block mb-2 cursor-pointer text-felt-gold hover:text-felt-gold/80">
            + Ajouter des logos
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (files.length === 0) return;
                Promise.all(files.map((file) => uploadImageToStorage(file, { maxSize: 600, folder: "sponsor-logos" }))).then((urls) => {
                  onChange({ sponsorImages: [...(style.sponsorImages || []), ...urls] });
                });
                e.target.value = "";
              }}
            />
          </label>
          {(style.sponsorImages || []).length > 0 && (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {(style.sponsorImages || []).map((img, i) => (
                <div key={i} className="flex items-center gap-2 bg-felt-panel rounded px-2 py-1">
                  <img src={img} alt="" className="w-8 h-8 object-contain" />
                  <span className="flex-1 text-felt-cream/50 truncate">Logo {i + 1}</span>
                  <button
                    onClick={() => onChange({ sponsorImages: (style.sponsorImages || []).filter((_, idx) => idx !== i) })}
                    className="text-felt-alert/60 hover:text-felt-alert"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ClockBtn({ children, onClick, primary, size = "md", color }) {
  return (
    <button
      onClick={onClick}
      style={primary && color ? { backgroundColor: color, color: "#14181C" } : undefined}
      className={`rounded-md font-display ${BUTTON_SIZE[size] || BUTTON_SIZE.md} ${
        primary ? (color ? "" : "bg-felt-gold text-felt-bg") : "bg-felt-bg text-felt-cream border border-felt-cream/10"
      }`}
    >
      {children}
    </button>
  );
}
