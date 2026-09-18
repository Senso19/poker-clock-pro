import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { setRolePermissionsOverride } from "../lib/auth.js";

const defaultTheme = {
  background: { type: "color", value: "#14181C" },
  spectatorMode: false,
};

// Le thème est relu toutes les 5 secondes, comme les données du tournoi,
// pour qu'un réglage changé depuis un autre appareil (couleur d'un
// panneau, style d'un bouton, montants abrégés…) arrive sur l'horloge de
// la salle sans avoir à recharger la page.
const SONDAGE_MS = 5000;

// Fenêtre pendant laquelle une écriture distante ne vient pas écraser ce
// qu'on est en train de régler ici. Sans elle, faire glisser un sélecteur
// de couleur (qui écrit à chaque mouvement) se ferait rattraper par une
// version plus ancienne revenant de la base.
const GARDE_EDITION_LOCALE_MS = 4000;

const ThemeContext = createContext({
  theme: defaultTheme,
  setTheme: () => {},
});

/**
 * Pose (ou retire) les couleurs d'interface réglables sur la racine du
 * document : les règles de index.css s'y accrochent. Un réglage vide
 * retire l'attribut, et tout reprend ses couleurs d'origine.
 */
function appliquerCouleursInterface(theme) {
  const racine = document.documentElement;
  if (theme.uiBorderColor) {
    racine.style.setProperty("--pcp-bordure", theme.uiBorderColor);
    racine.setAttribute("data-pcp-bordure", "");
  } else {
    racine.style.removeProperty("--pcp-bordure");
    racine.removeAttribute("data-pcp-bordure");
  }
  if (theme.uiTextColor) {
    racine.style.setProperty("--pcp-texte", theme.uiTextColor);
    racine.setAttribute("data-pcp-texte", "");
  } else {
    racine.style.removeProperty("--pcp-texte");
    racine.removeAttribute("data-pcp-texte");
  }
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(defaultTheme);
  const empreinteRef = useRef(null);
  const derniereEditionLocaleRef = useRef(0);

  // On horodate chaque changement local : cet appareil est en train de
  // régler quelque chose, la sonde doit lui laisser la main.
  const setTheme = useCallback((valeur) => {
    derniereEditionLocaleRef.current = Date.now();
    setThemeState(valeur);
  }, []);

  const relire = useCallback(async ({ force = false } = {}) => {
    if (!force && Date.now() - derniereEditionLocaleRef.current < GARDE_EDITION_LOCALE_MS) return;

    // Le thème pèse plus d'un mégaoctet : on sonde d'abord son empreinte
    // (32 octets, colonne générée côté Postgres) et on ne le relit que
    // s'il a réellement changé.
    const { data: sonde } = await supabase
      .from("club_settings")
      .select("id, theme_fingerprint")
      .limit(1)
      .maybeSingle();
    if (!sonde) return;
    if (!force && sonde.theme_fingerprint && sonde.theme_fingerprint === empreinteRef.current) return;

    const { data } = await supabase.from("club_settings").select("theme").eq("id", sonde.id).maybeSingle();
    if (!data?.theme || Object.keys(data.theme).length === 0) return;
    empreinteRef.current = sonde.theme_fingerprint ?? null;
    setThemeState({ ...defaultTheme, ...data.theme });
  }, []);

  useEffect(() => {
    relire({ force: true });
    const t = setInterval(() => {
      relire().catch(() => {});
    }, SONDAGE_MS);
    return () => clearInterval(t);
  }, [relire]);

  useEffect(() => {
    setRolePermissionsOverride(theme.rolePermissions);
  }, [theme.rolePermissions]);

  useEffect(() => {
    appliquerCouleursInterface(theme);
  }, [theme.uiBorderColor, theme.uiTextColor]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
