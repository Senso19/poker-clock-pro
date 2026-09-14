import { QRCodeSVG } from "qrcode.react";
import { useTheme } from "../context/ThemeContext.jsx";

/**
 * TicketPrint — ticket imprimable (inscription / rebuy / add-on). Format
 * pensé pour imprimante thermique/A6. Utilise window.print() via la classe
 * .print-ticket (voir index.css).
 *
 * type: "buyin" | "rebuy" | "addon"
 */
export default function TicketPrint({
  type,
  festivalName,
  tournamentName,
  stageLabel,
  firstName,
  lastName,
  pseudo,
  club,
  table,
  seat,
  amount,
  tournamentDate,
  ticketId,
}) {
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
        {festivalName && <div className="text-center font-display text-lg font-bold uppercase leading-tight">{festivalName}</div>}
        <div
          className={`text-center font-display uppercase leading-tight mt-1 ${festivalName ? "text-sm" : "text-lg"}`}
        >
          {tournamentName}
        </div>
        {stageLabel && <div className="text-center font-display text-sm font-bold uppercase mt-1 leading-tight">{stageLabel}</div>}
        <div className="text-center text-[11px] uppercase tracking-wide mt-1.5 text-gray-500">{labels[type]}</div>

        <hr className="my-3 border-gray-400" />

        {(firstName || lastName) && (
          <div className="flex items-center justify-center gap-3 font-display font-bold text-base">
            {lastName && <span>{lastName}</span>}
            {firstName && <span>{firstName}</span>}
          </div>
        )}
        {pseudo && <div className="text-center text-sm text-gray-600 mt-0.5">{pseudo}</div>}
        {amount != null && <div className="text-center text-sm mt-1.5">Montant : {amount} €</div>}

        {(table != null || seat != null) && (
          <div className="grid grid-cols-2 gap-3 mt-4">
            {table != null && <BoxField label="Table" value={table} />}
            {seat != null && <BoxField label="Siège" value={seat} />}
          </div>
        )}

        {club && (
          <div className="mt-4">
            <div className="text-[10px] uppercase text-gray-500 text-center mb-1">Club</div>
            <div className="border border-black rounded-md px-3 py-1.5 text-center text-sm">{club}</div>
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

        {(theme.logoData || theme.partnerLogoData) && (
          <div className="flex items-center justify-center gap-4">
            {theme.logoData && <img src={theme.logoData} alt="" className="h-12 w-auto max-w-[45%] object-contain" />}
            {theme.partnerLogoData && <img src={theme.partnerLogoData} alt="" className="h-12 w-auto max-w-[45%] object-contain" />}
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
