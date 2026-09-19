import { useEffect, useRef, useState } from "react";
import { usePolling } from "../lib/usePolling.js";
import { saveClubTheme } from "../lib/clubSettings.js";
import { ChevronUp, ChevronDown, Minus, User, LogOut, Bell, Trophy, Target, BarChart3, LayoutGrid, Users, MessageCircle, Mail, Settings, ClipboardList, Shield } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useAccount } from "../context/AccountContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useEditMode } from "../context/EditModeContext.jsx";
import {
  canManageTournaments, canManageAccounts, canManageOwnClub, roleEffectif, roleLabel,
  canViewTournaments, canViewChampionships, canUseChat, canContactAdmin, canEliminatePlayers,
  canManageTemplates, canManageRegistrations, canManageClubSettings,
  fetchClubSettings, fetchPendingAccounts, fetchContactMessages, fetchPasswordResetRequests,
} from "../lib/auth.js";
import ProfileModal from "./ProfileModal.jsx";
import ContactAdminModal from "./ContactAdminModal.jsx";
import PendingAccountsModal from "./PendingAccountsModal.jsx";
import ChatPanel from "./ChatPanel.jsx";

const COLLAPSE_KEY = "pcp_sidebar_collapsed";
const WIDTH_KEY = "pcp_sidebar_width";
const MIN_WIDTH = 180;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 240;

const ITEM_DEFS = {
  tournaments: { icon: Trophy, label: "Tournois" },
  eliminate: { icon: Target, label: "Éliminer" },
  championship: { icon: BarChart3, label: "Championnats" },
  templates: { icon: LayoutGrid, label: "Gérer les modèles" },
  accounts: { icon: Users, label: "Gérer les membres" },
  myclub: { icon: Shield, label: "Mon club" },
  registrations: { icon: ClipboardList, label: "Inscriptions Festival et Open" },
  chat: { icon: MessageCircle, label: "Chat du club" },
  contact: { icon: Mail, label: "Contacter l'administrateur" },
  settings: { icon: Settings, label: "Paramètres du club" },
};
const DEFAULT_ORDER = [
  "tournaments",
  "eliminate",
  "championship",
  "templates",
  "accounts",
  "myclub",
  "registrations",
  "chat",
  "contact",
  "settings",
];
const DEFAULT_SEPARATORS = ["championship", "accounts"];
const DEFAULT_FONT_SIZE = 14;

/**
 * Sidebar — navigation latérale façon BlindValet. En mode personnalisation
 * (bouton flottant 🎨, admin uniquement), chaque élément affiche des
 * contrôles pour le monter/descendre, ajuster sa taille de texte
 * individuellement, et ajouter/retirer un trait de séparation juste après
 * lui — l'agencement complet est mémorisé dans club_settings.theme.
 */
export default function Sidebar({ tab, setTab, onRequestLogin }) {
  const { account, logout } = useAccount();
  const { theme, setTheme } = useTheme();
  const { isEditMode } = useEditMode();
  // Le rôle effectif : sans compte, ou avec un compte que personne n'a
  // encore confirmé, c'est « visiteur ».
  const role = roleEffectif(account);
  const manage = canManageTournaments(role);
  const manageAccounts = canManageAccounts(role);
  const manageOwnClub = canManageOwnClub(role);
  // L'onglet « Éliminer » est l'écran de ceux qui sortent les joueurs sans
  // gérer les tournois — le floor, le chef de table. Celui qui gère les
  // tournois le fait depuis la fiche du tournoi, l'onglet ferait double
  // emploi. C'était écrit en dur sur deux rôles, ici ET dans App.jsx : la
  // matrice ne commandait rien, et les deux copies pouvaient diverger.
  const ecranElimination = canEliminatePlayers(role) && !manage;
  const [showProfile, setShowProfile] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showPending, setShowPending] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [clubCode, setClubCode] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [width, setWidth] = useState(() => {
    try {
      const v = Number(localStorage.getItem(WIDTH_KEY));
      return v >= MIN_WIDTH && v <= MAX_WIDTH ? v : DEFAULT_WIDTH;
    } catch {
      return DEFAULT_WIDTH;
    }
  });
  const resizeDrag = useRef(null);

  useEffect(() => {
    fetchClubSettings()
      .then((s) => setClubCode(s?.registration_code || ""))
      .catch(() => {});
  }, []);

  function refreshPendingCount() {
    if (!manage) return;
    Promise.all([fetchPendingAccounts(), fetchContactMessages(), fetchPasswordResetRequests()])
      .then(([accounts, messages, resets]) => {
        const unreadMessages = messages.filter((m) => m.status === "new").length;
        setPendingCount(accounts.length + unreadMessages + resets.length);
      })
      .catch(() => {});
  }

  usePolling(refreshPendingCount, 20000, { actif: manage });

  useEffect(() => {
    try {
      localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [collapsed]);

  useEffect(() => {
    try {
      localStorage.setItem(WIDTH_KEY, String(width));
    } catch {
      /* ignore */
    }
  }, [width]);

  function handleBarPointerDown(e) {
    resizeDrag.current = { startX: e.clientX, startWidth: collapsed ? MIN_WIDTH : width, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handleBarPointerMove(e) {
    const d = resizeDrag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) d.moved = true;
    if (!d.moved) return;
    const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, d.startWidth + dx));
    if (collapsed) setCollapsed(false);
    setWidth(next);
  }
  function handleBarPointerUp(e) {
    const d = resizeDrag.current;
    resizeDrag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (d && !d.moved) {
      setCollapsed((c) => !c);
    }
  }

  const bg = theme.background;
  // Couleur propre au bandeau de gauche. Sans réglage, il suit le fond
  // général comme avant — mais il n'était alors PAS réglable à part : une
  // photo en fond d'écran le laissait sur sa couleur de repli.
  const sidebarColor = theme.sidebarColor || (bg?.type === "color" ? bg.value : "#1B2027");
  const logoData = theme.logoData;

  function handleNav(key) {
    setTab(key);
    setMobileOpen(false);
  }

  // --- Mode personnalisation de la barre latérale ------------------------
  const sidebarCfg = theme.sidebarConfig || {};
  const order = [...(sidebarCfg.order || DEFAULT_ORDER).filter((k) => ITEM_DEFS[k] || k.startsWith("space-"))];
  DEFAULT_ORDER.forEach((k) => {
    if (!order.includes(k)) order.push(k);
  });
  const separators = new Set(sidebarCfg.separatorsAfter || DEFAULT_SEPARATORS);
  const fontSizes = sidebarCfg.fontSize || {};
  const spaceHeights = sidebarCfg.spaceHeight || {};

  async function persistSidebarConfig(nextCfg) {
    const nextTheme = { ...theme, sidebarConfig: nextCfg };
    setTheme(nextTheme);
    await saveClubTheme(nextTheme);
  }
  function moveItem(key, dir) {
    const idx = order.indexOf(key);
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= order.length) return;
    const next = [...order];
    [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
    persistSidebarConfig({ ...sidebarCfg, order: next });
  }
  function changeFontSize(key, delta) {
    const current = fontSizes[key] || DEFAULT_FONT_SIZE;
    const next = Math.max(10, Math.min(22, current + delta));
    persistSidebarConfig({ ...sidebarCfg, fontSize: { ...fontSizes, [key]: next } });
  }
  function toggleSeparator(key) {
    const next = new Set(separators);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    persistSidebarConfig({ ...sidebarCfg, separatorsAfter: [...next] });
  }
  function addSpace() {
    const key = `space-${Date.now()}`;
    persistSidebarConfig({
      ...sidebarCfg,
      order: [...order, key],
      spaceHeight: { ...spaceHeights, [key]: 16 },
    });
  }
  function changeSpaceHeight(key, delta) {
    const current = spaceHeights[key] || 16;
    const next = Math.max(4, Math.min(160, current + delta));
    persistSidebarConfig({ ...sidebarCfg, spaceHeight: { ...spaceHeights, [key]: next } });
  }
  function removeSpace(key) {
    const nextSeparators = new Set(separators);
    nextSeparators.delete(key);
    const nextHeights = { ...spaceHeights };
    delete nextHeights[key];
    persistSidebarConfig({
      ...sidebarCfg,
      order: order.filter((k) => k !== key),
      separatorsAfter: [...nextSeparators],
      spaceHeight: nextHeights,
    });
  }

  /**
   * Chaque onglet est commandé par un droit, y compris pour qui n'est pas
   * connecté : le visiteur est un rôle comme un autre (voir roleEffectif),
   * et l'administrateur peut régler ce qu'il voit.
   */
  function isVisible(key) {
    if (key.startsWith("space-")) return true;
    switch (key) {
      case "tournaments":
        return canViewTournaments(role);
      case "championship":
        return canViewChampionships(role);
      case "chat":
        return canUseChat(role);
      case "contact":
        return canContactAdmin(role);
      case "templates":
        return canManageTemplates(role);
      case "registrations":
        return canManageRegistrations(role);
      case "settings":
        return canManageClubSettings(role);
      case "accounts":
        return manageAccounts;
      case "myclub":
        return manageOwnClub;
      case "eliminate":
        return ecranElimination;
      default:
        return !!account;
    }
  }

  function Divider() {
    return <div className="border-t border-felt-gold/10 mx-5 my-3" />;
  }

  function renderNavList(onNavigate) {
    const visibleOrder = order.filter(isVisible);
    return (
      <nav className="flex-1 overflow-y-auto py-3 flex flex-col min-h-0">
        {isEditMode && (
          <button
            onClick={addSpace}
            className="mx-5 mb-2 px-2 py-1.5 text-xs border border-dashed border-felt-gold/40 rounded-md text-felt-gold/80 hover:text-felt-gold hover:border-felt-gold"
          >
            + Ajouter un espace
          </button>
        )}
        {visibleOrder.map((key) => {
          const isSpace = key.startsWith("space-");
          const def = ITEM_DEFS[key];
          const fs = fontSizes[key] || DEFAULT_FONT_SIZE;
          return (
            <div key={key}>
              <div className="flex items-center">
                <div className="flex-1 min-w-0">
                  {isSpace ? (
                    <div style={{ height: spaceHeights[key] || 16 }} />
                  ) : key === "chat" ? (
                    <>
                      <div
                        style={{ fontSize: fs * 0.75 }}
                        className="px-5 pt-1 pb-1 font-display text-felt-cream/50 uppercase tracking-wide flex items-center gap-2"
                      >
                        <def.icon size={14} className="text-white shrink-0" /> {def.label}
                      </div>
                      <div className="h-96 px-4 pb-2 shrink-0">
                        <ChatPanel />
                      </div>
                    </>
                  ) : key === "contact" ? (
                    <button
                      onClick={() => setShowContact(true)}
                      style={{ fontSize: fs }}
                      className="w-full flex items-center gap-3 px-5 py-2.5 font-body text-left text-white/90 hover:text-white hover:bg-black/20"
                    >
                      <span className="w-5 flex justify-center shrink-0">
                        <def.icon size={17} className="text-white" />
                      </span>
                      {def.label}
                    </button>
                  ) : (
                    <button
                      onClick={() => onNavigate(key)}
                      style={{ fontSize: fs }}
                      className={`w-full flex items-center gap-3 px-5 py-2.5 font-body text-left ${
                        tab === key
                          ? "bg-felt-gold/10 text-felt-gold border-r-2 border-felt-gold"
                          : "text-white/90 hover:text-white hover:bg-black/20"
                      }`}
                    >
                      <span className="w-5 flex justify-center shrink-0">
                        <def.icon size={17} className="text-white" />
                      </span>
                      {def.label}
                    </button>
                  )}
                </div>
                {isEditMode && (
                  <div className="flex items-center gap-0.5 pr-2 shrink-0">
                    <button onClick={() => moveItem(key, -1)} title="Monter" className="text-felt-cream/50 hover:text-white p-0.5">
                      <ChevronUp size={14} />
                    </button>
                    <button onClick={() => moveItem(key, 1)} title="Descendre" className="text-felt-cream/50 hover:text-white p-0.5">
                      <ChevronDown size={14} />
                    </button>
                    {isSpace ? (
                      <>
                        <button
                          onClick={() => changeSpaceHeight(key, -8)}
                          title="Réduire l'espace"
                          className="text-felt-cream/50 hover:text-white text-[10px] font-display px-0.5"
                        >
                          -
                        </button>
                        <button
                          onClick={() => changeSpaceHeight(key, 8)}
                          title="Agrandir l'espace"
                          className="text-felt-cream/50 hover:text-white text-[10px] font-display px-0.5"
                        >
                          +
                        </button>
                        <button
                          onClick={() => removeSpace(key)}
                          title="Supprimer cet espace"
                          className="text-felt-alert/60 hover:text-felt-alert p-0.5 text-xs"
                        >
                          🗑
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => changeFontSize(key, -1)}
                          title="Réduire le texte"
                          className="text-felt-cream/50 hover:text-white text-[10px] font-display px-0.5"
                        >
                          A-
                        </button>
                        <button
                          onClick={() => changeFontSize(key, 1)}
                          title="Agrandir le texte"
                          className="text-felt-cream/50 hover:text-white text-[10px] font-display px-0.5"
                        >
                          A+
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => toggleSeparator(key)}
                      title="Trait de séparation après cet élément"
                      className={`p-0.5 ${separators.has(key) ? "text-felt-gold" : "text-felt-cream/50"} hover:text-white`}
                    >
                      <Minus size={14} />
                    </button>
                  </div>
                )}
              </div>
              {separators.has(key) && <Divider />}
            </div>
          );
        })}
      </nav>
    );
  }

  function ClubHeader() {
    const [showHeaderStyle, setShowHeaderStyle] = useState(false);
    const hcfg = sidebarCfg.header || {};
    const py = hcfg.py || 16;
    const logoSize = hcfg.logoSize || 36;
    const titleSize = hcfg.titleSize || 16;

    function updateHeader(patch) {
      persistSidebarConfig({ ...sidebarCfg, header: { ...hcfg, ...patch } });
    }

    // Ferme le popover de réglages du bandeau dès qu'on clique ailleurs.
    useEffect(() => {
      if (!showHeaderStyle) return;
      const close = () => setShowHeaderStyle(false);
      document.addEventListener("click", close);
      return () => document.removeEventListener("click", close);
    }, [showHeaderStyle]);

    return (
      <div
        style={{ paddingTop: py, paddingBottom: py }}
        className="relative flex items-center gap-3 px-5 border-b border-felt-gold/10"
      >
        {logoData ? (
          <img
            src={logoData}
            alt=""
            style={{ height: logoSize, width: "auto", maxWidth: 160 }}
            className="object-contain shrink-0"
          />
        ) : (
          <div
            style={{ width: logoSize, height: logoSize }}
            className="rounded-full bg-felt-gold/15 border border-felt-gold/40 flex items-center justify-center text-felt-gold shrink-0"
          >
            ♠
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div
            style={{ fontSize: titleSize }}
            className="font-display text-white tracking-wide truncate"
          >
            19PokerClub
          </div>
          {clubCode && <div className="text-[11px] text-felt-cream/40 italic">Since 2014</div>}
        </div>
        {manage && (
          <button
            onClick={() => setShowPending(true)}
            title="Notifications"
            className="relative text-felt-cream/60 hover:text-white shrink-0"
          >
            <Bell size={18} />
            {pendingCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-felt-alert text-white text-[10px] leading-none rounded-full w-4 h-4 flex items-center justify-center">
                {pendingCount > 9 ? "9+" : pendingCount}
              </span>
            )}
          </button>
        )}
        {isEditMode && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowHeaderStyle((v) => !v);
            }}
            title="Personnaliser le bandeau du club"
            className="w-7 h-7 rounded-md bg-felt-gold text-felt-bg flex items-center justify-center text-xs shadow shrink-0"
          >
            🎨
          </button>
        )}
        {showHeaderStyle && (
          <div
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            className="absolute top-full right-3 mt-1 z-30 bg-felt-bg border border-felt-gold/40 rounded-md p-3 w-56 text-xs text-felt-cream shadow-lg"
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-display">Bandeau du club</span>
              <button onClick={() => setShowHeaderStyle(false)} className="text-felt-cream/40 hover:text-felt-cream">
                ✕
              </button>
            </div>
            <label className="flex items-center justify-between mb-2">
              Hauteur (marge, px)
              <input
                type="number"
                value={py}
                onChange={(e) => updateHeader({ py: Number(e.target.value) || 0 })}
                className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream"
              />
            </label>
            <label className="flex items-center justify-between mb-2">
              Taille du logo (px)
              <input
                type="number"
                value={logoSize}
                onChange={(e) => updateHeader({ logoSize: Number(e.target.value) || 20 })}
                className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream"
              />
            </label>
            <label className="flex items-center justify-between mb-2">
              Taille du texte (px)
              <input
                type="number"
                value={titleSize}
                onChange={(e) => updateHeader({ titleSize: Number(e.target.value) || 10 })}
                className="w-16 bg-felt-panel border border-felt-cream/10 rounded px-1.5 py-1 text-felt-cream"
              />
            </label>
            <button
              onClick={() => updateHeader({ py: null, logoSize: null, titleSize: null })}
              className="w-full text-center text-felt-cream/40 hover:text-felt-cream mt-1 py-1"
            >
              Réinitialiser
            </button>
          </div>
        )}
      </div>
    );
  }

  function ProfileFooter({ onNavigate }) {
    if (!account) {
      return (
        <div className="shrink-0 border-t border-felt-gold/10 py-4 px-5">
          <button
            onClick={() => {
              onRequestLogin?.();
              onNavigate?.();
            }}
            className="w-full text-center text-sm bg-felt-gold text-felt-bg rounded-md py-2 font-display"
          >
            Se connecter
          </button>
        </div>
      );
    }
    return (
      <div className="shrink-0 border-t border-felt-gold/10 py-4">
        <div className="flex flex-col items-center px-5 mb-3">
          {account.avatar_data ? (
            <img src={account.avatar_data} alt="" className="w-24 h-24 rounded-full object-cover mb-2" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-black/30 flex items-center justify-center text-felt-cream/50 font-display text-3xl mb-2">
              {account.pseudo?.[0]?.toUpperCase()}
            </div>
          )}
          <div className="text-sm text-white font-medium truncate max-w-full">{account.pseudo}</div>
          <div className="text-xs text-felt-cream/40 truncate">
            {/* « Joueur Aurillac » dit qui est la personne ; « Joueur
                interclub » non. Le libellé est calculé en un seul endroit
                (roleLabel) pour ne pas diverger d'un écran à l'autre. */}
            {roleLabel(account)}
          </div>
        </div>
        <div className="flex items-center justify-between px-5">
          <button
            onClick={() => {
              setShowProfile(true);
              onNavigate?.();
            }}
            className="flex items-center gap-1.5 text-sm text-white/90 hover:text-white"
          >
            <User size={16} className="text-white" /> Profil
          </button>
          <button onClick={logout} className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white">
            <LogOut size={16} className="text-white" /> Déconnexion
          </button>
        </div>
      </div>
    );
  }

  // Bandeau tout en haut de la barre, invitant un visiteur non connecté à
  // se connecter — la navigation reste en lecture seule (tournois et
  // championnats uniquement) tant qu'il ne l'a pas fait.
  function GuestBanner() {
    if (account) return null;
    return (
      <button
        onClick={() => onRequestLogin?.()}
        className="shrink-0 w-full text-center text-xs bg-felt-gold/15 hover:bg-felt-gold/25 text-felt-gold py-2 px-3 border-b border-felt-gold/20"
      >
        👤 Vous consultez en lecture seule — Se connecter
      </button>
    );
  }

  return (
    <>
      {/* Barre supérieure mobile (< sm uniquement) */}
      <div
        style={{ backgroundColor: sidebarColor }}
        className="sm:hidden fixed top-0 inset-x-0 z-30 flex items-center gap-3 px-4 border-b border-felt-gold/10 h-[calc(56px+env(safe-area-inset-top))] pt-[env(safe-area-inset-top)]"
      >
        {/* 44 x 44 px : la taille minimale d'une cible tactile. Le bouton
            ne faisait que 26 x 20 et il fallait viser. Le retrait négatif à
            gauche garde le pictogramme aligné sur le bord malgré sa boîte
            élargie. */}
        <button
          onClick={() => setMobileOpen(true)}
          className="-ml-2 w-11 h-11 shrink-0 flex items-center justify-center text-felt-cream text-2xl leading-none"
          aria-label="Ouvrir le menu"
        >
          ☰
        </button>
        {logoData ? (
          <img src={logoData} alt="" className="h-7 w-auto max-w-[100px] object-contain shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-full bg-felt-gold/15 border border-felt-gold/40 flex items-center justify-center text-felt-gold text-sm shrink-0">
            ♠
          </div>
        )}
        <div className="font-display text-sm text-felt-cream tracking-wide truncate">19PokerClub</div>
      </div>

      {mobileOpen && (
        <div className="sm:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setMobileOpen(false)} />
      )}
      <div
        style={{ backgroundColor: sidebarColor }}
        // Fermé, le tiroir est glissé hors de l'écran — mais son bord
        // droit affleure x = 0 et sa croix débordait sur l'écran. Il perd
        // donc aussi les gestes : sans quoi cette lisière invisible
        // captait les touchers près du bord gauche, là même où se trouve
        // le bouton d'ouverture.
        aria-hidden={!mobileOpen}
        className={`sm:hidden fixed inset-y-0 left-0 z-50 w-64 max-w-[80vw] flex flex-col transform transition-transform duration-200 pt-[env(safe-area-inset-top)] ${
          mobileOpen ? "translate-x-0" : "-translate-x-full pointer-events-none"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <ClubHeader />
          </div>
          {mobileOpen && (
            <button
              onClick={() => setMobileOpen(false)}
              className="w-11 h-11 shrink-0 flex items-center justify-center text-felt-cream/50 hover:text-felt-cream text-lg"
              aria-label="Fermer le menu"
            >
              ✕
            </button>
          )}
        </div>
        <GuestBanner />
        {renderNavList(handleNav)}
        <ProfileFooter onNavigate={() => setMobileOpen(false)} />
      </div>

      {/* Barre latérale desktop (>= sm), comportement inchangé */}
      <div className="hidden sm:flex h-full shrink-0">
        <div
          style={{ width: collapsed ? 0 : width, backgroundColor: sidebarColor, transition: resizeDrag.current ? "none" : "width 200ms ease" }}
          className="h-full overflow-hidden flex flex-col"
        >
          <div style={{ width }} className="h-full flex flex-col">
            <ClubHeader />
            <GuestBanner />
            {renderNavList((key) => setTab(key))}
            <ProfileFooter />
          </div>
        </div>

        <div
          onPointerDown={handleBarPointerDown}
          onPointerMove={handleBarPointerMove}
          onPointerUp={handleBarPointerUp}
          role="button"
          tabIndex={0}
          title={collapsed ? "Déployer le menu (glisser pour redimensionner)" : "Réduire le menu (glisser pour redimensionner)"}
          style={{
            touchAction: "none",
            width: theme.sidebarDividerWidth ? `${theme.sidebarDividerWidth}px` : undefined,
            backgroundColor: theme.sidebarDividerColor || undefined,
          }}
          className="h-full w-3 shrink-0 bg-felt-gold/20 hover:bg-felt-gold/40 flex items-center justify-center text-felt-cream/60 hover:text-felt-cream cursor-col-resize select-none"
        >
          <span className="text-[10px] pointer-events-none">{collapsed ? "›" : "‹"}</span>
        </div>
      </div>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showContact && <ContactAdminModal onClose={() => setShowContact(false)} />}
      {showPending && (
        <PendingAccountsModal onClose={() => setShowPending(false)} onChanged={refreshPendingCount} />
      )}
    </>
  );
}
