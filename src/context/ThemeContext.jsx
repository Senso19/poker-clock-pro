import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";
import { setRolePermissionsOverride } from "../lib/auth.js";

const defaultTheme = {
  background: { type: "color", value: "#14181C" },
  spectatorMode: false,
};

const ThemeContext = createContext({
  theme: defaultTheme,
  setTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(defaultTheme);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("club_settings")
        .select("theme")
        .limit(1)
        .maybeSingle();
      if (data?.theme && Object.keys(data.theme).length > 0) {
        setTheme({ ...defaultTheme, ...data.theme });
      }
    })();
  }, []);

  useEffect(() => {
    setRolePermissionsOverride(theme.rolePermissions);
  }, [theme.rolePermissions]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
