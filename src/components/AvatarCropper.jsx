import { useEffect, useRef, useState } from "react";

const BOX = 240;
const OUTPUT = 320;

/**
 * AvatarCropper — petite fenêtre de recadrage : zoom (molette/slider) et
 * déplacement (glisser) de l'image dans un cadre rond, pour que la photo
 * s'adapte bien à l'avatar au lieu d'un recadrage automatique parfois raté.
 * Utilisé partout où un avatar est choisi (inscription, profil, admin).
 */
export default function AvatarCropper({ file, onConfirm, onCancel }) {
  const [imgUrl, setImgUrl] = useState(null);
  const [natural, setNatural] = useState({ w: 1, h: 1 });
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const imgRef = useRef(null);
  const dragRef = useRef(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleImgLoad() {
    const img = imgRef.current;
    setNatural({ w: img.naturalWidth, h: img.naturalHeight });
  }

  const baseScale = Math.max(BOX / natural.w, BOX / natural.h);
  const displayW = natural.w * baseScale * zoom;
  const displayH = natural.h * baseScale * zoom;

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
              onLoad={handleImgLoad}
              draggable={false}
              style={{
                position: "absolute",
                left: BOX / 2 + offset.x - displayW / 2,
                top: BOX / 2 + offset.y - displayH / 2,
                width: displayW,
                height: displayH,
                userSelect: "none",
                pointerEvents: "none",
              }}
            />
          )}
        </div>

        <div className="flex items-center gap-3 mt-4">
          <span className="text-felt-cream/50 text-xs">Zoom</span>
          <input
            type="range"
            min="1"
            max="3"
            step="0.05"
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="flex-1"
          />
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
