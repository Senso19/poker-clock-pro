import { useEffect, useRef, useState } from "react";

const BOX = 380;
const OUTPUT = 480;
// Le zoom peut descendre sous 1 pour faire rentrer l'image en entier.
const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3;
// Ce qui comble le cercle autour de l'image quand elle ne le remplit pas.
// Sans ce fond, le JPEG rendrait le vide en NOIR — un halo noir autour
// du portrait dès qu'on dézoome.
const FOND = "#14181C";

/**
 * AvatarCropper — petite fenêtre de recadrage : zoom (curseur) et
 * déplacement (glisser) de l'image dans un cadre rond, pour que la photo
 * s'adapte bien à l'avatar au lieu d'un recadrage automatique parfois raté.
 * Utilisé partout où un avatar est choisi (inscription, profil, admin).
 *
 * Le zoom et le déplacement sont appliqués séparément (position pour le
 * déplacement, transform scale pour le zoom) afin qu'ils n'interfèrent
 * jamais l'un avec l'autre.
 *
 * Le zoom descend sous 1 : à 1 l'image REMPLIT le cercle (la plus petite
 * de ses dimensions y est ajustée), ce qui rogne forcément une photo qui
 * n'est pas carrée. En dessous, elle rentre en entier, le fond comblant
 * les côtés — c'est souvent ce qu'on veut d'un portrait.
 */
export default function AvatarCropper({ file, onConfirm, onCancel }) {
  const [imgUrl, setImgUrl] = useState(null);
  const [natural, setNatural] = useState(null); // null tant que la taille réelle n'est pas connue
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const imgRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    setNatural(null);
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function captureNatural() {
    const img = imgRef.current;
    if (img && img.naturalWidth) {
      setNatural({ w: img.naturalWidth, h: img.naturalHeight });
    }
  }

  useEffect(() => {
    // Une image déjà en cache peut ne jamais déclencher l'évènement "load" ;
    // on vérifie donc aussi directement après le rendu.
    if (imgRef.current?.complete) captureNatural();
  }, [imgUrl]);

  const baseScale = natural ? Math.max(BOX / natural.w, BOX / natural.h) : 1;
  const displayW = natural ? natural.w * baseScale : BOX;
  const displayH = natural ? natural.h * baseScale : BOX;

  function handlePointerDown(e) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: offset.x, origY: offset.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function handlePointerMove(e) {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.origX + (e.clientX - dragRef.current.startX),
      y: dragRef.current.origY + (e.clientY - dragRef.current.startY),
    });
  }
  function handlePointerUp(e) {
    dragRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }

  function handleConfirm() {
    const img = imgRef.current;
    if (!img || !natural) return;
    const canvas = document.createElement("canvas");
    canvas.width = OUTPUT;
    canvas.height = OUTPUT;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = FOND;
    ctx.fillRect(0, 0, OUTPUT, OUTPUT);
    const scaleFactor = OUTPUT / BOX;
    ctx.save();
    ctx.translate(scaleFactor * (BOX / 2 + offset.x), scaleFactor * (BOX / 2 + offset.y));
    ctx.scale(baseScale * zoom * scaleFactor, baseScale * zoom * scaleFactor);
    ctx.drawImage(img, -natural.w / 2, -natural.h / 2);
    ctx.restore();
    onConfirm(canvas.toDataURL("image/jpeg", 0.85));
  }

  return (
    // Le recadreur est ouvert DEPUIS d'autres fenêtres (profil, membres du
    // club, comptes) dont le fond se ferme au clic. Sans cette barrière,
    // cliquer "Valider" ici refermait la fenêtre parente au passage, et le
    // nouvel avatar était perdu — d'où l'impression que le bouton ne
    // faisait rien.
    <div
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4"
    >
      <div className="bg-felt-panel border border-felt-cream/10 rounded-lg p-6 font-body text-felt-cream w-full max-w-md">
        <div className="font-display text-lg mb-4 text-center">Ajuster l'avatar</div>

        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          style={{ width: BOX, height: BOX, touchAction: "none" }}
          className="mx-auto rounded-full overflow-hidden border-2 border-felt-gold/50 relative cursor-move bg-felt-bg"
        >
          {imgUrl && (
            <img
              ref={imgRef}
              src={imgUrl}
              alt=""
              onLoad={captureNatural}
              draggable={false}
              style={{
                position: "absolute",
                left: `calc(50% + ${offset.x}px)`,
                top: `calc(50% + ${offset.y}px)`,
                width: displayW,
                height: displayH,
                transform: `translate(-50%, -50%) scale(${zoom})`,
                transformOrigin: "center center",
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        <div className="flex items-center gap-3 mt-4">
          <span className="text-felt-cream/50 text-xs shrink-0">Zoom</span>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-felt-cream/40 text-xs w-9 text-right shrink-0">{zoom.toFixed(1)}×</span>
        </div>
        <div className="text-felt-cream/30 text-[11px] text-center mt-1">
          Glisser l'image pour la recentrer. Sous 1×, elle rentre en entier dans le cercle.
        </div>

        <div className="flex gap-2 mt-5">
          <button onClick={onCancel} className="flex-1 px-4 py-2 text-felt-cream/60 hover:text-felt-cream">
            Annuler
          </button>
          <button onClick={handleConfirm} className="flex-1 px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display">
            Valider
          </button>
        </div>
      </div>
    </div>
  );
}
