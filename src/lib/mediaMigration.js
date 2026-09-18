import { supabase } from "./supabase.js";
import { uploadDataUrlToStorage } from "./imageUtils.js";

/**
 * mediaMigration.js — reprise des images déjà stockées en base64.
 *
 * Les images ont longtemps été écrites directement dans les colonnes JSON
 * (fonds d'horloge, logos, sponsors, bannières de championnat). Une image
 * en base64 pèse un tiers de plus que le fichier d'origine, et surtout
 * elle est relue ET RÉÉCRITE en entier à chaque enregistrement de la
 * colonne qui la contient — un déplacement de panneau réécrivait ainsi
 * près d'un mégaoctet.
 *
 * Les nouveaux envois passent par le bucket depuis un moment ; il restait
 * l'existant. Cette reprise le déplace et remplace chaque base64 par
 * l'URL publique correspondante.
 *
 * Elle est REJOUABLE sans risque : une valeur déjà remplacée n'est plus
 * une data:URL, donc elle est ignorée au passage suivant.
 */
const CIBLES = [
  { table: "tournaments", colonnes: ["clock_layout", "clock_background"], dossier: "horloge" },
  { table: "club_settings", colonnes: ["theme"], dossier: "club" },
  { table: "clock_templates", colonnes: ["layout"], dossier: "modeles" },
  { table: "championships", colonnes: ["banner_image"], dossier: "championnats" },
];

const estDataUrl = (v) => typeof v === "string" && v.startsWith("data:image/");

/**
 * Parcours en profondeur : les images peuvent être n'importe où dans le
 * JSON (tableau d'images de fond, sponsors, logo d'un panneau…), on ne
 * peut donc pas se contenter de chemins connus à l'avance.
 *
 * Séquentiel et non en parallèle : un envoi groupé de huit images de
 * 300 ko depuis un téléphone en 4G finit en délai dépassé.
 */
async function remplacer(valeur, dossier, compteur) {
  if (estDataUrl(valeur)) {
    const url = await uploadDataUrlToStorage(valeur, dossier);
    compteur.images += 1;
    compteur.octets += valeur.length;
    return url;
  }
  if (Array.isArray(valeur)) {
    const sortie = [];
    for (const v of valeur) sortie.push(await remplacer(v, dossier, compteur));
    return sortie;
  }
  if (valeur && typeof valeur === "object") {
    const sortie = {};
    for (const [k, v] of Object.entries(valeur)) sortie[k] = await remplacer(v, dossier, compteur);
    return sortie;
  }
  return valeur;
}

export async function compterImagesEnBase64() {
  let lignes = 0;
  for (const cible of CIBLES) {
    const { data } = await supabase.from(cible.table).select(["id", ...cible.colonnes].join(","));
    for (const ligne of data || []) {
      if (cible.colonnes.some((c) => JSON.stringify(ligne[c] ?? null).includes("data:image/"))) lignes += 1;
    }
  }
  return lignes;
}

export async function migrerImagesVersStockage(onAvancement) {
  const compteur = { images: 0, octets: 0 };
  const erreurs = [];

  for (const cible of CIBLES) {
    const { data, error } = await supabase.from(cible.table).select(["id", ...cible.colonnes].join(","));
    if (error) {
      erreurs.push(`${cible.table} : ${error.message}`);
      continue;
    }
    for (const ligne of data || []) {
      const patch = {};
      for (const col of cible.colonnes) {
        if (!JSON.stringify(ligne[col] ?? null).includes("data:image/")) continue;
        try {
          patch[col] = await remplacer(ligne[col], cible.dossier, compteur);
        } catch (e) {
          erreurs.push(`${cible.table}.${col} : ${e.message}`);
        }
      }
      if (Object.keys(patch).length > 0) {
        // La ligne n'est réécrite qu'une fois toutes ses images envoyées :
        // une interruption en cours de route laisse donc la base intacte,
        // et la reprise suivante repart proprement.
        const { error: errMaj } = await supabase.from(cible.table).update(patch).eq("id", ligne.id);
        if (errMaj) erreurs.push(`${cible.table} (écriture) : ${errMaj.message}`);
      }
      onAvancement?.({ table: cible.table, ...compteur });
    }
  }

  return { ...compteur, erreurs };
}
