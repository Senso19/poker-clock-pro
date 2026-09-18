/**
 * imageUtils.js — compresse/redimensionne les images côté navigateur avant
 * de les stocker en base64 (avatars, logos, fonds, sponsors...). Sans ça,
 * une photo de téléphone (souvent 3-5 Mo) était stockée telle quelle et
 * retéléchargée à chaque chargement de page, d'où les lenteurs.
 */
export function compressImageFile(file, { maxSize = 640, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width >= height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        // JPEG partout sauf si l'image a de la transparence (logos, souvent
        // en PNG) — on la garde en PNG dans ce cas précis pour ne pas la
        // remplir de noir.
        const isPng = file.type === "image/png";
        const format = isPng ? "image/png" : "image/jpeg";
        resolve(canvas.toDataURL(format, quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/**
 * uploadImageToStorage — compresse un fichier puis l'envoie dans Supabase
 * Storage (bucket "pokerclock-media"), et renvoie son URL publique. À
 * utiliser pour toute image qui finirait autrement en base64 dans une
 * colonne partagée/fréquemment réécrite (fonds, bannières, logos posés sur
 * l'horloge...) — évite les lignes énormes en base et les timeouts
 * d'enregistrement. Les petites images individuelles (avatars) peuvent
 * rester en base64 via compressImageFile() ci-dessus, le gain n'en vaut
 * pas la peine pour elles.
 */
export async function uploadImageToStorage(file, { maxSize = 1200, quality = 0.82, folder = "misc" } = {}) {
  const dataUrl = await compressImageFile(file, { maxSize, quality });
  return uploadDataUrlToStorage(dataUrl, folder);
}

/**
 * uploadDataUrlToStorage — envoie une image DÉJÀ en base64 dans le bucket
 * et renvoie son URL publique. Sert à deux choses : l'envoi normal
 * ci-dessus (qui compresse d'abord), et la reprise des images déjà
 * stockées en base64 dans les colonnes JSON (voir mediaMigration.js).
 */
export async function uploadDataUrlToStorage(dataUrl, folder = "misc") {
  const { supabase } = await import("./supabase.js");
  const blob = await (await fetch(dataUrl)).blob();
  const ext = blob.type === "image/png" ? "png" : "jpg";
  const path = `${folder}/${Date.now()}-${Math.round(Math.random() * 1e6)}.${ext}`;
  const { error } = await supabase.storage.from("pokerclock-media").upload(path, blob, { contentType: blob.type, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("pokerclock-media").getPublicUrl(path);
  return data.publicUrl;
}
