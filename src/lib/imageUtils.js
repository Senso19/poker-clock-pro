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
