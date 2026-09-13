import { useEffect, useRef, useState } from "react";

const BOX = 240;
const OUTPUT = 320;

/**
 * AvatarCropper — petite fenêtre de recadrage : zoom (curseur) et
 * déplacement (glisser) de l'image dans un cadre rond, pour que la photo
 * s'adapte bien à l'avatar au lieu d'un recadrage automatique parfois raté.
 * Utilisé partout où un avatar est choisi (inscription, profil, admin).
 *
 * Le zoom et le déplacement sont appliqués séparément (position pour le
 * déplacement, transform scale pour le zoom) afin qu'ils n'interfèrent
 * jamais l'un avec l'autre.
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
    const scaleFactor = OUTPUT / BOX;
    ctx.save();
    ctx.translate(scaleFactor * (BOX / 2 + offset.x), scaleFactor * (BOX / 2 + offset.y));
    ctx.scale(baseScale * zoom * scaleFactor, baseScale * zoom * scaleFactor);
    ctx.drawImage(img, -natural.w / 2, -natural.h / 2);
    ctx.restore();
    onConfirm(canvas.toDataURL("image/jpeg", 0.85));
  }

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-felt-panel border border-felt-cream/10 rounded-lg p-6 font-body text-felt-cream w-full max-w-xs">
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
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-felt-cream/40 text-xs w-9 text-right shrink-0">{zoom.toFixed(1)}×</span>
        </div>
        <div className="text-felt-cream/30 text-[11px] text-center mt-1">Glisser l'image pour la recentrer</div>

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
