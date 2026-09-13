import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { useTheme } from "../context/ThemeContext.jsx";
import { fetchCurrentTournament } from "../lib/tournaments.js";
import { saveClockState } from "../lib/clockState.js";
import { fetchClubSettings, setLiveAnnouncement } from "../lib/auth.js";
import { compressImageFile } from "../lib/imageUtils.js";

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
    style: { ...BASE_STYLE, fontSize: 60, align: "center", indicatorFontSize: 11 },
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
};

const PANEL_LABELS = {
  timer: "Horloge", controls: "Contrôles", blinds: "Blinds", players: "Joueurs", next: "Prochaine blind",
  ranking: "Classement", structure: "Structure des blinds", eliminated: "Élimination",
  headsup: "Heads Up", carousel: "Carrousel", sponsors: "Sponsors", announcements: "Annonces",
};

const FONT_FAMILY = { display: "'Oswald', sans-serif", body: "'Inter', sans-serif", mono: "monospace" };
const BUTTON_SIZE = { sm: "px-2 py-1 text-xs", md: "px-3 py-1.5 text-sm", lg: "px-5 py-3 text-lg" };
const H_ALIGN = { left: "justify-start", center: "justify-center", right: "justify-end" };
const V_ALIGN = { top: "flex-start", center: "center", bottom: "flex-end" };
const CAROUSEL_LABELS = { structure: "Structure des blinds", eliminated: "Élimination", headsup: "Heads Up", ranking: "Classement", winner: "Vainqueur" };

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

const SNAP_THRESHOLD = 1.5;

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
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRunning, levelIndex]);

  function goToNextLevel() {
    const next = levelIndex + 1;
    if (next < levels.length) setLevelIndex(next);
    else setIsRunning(false);
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
  function handleProgressClick(e) {
    if (editing) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = clamp((e.clientX - rect.left) / rect.width, 0, 1);
    const total = (currentLevel?.durationMinutes || 20) * 60;
    const newSecondsLeft = Math.round(total * (1 - fraction));
    setSecondsLeft(newSecondsLeft);
    persistNow(levelIndex, newSecondsLeft, isRunning);
  }
  function formatTime(s) {
    const total = Math.max(0, Math.floor(s || 0));
    const m = Math.floor(total / 60);
    const sec = total % 60;
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
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
  function removeImage(id) {
    persist(panels, images.filter((im) => im.id !== id));
  }
  async function addImage(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await compressImageFile(file, { maxSize: 1000 });
    const newImg = { id: `img-${Date.now()}`, x: 10, y: 10, w: 40, h: 40, imageData: dataUrl, layer: "back", fit: "contain" };
    persist(panels, [...images, newImg]);
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
    return { color: style.color, fontSize: `${style.fontSize}px`, textAlign: style.align, fontFamily: FONT_FAMILY[style.font] || FONT_FAMILY.display };
  }
  function titleStyle(style) {
    return { fontSize: `${style.titleFontSize || 10}px`, textAlign: style.align };
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

  const bg = theme.background;
  const clockBgStyle =
    bg?.type === "image"
      ? { backgroundImage: `url(${bg.value})`, backgroundSize: "cover", backgroundPosition: "center" }
      : { backgroundColor: bg?.value || "#14181C" };

  return (
    <div ref={containerRef} className="relative w-full h-full overflow-hidden" style={clockBgStyle}>
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
            </>
          )}
          {canEdit && (
            <button
              onClick={() => {
                setEditing((v) => !v);
                setStylingId(null);
                setShowLibrary(false);
              }}
              className={`text-xs px-3 py-1.5 rounded-md font-display ${editing ? "bg-felt-gold text-felt-bg" : "bg-felt-panel border border-felt-cream/10 text-felt-cream/60"}`}
            >
              {editing ? "✓ Terminer la réorganisation" : "✥ Réorganiser l'affichage"}
            </button>
          )}
          {templateMode && onSaveLayout && (
            <button
              onClick={() => onSaveLayout(panels, images)}
              className="text-xs px-3 py-1.5 rounded-md font-display bg-felt-gold text-felt-bg"
            >
              💾 Enregistrer le modèle
            </button>
          )}
          {!templateMode && (
            <button onClick={toggleFullscreen} className="text-xs px-3 py-1.5 rounded-md font-display bg-felt-panel border border-felt-cream/10 text-felt-cream/60">
              ⛶ Plein écran
            </button>
          )}
        </div>
      )}


      {backImages.map((im) => (
        <ImagePanel key={im.id} img={im} editing={editing} containerRef={containerRef} zIndex={1} onMove={moveImage} onCommit={commitImages} onResize={resizeImage} onToggleLayer={toggleImageLayer} onToggleFit={toggleImageFit} onRemove={removeImage} />
      ))}

      {!panels.timer.removed && (
        <Panel id="timer" layout={panels.timer} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Horloge" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          <div className="flex items-center justify-between text-felt-cream/50 mb-2 px-1" style={{ fontSize: `${panels.timer.style.indicatorFontSize || 11}px` }}>
            <span>⏱ {formatTime(elapsedSeconds)}</span>
            <span>☕ {hasUpcomingBreak ? formatTime(breakInSeconds) : "--:--"}</span>
          </div>
          {panels.timer.style.showTitle && (
            <div className="text-felt-gold/80 font-display tracking-wide mb-1" style={titleStyle(panels.timer.style)}>
              {panels.timer.style.customTitle || (currentLevel?.isBreak ? currentLevel.breakLabel || "PAUSE" : `NIVEAU ${levelIndex + 1}`)}
            </div>
          )}
          <div className="leading-none tabular-nums" style={textStyle(panels.timer.style)}>
            {formatTime(secondsLeft)}
          </div>
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
          {panels.blinds.style.showTitle && <div className="text-felt-cream/30 uppercase tracking-wide mb-1" style={titleStyle(panels.blinds.style)}>{panels.blinds.style.customTitle || "Blinds"}</div>}
          {currentLevel && !currentLevel.isBreak ? (
            <div className="flex flex-col items-center">
              <div style={textStyle(panels.blinds.style)}>{currentLevel.smallBlind}</div>
              <div className="w-3/4 h-px bg-felt-cream/20 my-1" />
              <div style={textStyle(panels.blinds.style)}>{currentLevel.bigBlind}</div>
              {currentLevel.ante > 0 && <div className="text-felt-gold text-xs mt-1">ante {currentLevel.ante}</div>}
            </div>
          ) : (
            <div className="text-felt-cream/50 text-sm text-center">Pause</div>
          )}
        </Panel>
      )}

      {!panels.players.removed && (
        <Panel id="players" layout={panels.players} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Joueurs" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          {panels.players.style.showTitle && <div className="text-felt-cream/30 uppercase tracking-wide mb-1" style={titleStyle(panels.players.style)}>{panels.players.style.customTitle || "Joueurs"}</div>}
          <div style={textStyle(panels.players.style)}>
            {stillIn.length}/{registrations.length}
          </div>
          <div className="text-felt-cream/40 mt-1" style={{ fontSize: `${panels.players.style.titleFontSize || 10}px`, textAlign: panels.players.style.align }}>TAPIS MOYEN</div>
          <div style={{ ...textStyle(panels.players.style), fontSize: `${panels.players.style.fontSize * 0.75}px` }}>
            {avgStack.toLocaleString()} <span className="text-felt-gold" style={{ fontSize: `${panels.players.style.fontSize * 0.4}px` }}>({avgStackBB} BB)</span>
          </div>
        </Panel>
      )}

      {!panels.next.removed && (
        <Panel id="next" layout={panels.next} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Prochaine blind" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          {panels.next.style.showTitle && <div className="text-felt-cream/30 uppercase tracking-wide mb-1" style={titleStyle(panels.next.style)}>{panels.next.style.customTitle || "Prochaine blind"}</div>}
          {nextLevel ? (
            <div style={textStyle(panels.next.style)}>
              {nextLevel.isBreak ? nextLevel.breakLabel || "Pause" : `${nextLevel.smallBlind}/${nextLevel.bigBlind}${nextLevel.ante ? ` (ante ${nextLevel.ante})` : ""}`}
            </div>
          ) : (
            <div className="text-felt-cream/40 text-sm">Dernier niveau</div>
          )}
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
        <Panel id="eliminated" layout={panels.eliminated} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Élimination" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          {panels.eliminated.style.showTitle && <div className="text-felt-cream/30 uppercase tracking-wide mb-2 text-center" style={titleStyle(panels.eliminated.style)}>{panels.eliminated.style.customTitle || "Élimination"}</div>}
          <EliminatedContent style={panels.eliminated.style} lastElimination={lastElimination} total={registrations.length} textStyle={textStyle} />
        </Panel>
      )}

      {!panels.headsup.removed && (
        <Panel id="headsup" layout={panels.headsup} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Heads Up" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} borderColor={panelBorderColor} snapTargets={snapTargets}>
          {panels.headsup.style.showTitle && <div className="text-felt-cream/30 uppercase tracking-wide mb-2 text-center" style={titleStyle(panels.headsup.style)}>{panels.headsup.style.customTitle || "Heads Up"}</div>}
          <HeadsupContent style={panels.headsup.style} stillIn={stillIn} textStyle={textStyle} />
        </Panel>
      )}

      {!panels.carousel.removed && (
        <Panel id="carousel" layout={panels.carousel} editing={editing} containerRef={containerRef} onMove={movePanel} onCommit={commitPanels} onResize={resizePanel} onEdgeResize={resizePanelEdge} onRemovePanel={removePanel} defaultTitle="Carrousel" stylingId={stylingId} setStylingId={setStylingId} onStyleChange={updateStyle} showCarouselOptions onToggleCarouselIncluded={toggleCarouselIncluded} borderColor={panelBorderColor} snapTargets={snapTargets}>
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
        <ImagePanel key={im.id} img={im} editing={editing} containerRef={containerRef} zIndex={20} onMove={moveImage} onCommit={commitImages} onResize={resizeImage} onToggleLayer={toggleImageLayer} onToggleFit={toggleImageFit} onRemove={removeImage} />
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
      <Avatar data={lastElimination.registrations?.accounts?.avatar_data} name={lastElimination.registrations?.players?.full_name} size={88} />
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
          <Avatar data={r.accounts?.avatar_data} name={r.players?.full_name} size={88} />
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
      <Avatar data={winner.accounts?.avatar_data} name={winner.players?.full_name} size={104} />
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

function Panel({ id, layout, editing, containerRef, onMove, onCommit, onResize, onEdgeResize, onRemovePanel, defaultTitle, children, stylingId, setStylingId, onStyleChange, showButtonOptions, showCarouselOptions, onToggleCarouselIncluded, showSponsorOptions, borderColor, snapTargets }) {
  const isStyling = stylingId === id;
  const h = useDragResize(id, layout, editing, containerRef, onMove, onCommit, onResize, undefined, snapTargets);
  const noDefaultBg = layout.style.transparent || layout.style.bgColor;
  const bgStyle = layout.style.transparent ? { backgroundColor: "transparent" } : layout.style.bgColor ? { backgroundColor: layout.style.bgColor } : {};
  const borderStyle = !editing && borderColor ? { borderColor } : {};

  return (
    <div
      onPointerDown={h.handlePointerDown}
      onPointerMove={h.handlePointerMove}
      onPointerUp={h.handlePointerUp}
      style={{ position: "absolute", left: `${layout.x}%`, top: `${layout.y}%`, width: `${layout.w}%`, height: `${layout.h}%`, zIndex: 10, touchAction: "none", ...bgStyle, ...borderStyle }}
      className={`rounded-md border p-3 ${!noDefaultBg ? "bg-felt-panel/95" : ""} ${editing ? "border-felt-gold cursor-move select-none" : (borderColor ? "" : "border-felt-cream/10")}`}
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
          onChange={(patch) => onStyleChange(id, patch)}
          onClose={() => setStylingId(null)}
        />
      )}
    </div>
  );
}

function ImagePanel({ img, editing, containerRef, zIndex, onMove, onCommit, onResize, onToggleLayer, onToggleFit, onRemove }) {
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

function StylePopover({ style, defaultTitle, showButtonOptions, showCarouselOptions, onToggleCarouselIncluded, showSponsorOptions, onChange, onClose }) {
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
      </label>
      <label className="flex items-center justify-between mb-2">
        Taille du titre (px)
        <input type="number" value={style.titleFontSize || 10} onChange={(e) => onChange({ titleFontSize: Number(e.target.value) || 8 })} className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1 py-0.5 text-felt-cream" />
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
        </select>
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
                Promise.all(files.map((file) => compressImageFile(file, { maxSize: 600 }))).then((dataUrls) => {
                  onChange({ sponsorImages: [...(style.sponsorImages || []), ...dataUrls] });
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
