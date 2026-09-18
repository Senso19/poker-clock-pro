import { QRCodeSVG } from "qrcode.react";
import { useTheme } from "../context/ThemeContext.jsx";

/**
 * JoinPosterPrint — l'affiche à scotcher à l'entrée du club : logo, nom du
 * club, grand QR code vers le site, et l'adresse écrite en toutes lettres
 * pour qui n'a pas de lecteur de QR sous la main.
 *
 * Même mécanique d'impression que le ticket : fond blanc, encre noire, et
 * la classe .print-affiche qui masque tout le reste de la page au moment
 * d'imprimer (voir index.css). Format pensé pour une feuille A4.
 */
export default function JoinPosterPrint({ url, clubName, titre, message, code }) {
  const { theme } = useTheme();
  return (
    <div>
      <div className="print-affiche bg-white text-black w-[420px] mx-auto px-8 py-10 text-center border border-dashed border-gray-400">
        {theme.logoData && <img src={theme.logoData} alt="" className="h-20 w-auto max-w-[220px] object-contain mx-auto mb-4" />}
        <div className="font-display text-2xl font-bold uppercase leading-tight">{clubName || "Notre club"}</div>
        {titre && <div className="font-display text-lg uppercase tracking-wide mt-3">{titre}</div>}
        {message && <div className="text-sm text-gray-600 mt-2 leading-snug whitespace-pre-line">{message}</div>}

        <div className="my-6 flex justify-center">
          {/* Marge blanche autour du code : sans elle, un QR posé au ras
              d'un bord ou d'une couleur devient difficile à lire. */}
          <div className="bg-white p-3 border border-gray-300 rounded">
            <QRCodeSVG value={url} size={220} level="M" />
          </div>
        </div>

        <div className="text-[13px] text-gray-500 uppercase tracking-wide">Ou rendez-vous sur</div>
        <div className="font-mono text-sm font-bold break-all mt-1">{url}</div>
        {code && (
          <div className="mt-4 text-sm">
            Code de validation : <span className="font-mono font-bold tracking-widest">{code}</span>
          </div>
        )}
      </div>

      <div className="text-center mt-4 print:hidden">
        <button onClick={() => window.print()} className="px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display text-sm">
          Imprimer
        </button>
      </div>
    </div>
  );
}
