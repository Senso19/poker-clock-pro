/**
 * SheetsSync — import/export Excel + sync optionnelle Google Sheets.
 *
 * Import: lit un .xlsx/.csv de joueurs (colonnes attendues : Nom, Email, Téléphone)
 * Export: génère un .xlsx des résultats du tournoi (classement, gains)
 * Sync Sheets: POST vers un webhook Google Apps Script (même pattern que
 * tes formulaires 19PokerClub) — l'URL est stockée dans club_settings.sheets_webhook_url
 *
 * La librairie "xlsx" (lourde, ~300 Ko) est chargée à la demande (import()
 * dynamique) plutôt qu'au chargement de l'app, puisqu'elle n'est utile que
 * pour ces deux actions ponctuelles.
 */

export function importPlayersFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(e.target.result, { type: "binary" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet);
        const players = rows.map((r) => {
          // Reconnaît plusieurs formats d'export (dont BlindValet: souvent
          // "Player" ou "Name", parfois prénom/nom séparés).
          const first = r["Prénom"] || r["Prenom"] || r["First Name"] || r["FirstName"] || "";
          const last = r["Nom"] || r["Name"] || r["Last Name"] || r["LastName"] || "";
          const fullName =
            r["Nom complet"] || r["Full Name"] || r["Player"] || r["Player Name"] || r["Pseudo"] || r["Joueur"] ||
            (first && last ? `${first} ${last}` : first || last || "");
          return {
            fullName: String(fullName || "").trim(),
            email: r["Email"] || r["E-mail"] || "",
            phone: r["Téléphone"] || r["Telephone"] || r["Phone"] || r["Mobile"] || "",
          };
        });
        resolve(players);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsBinaryString(file);
  });
}

export async function exportResultsToExcel(tournamentName, results) {
  // results: [{ position, playerName, prize }]
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.json_to_sheet(
    results.map((r) => ({
      Position: r.position,
      Joueur: r.playerName,
      Gain: r.prize,
    }))
  );
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Résultats");
  XLSX.writeFile(wb, `${tournamentName}-resultats.xlsx`);
}

export async function syncToGoogleSheets(webhookUrl, payload) {
  if (!webhookUrl) throw new Error("Aucune URL de webhook Sheets configurée.");
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error("Échec de la synchronisation Sheets.");
  return res.json().catch(() => ({}));
}
