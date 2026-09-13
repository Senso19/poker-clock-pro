import { useEffect, useRef, useState } from "react";
import { ChevronUp, ChevronDown, Minus, User, LogOut } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useAccount } from "../context/AccountContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { useEditMode } from "../context/EditModeContext.jsx";
import { canManageTournaments, canManageAccounts, ROLE_LABELS, fetchClubSettings } from "../lib/auth.js";
import ProfileModal from "./ProfileModal.jsx";
import ContactAdminModal from "./ContactAdminModal.jsx";
import ChatPanel from "./ChatPanel.jsx";

const COLLAPSE_KEY = "pcp_sidebar_collapsed";
const WIDTH_KEY = "pcp_sidebar_width";
const MIN_WIDTH = 180;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 240;

const ITEM_DEFS = {
  tournaments: { icon: "🏆", label: "Tournois" },
  eliminate: { icon: "🎯", label: "Éliminer" },
  championship: { icon: "📊", label: "Championnats" },
  templates: { icon: "▦", label: "Gérer les modèles" },
  accounts: { icon: "👥", label: "Gérer les membres" },
  chat: { icon: "💬", label: "Chat du club" },
  contact: { icon: "📩", label: "Contacter l'administrateur" },
  settings: { icon: "⚙️", label: "Paramètres du club" },
};
const DEFAULT_ORDER = ["tournaments", "eliminate", "championship", "templates", "accounts", "chat", "contact", "settings"];
const DEFAULT_SEPARATORS = ["championship", "accounts"];
const DEFAULT_FONT_SIZE = 14;

/**
 * Sidebar — navigation latérale façon BlindValet. En mode personnalisation
 * (bouton flottant 🎨, admin uniquement), chaque élément affiche des
 * contrôles pour le monter/descendre, ajuster sa taille de texte
 * individuellement, et ajouter/retirer un trait de séparation juste après
 * lui — l'agencement complet est mémorisé dans club_settings.theme.
 */
export default function Sidebar({ tab, setTab }) {
  const { account, logout } = useAccount();
  const { theme, setTheme } = useTheme();
  const { isEditMode } = useEditMode();
  const manage = canManageTournaments(account.role);
  const manageAccounts = canManageAccounts(account.role);
  const isStaffOnly = account.role === "floor" || account.role === "table_captain";
  const [showProfile, setShowProfile] = useState(false);
  const [showContact, setShowContact] = useState(false);
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
  const sidebarColor = bg?.type === "color" ? bg.value : "#1B2027";
  const logoData = theme.logoData;

  function handleNav(key) {
    setTab(key);
    setMobileOpen(false);
  }

  // --- Mode personnalisation de la barre latérale ------------------------
  const sidebarCfg = theme.sidebarConfig || {};
  const order = [...(sidebarCfg.order || DEFAULT_ORDER).filter((k) => ITEM_DEFS[k])];
  DEFAULT_ORDER.forEach((k) => {
    if (!order.includes(k)) order.push(k);
  });
  const separators = new Set(sidebarCfg.separatorsAfter || DEFAULT_SEPARATORS);
  const fontSizes = sidebarCfg.fontSize || {};

  async function persistSidebarConfig(nextCfg) {
    const nextTheme = { ...theme, sidebarConfig: nextCfg };
    setTheme(nextTheme);
    const { data: existing } = await supabase.from("club_settings").select("id").limit(1).maybeSingle();
    const payload = { club_name: "19PokerClub", theme: nextTheme };
    if (existing) await supabase.from("club_settings").update(payload).eq("id", existing.id);
    else await supabase.from("club_settings").insert(payload);
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

  function isVisible(key) {
    if (key === "templates" || key === "settings") return manage;
    if (key === "accounts") return manageAccounts;
    if (key === "eliminate") return isStaffOnly;
    return true;
  }

  function Divider() {
    return <div className="border-t border-felt-gold/10 mx-5 my-3" />;
  }

  function NavList({ onNavigate }) {
    const visibleOrder = order.filter(isVisible);
    return (
      <nav className="flex-1 overflow-y-auto py-3 flex flex-col min-h-0">
        {visibleOrder.map((key) => {
          const def = ITEM_DEFS[key];
          const fs = fontSizes[key] || DEFAULT_FONT_SIZE;
          return (
            <div key={key}>
              <div className="flex items-center">
                <div className="flex-1 min-w-0">
                  {key === "chat" ? (
                    <>
                      <div
                        style={{ fontSize: fs * 0.75 }}
                        className="px-5 pt-1 pb-1 font-display text-felt-cream/50 uppercase tracking-wide"
                      >
                        {def.icon} {def.label}
                      </div>
                      <div className="h-56 px-4 pb-2 shrink-0">
                        <ChatPanel />
                      </div>
                    </>
                  ) : key === "contact" ? (
                    <button
                      onClick={() => setShowContact(true)}
                      style={{ fontSize: fs }}
                      className="w-full flex items-center gap-3 px-5 py-2.5 font-body text-left text-white/90 hover:text-white hover:bg-black/20"
                    >
                      <span>{def.icon}</span>
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
                      <span>{def.icon}</span>
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
    return (
      <div className="flex items-center gap-3 px-5 py-4 border-b border-felt-gold/10">
        {logoData ? (
          <img src={logoData} alt="" className="w-9 h-9 rounded-full object-cover shrink-0" />
        ) : (
          <div className="w-9 h-9 rounded-full bg-felt-gold/15 border border-felt-gold/40 flex items-center justify-center text-felt-gold text-lg shrink-0">
            ♠
          </div>
        )}
        <div className="min-w-0">
          <div className="font-display text-base text-white tracking-wide truncate">19PokerClub</div>
          {clubCode && <div className="text-[11px] text-felt-cream/40">ID · {clubCode}</div>}
        </div>
      </div>
    );
  }

  function ProfileFooter({ onNavigate }) {
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
          <div className="text-xs text-felt-cream/40 truncate">{ROLE_LABELS[account.role]}</div>
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

  return (
    <>
      {/* Barre supérieure mobile (< sm uniquement) */}
      <div
        style={{ backgroundColor: sidebarColor }}
        className="sm:hidden fixed top-0 inset-x-0 z-30 h-14 flex items-center gap-3 px-4 border-b border-felt-gold/10"
      >
        <button
          onClick={() => setMobileOpen(true)}
          className="text-felt-cream text-xl leading-none px-1"
          aria-label="Ouvrir le menu"
        >
          ☰
        </button>
        {logoData ? (
          <img src={logoData} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" />
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
        className={`sm:hidden fixed inset-y-0 left-0 z-50 w-64 max-w-[80vw] flex flex-col transform transition-transform duration-200 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <ClubHeader />
          </div>
          <button
            onClick={() => setMobileOpen(false)}
            className="text-felt-cream/50 hover:text-felt-cream text-lg px-4"
            aria-label="Fermer le menu"
          >
            ✕
          </button>
        </div>
        <NavList onNavigate={handleNav} />
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
            <NavList onNavigate={(key) => setTab(key)} />
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
          style={{ touchAction: "none" }}
          className="h-full w-3 shrink-0 bg-felt-gold/20 hover:bg-felt-gold/40 flex items-center justify-center text-felt-cream/60 hover:text-felt-cream cursor-col-resize select-none"
        >
          <span className="text-[10px] pointer-events-none">{collapsed ? "›" : "‹"}</span>
        </div>
      </div>

      {showProfile && <ProfileModal onClose={() => setShowProfile(false)} />}
      {showContact && <ContactAdminModal onClose={() => setShowContact(false)} />}
    </>
  );
}
