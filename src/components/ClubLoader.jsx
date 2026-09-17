import { useTheme } from "../context/ThemeContext.jsx";

/**
 * ClubLoader — indicateur de chargement aux couleurs du club : le logo se
 * vide puis se remplit comme le sable d'un sablier (animation
 * `pcp-loader-sand`, définie dans index.css). Remplace les "Chargement…"
 * en texte seul, partout dans l'app.
 *
 * Le logo affiché est celui réglé dans "Paramètres du club"
 * (theme.logoData) ; à défaut on retombe sur l'icône de l'app, qui est
 * toujours présente. useTheme() a une valeur par défaut, ce composant
 * fonctionne donc aussi hors ThemeProvider (ex. formulaire d'inscription
 * public).
 */
export default function ClubLoader({ size = 96, label = "Chargement…", className = "" }) {
  const { theme } = useTheme();
  const src = theme?.logoData || "/icon-192.png";

  return (
    // w-full h-full : occupe toute la zone disponible pour que le logo
    // tombe au centre de la page, et pas collé en haut. Dans un parent de
    // hauteur automatique (une modale), h-full se résout en auto et ne
    // change donc rien.
    <div
      role="status"
      aria-label="Chargement en cours"
      className={`w-full h-full flex flex-col items-center justify-center gap-3 font-body ${className}`}
    >
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        {/* Copie fantôme : garde le logo lisible pendant qu'il se vide. */}
        <img src={src} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-contain opacity-20" />
        <img src={src} alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-contain pcp-loader-sand" />
      </div>
      {label && <div className="text-felt-cream/50 text-sm">{label}</div>}
    </div>
  );
}
