import { QRCodeSVG } from "qrcode.react";
import { useTheme } from "../context/ThemeContext.jsx";

/**
 * TicketPrint — ticket imprimable (inscription / rebuy / add-on). Format
 * pensé pour imprimante thermique/A6. Utilise window.print() via la classe
 * .print-ticket (voir index.css).
 *
 * type: "buyin" | "rebuy" | "addon"
 */
export default function TicketPrint({ type, tournamentName, stageLabel, player, table, seat, amount, tournamentDate, ticketId }) {
  const { theme } = useTheme();
  const labels = {
    buyin: "TICKET D'INSCRIPTION",
    rebuy: "TICKET DE REBUY",
    addon: "TICKET D'ADD-ON",
  };
  const printedAt = new Date().toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  function handlePrint() {
    window.print();
  }

  return (
    <div>
      <div className="print-ticket bg-white text-black w-[300px] p-5 font-body mx-auto border border-dashed border-gray-400">
        <div className="text-center font-display text-lg font-bold uppercase leading-tight">{tournamentName}</div>
        {stageLabel && <div className="text-center font-display text-sm font-bold uppercase mt-1 leading-tight">{stageLabel}</div>}
        <div className="text-center text-[11px] uppercase tracking-wide mt-1.5 text-gray-500">{labels[type]}</div>

        <hr className="my-3 border-gray-400" />

        <div className="text-center font-display font-bold text-base">{player}</div>
        {amount != null && <div className="text-center text-sm mt-1.5">Montant : {amount} €</div>}

        {(table != null || seat != null) && (
          <div className="grid grid-cols-2 gap-3 mt-4">
            {table != null && <BoxField label="Table" value={table} />}
            {seat != null && <BoxField label="Siège" value={seat} />}
          </div>
        )}

        <hr className="my-3 border-gray-400" />

        {tournamentDate && (
          <div className="text-center text-xs">
            Date du Tournoi : <strong>{tournamentDate}</strong>
          </div>
        )}
        <div className="text-center text-[10px] italic text-gray-500 mt-1">Imprimé le : {printedAt}</div>

        <hr className="my-3 border-gray-400" />

        {theme.logoData && (
          <div className="flex items-center justify-center">
            <img src={theme.logoData} alt="" className="h-12 w-auto max-w-full object-contain" />
          </div>
        )}

        <div className="flex justify-center mt-3">
          <QRCodeSVG value={ticketId} size={64} />
        </div>
        <div className="text-center text-[9px] mt-1 text-gray-400">{ticketId}</div>
      </div>

      <button
        onClick={handlePrint}
        className="mt-4 mx-auto block px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display"
      >
        Imprimer
      </button>
    </div>
  );
}

function BoxField({ label, value }) {
  return (
    <div className="text-center">
      <div className="text-[10px] uppercase text-gray-500 mb-1">{label}</div>
      <div className="border-2 border-black rounded-md px-3 py-1.5 font-display font-bold text-lg">{value}</div>
    </div>
  );
}
