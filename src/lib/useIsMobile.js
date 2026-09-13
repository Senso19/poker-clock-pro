import { useEffect, useState } from "react";

/**
 * useIsMobile — détecte un écran de taille téléphone (largeur < 640px,
 * seuil "sm" de Tailwind) et se met à jour si l'écran change de taille
 * (rotation, redimensionnement de fenêtre).
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth < 640 : false
  );

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    function update() {
      setIsMobile(mql.matches);
    }
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isMobile;
}
