import { useEffect, useRef, useState } from "react";
import { useAccount } from "../context/AccountContext.jsx";
import { useTheme } from "../context/ThemeContext.jsx";
import { canManageTournaments, canManageAccounts, ROLE_LABELS, fetchClubSettings, fetchAllAccounts } from "../lib/auth.js";
import ProfileModal from "./ProfileModal.jsx";
import ChatPanel from "./ChatPanel.jsx";

const COLLAPSE_KEY = "pcp_sidebar_collapsed";
const WIDTH_KEY = "pcp_sidebar_width";
const MIN_WIDTH = 180;
const MAX_WIDTH = 420;
const DEFAULT_WIDTH = 240;

/**
 * Sidebar — navigation latérale façon BlindValet : bandeau club en haut,
 * navigation (Tournois/Championnats), séparateur, Gérer les modèles/Gérer
 * les membres, séparateur, chat du club, contacter l'administrateur, puis
 * tout en bas Paramètres du club, séparateur, et l'espace personnel
 * (avatar centré, pseudo, Profil à gauche / Déconnexion à droite).
 * Teintée avec la couleur de fond choisie dans Paramètres du club,
 * repliable vers la droite et redimensionnable en glissant la barre de
 * séparation.
 *
 * Sur mobile (< sm), remplacée par une barre supérieure fixe (☰ + logo) et
 * un tiroir latéral en superposition — l'affichage desktop (>= sm) reste
 * inchangé, cette variante n'apparaît qu'en dessous du breakpoint sm.
 */
export default function Sidebar({ tab, setTab }) {
  const { account, logout } = useAccount();
  const { theme } = useTheme();
  const manage = canManageTournaments(account.role);
  const manageAccounts = canManageAccounts(account.role);
  const isStaffOnly = account.role === "floor" || account.role === "table_captain";
  const [showProfile, setShowProfile] = useState(false);
  const [clubCode, setClubCode] = useState("");
  const [adminEmail, setAdminEmail] = useState(null);
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
    fetchAllAccounts()
      .then((accs) => {
        const admin = accs.find((a) => a.role === "admin" && a.email);
        setAdminEmail(admin?.email || null);
      })
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

  // La barre de séparation sert à la fois de bouton (clic = replier/déplier)
  // et de poignée de redimensionnement (glisser = agrandir/rapetisser).
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

  function NavButton({ id, icon, label, onNavigate }) {
    return (
      <button
        onClick={() => onNavigate(id)}
        className={`w-full flex items-center gap-3 px-5 py-2.5 text-sm font-body text-left ${
          tab === id
            ? "bg-felt-gold/10 text-felt-gold border-r-2 border-felt-gold"
            : "text-white/90 hover:text-white hover:bg-black/20"
        }`}
      >
        <span className="text-base">{icon}</span>
        {label}
      </button>
    );
  }

  function Divider() {
    return <div className="border-t border-felt-gold/10 mx-5 my-3" />;
  }

  function NavList({ onNavigate }) {
    return (
      <nav className="flex-1 overflow-y-auto py-3 flex flex-col min-h-0">
        <NavButton id="tournaments" icon="🏆" label="Tournois" onNavigate={onNavigate} />
        {isStaffOnly && <NavButton id="eliminate" icon="🎯" label="Éliminer" onNavigate={onNavigate} />}
        <NavButton id="championship" icon="📊" label="Championnats" onNavigate={onNavigate} />

        <Divider />

        {manage && <NavButton id="templates" icon="▦" label="Gérer les modèles" onNavigate={onNavigate} />}
        {manageAccounts && <NavButton id="accounts" icon="👥" label="Gérer les membres" onNavigate={onNavigate} />}

        <Divider />

        <div className="px-5 pt-1 pb-1 text-xs font-display text-felt-cream/50 uppercase tracking-wide">
          💬 Chat du club
        </div>
        <div className="h-56 px-4 pb-2 shrink-0">
          <ChatPanel />
        </div>

        {adminEmail ? (
          <a
            href={`mailto:${adminEmail}`}
            className="w-full flex items-center gap-3 px-5 py-2.5 text-sm font-body text-left text-white/90 hover:text-white hover:bg-black/20"
          >
            📩 Contacter l'administrateur
          </a>
        ) : (
          <button
            onClick={() => alert("Aucun email d'administrateur renseigné — utilisez le chat du club.")}
            className="w-full flex items-center gap-3 px-5 py-2.5 text-sm font-body text-left text-white/90 hover:text-white hover:bg-black/20"
          >
            📩 Contacter l'administrateur
          </button>
        )}

        <div className="flex-1 min-h-4" />

        {manage && <NavButton id="settings" icon="⚙️" label="Paramètres du club" onNavigate={onNavigate} />}
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
            <img src={account.avatar_data} alt="" className="w-16 h-16 rounded-full object-cover mb-2" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-black/30 flex items-center justify-center text-felt-cream/50 font-display text-xl mb-2">
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
            👤 Profil
          </button>
          <button onClick={logout} className="flex items-center gap-1.5 text-sm text-white/70 hover:text-white">
            🚪 Déconnexion
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

      {/* Fond assombri + tiroir mobile */}
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
    </>
  );
}
