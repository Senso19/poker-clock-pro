import { useEffect, useMemo, useState } from "react";
import ClubLoader from "./ClubLoader.jsx";
import { supabase } from "../lib/supabase.js";
import { avatarColor, initials } from "../lib/avatars.js";
import {
  fetchChampionships,
  createChampionship,
  deleteChampionship,
  fetchChampionshipStandings,
  evaluateFormula,
  DEFAULT_FORMULA,
  updateChampionshipBanner,
} from "../lib/points.js";
import { useAccount } from "../context/AccountContext.jsx";
import { canManageTournaments } from "../lib/auth.js";
import ChampionshipDetailPage from "./ChampionshipDetailPage.jsx";
import CustomizablePanel from "./CustomizablePanel.jsx";
import { useConfirm } from "../context/ConfirmContext.jsx";
import EditableButton from "./EditableButton.jsx";
import { uploadImageToStorage } from "../lib/imageUtils.js";

const VARIABLES = [
  ["p", "nombre de joueurs"],
  ["f", "place finale"],
  ["b", "buy-in"],
  ["c", "coût total (buy-in + recaves + addon)"],
  ["k", "knockouts"],
  ["z", "dotation"],
  ["n", "nombre d'entrées (avec réentrées si activé)"],
  ["x", "balles utilisées (1 + recaves)"],
  ["w", "gains"],
  ["m", "places payées"],
  ["r", "nombre de recaves"],
  ["a", "nombre d'addons"],
  ["t", "type de tournoi (toujours 1 ici)"],
  ["d", "tours depuis la table finale (toujours 1 ici)"],
];

function MiniAvatar({ name, size = 36 }) {
  return (
    <div
      style={{ width: size, height: size, backgroundColor: avatarColor(name) }}
      className="rounded-full flex items-center justify-center text-felt-cream font-display text-xs shrink-0"
    >
      {initials(name)}
    </div>
  );
}
function formatShortDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * ChampionshipView — création de championnats avec formule libre (façon BlindValet),
 * bandeaux "Actif"/"Terminé" avec joueur en tête ou podium, classement général.
 */
export default function ChampionshipView() {
  const confirmAction = useConfirm();
  const { account } = useAccount();
  const manage = canManageTournaments(account?.role);
  const [summaries, setSummaries] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    setLoading(true);
    try {
      let list = await fetchChampionships();
      // Visiteur non connecté : uniquement les championnats marqués "Accès
      // public" — les autres restent réservés aux comptes connectés.
      if (!account) list = list.filter((c) => c.public_view);
      if (list.length === 0) {
        setSummaries([]);
        if (manage) setShowCreate(true);
      } else {
        const results = await Promise.all(list.map((c) => fetchChampionshipStandings(c.id).catch(() => null)));
        setSummaries(results.filter(Boolean));
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }

  async function handleCardBannerChange(championshipId, file) {
    if (!file) return;
    try {
      const url = await uploadImageToStorage(file, { maxSize: 1200, folder: "championship-banners" });
      await updateChampionshipBanner(championshipId, url);
      setSummaries((list) =>
        list.map((s) => (s.championship.id === championshipId ? { ...s, championship: { ...s.championship, banner_image: url } } : s))
      );
    } catch (e) {
      setError(e.message);
    }
  }

  async function handleCreate(form) {
    setCreating(true);
    try {
      const champ = await createChampionship(form);
      setShowCreate(false);
      await load();
      setSelectedId(champ.id);
    } catch (e) {
      setError(e.message);
    }
    setCreating(false);
  }

  async function handleDelete(id) {
    if (!(await confirmAction("Supprimer ce championnat ? Les tournois qui y sont rattachés seront simplement détachés (pas supprimés)."))) return;
    try {
      await deleteChampionship(id);
      setSelectedId(null);
      await load();
    } catch (e) {
      setError(e.message);
    }
  }

  if (loading) {
    return <ClubLoader />;
  }

  if (summaries.length === 0 && !manage) {
    return <div className="p-6 text-felt-cream/50 font-body text-sm">Aucun championnat pour le moment.</div>;
  }

  if (showCreate) {
    return (
      <div className="h-full overflow-y-auto">
        <ChampionshipEditor
          onCancel={summaries.length > 0 ? () => setShowCreate(false) : null}
          onCreate={handleCreate}
          loading={creating}
        />
      </div>
    );
  }

  const active = summaries.filter((s) => s.isActive || s.stageCount === 0);
  const finished = summaries.filter((s) => !s.isActive && s.stageCount > 0);
  const selected = summaries.find((s) => s.championship.id === selectedId);

  function toggleSelect(id) {
    setSelectedId(selectedId === id ? null : id);
  }

  async function handleTogglePublic(id, value) {
    try {
      await supabase.from("championships").update({ public_view: value }).eq("id", id);
      setSummaries((list) =>
        list.map((s) => (s.championship.id === id ? { ...s, championship: { ...s.championship, public_view: value } } : s))
      );
    } catch (e) {
      setError(e.message);
    }
  }

  if (selected) {
    return (
      <ChampionshipDetailPage
        summary={selected}
        manage={manage}
        onBack={() => setSelectedId(null)}
        onDelete={() => handleDelete(selected.championship.id)}
        onTogglePublic={(value) => handleTogglePublic(selected.championship.id, value)}
      />
    );
  }

  return (
    <div className="p-4 sm:p-6 font-body text-white h-full overflow-y-auto">
      <div className="flex items-baseline justify-between mb-6">
        <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40">Championnats</div>
        {manage && (
          <EditableButton
            groupKey="championships-toolbar"
            id="create"
            onClick={() => setShowCreate(true)}
            className="px-4 py-2.5 bg-felt-gold text-felt-bg rounded-lg text-sm font-display hover:bg-felt-gold/90"
          >
            + Nouveau championnat
          </EditableButton>
        )}
      </div>

      {error && <div className="text-felt-alert text-sm mb-3">Erreur : {error}</div>}

      {active.length > 0 && (
        <div className="mb-8">
          <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40 mb-3">Actif</div>
          <CustomizablePanel
            panelKey="championships-active"
            defaultWidth="1 1 100%"
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4"
          >
            {active.map((s) => (
              <ActiveChampionshipCard
                key={s.championship.id}
                s={s}
                selected={selectedId === s.championship.id}
                onClick={() => toggleSelect(s.championship.id)}
                manage={manage}
                onBannerChange={(file) => handleCardBannerChange(s.championship.id, file)}
              />
            ))}
          </CustomizablePanel>
        </div>
      )}

      {finished.length > 0 && (
        <div className="mb-8">
          <div className="text-xs font-display uppercase tracking-widest text-felt-cream/40 mb-3">Terminé</div>
          <CustomizablePanel
            panelKey="championships-finished"
            defaultWidth="1 1 100%"
            className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4"
          >
            {finished.map((s) => (
              <FinishedChampionshipCard
                key={s.championship.id}
                s={s}
                selected={selectedId === s.championship.id}
                onClick={() => toggleSelect(s.championship.id)}
                manage={manage}
                onBannerChange={(file) => handleCardBannerChange(s.championship.id, file)}
              />
            ))}
          </CustomizablePanel>
        </div>
      )}
    </div>
  );
}

function ActiveChampionshipCard({ s, selected, onClick, manage, onBannerChange }) {
  return (
    <button
      onClick={onClick}
      // Une carte sélectionnée garde son fond doré ; sinon elle suit
      // "Fond des cellules" du panneau (🎨), avec le fond actuel en repli.
      style={
        selected ? undefined : { backgroundColor: "var(--pcp-cell-bg, #1B2027)", color: "var(--pcp-cell-text, inherit)" }
      }
      className={`pcp-card-hover text-left rounded-xl overflow-hidden border ${
        selected ? "bg-felt-gold/10 border-felt-gold" : "border-felt-cream/10 hover:border-felt-cream/30"
      }`}
    >
      <BannerImage image={s.championship.banner_image} manage={manage} onChange={onBannerChange} />
      <div className="p-4 sm:p-5">
        <div className="pcp-title font-display text-xl sm:text-lg mb-2.5 sm:mb-2 truncate">{s.championship.name}</div>
        <div className="flex items-center gap-2 mb-4">
          <span className="pcp-body text-xs px-3 py-1.5 sm:py-1 rounded-full bg-felt-bg text-felt-cream/50 uppercase tracking-wide">
            {s.playerCount} joueurs
          </span>
          <span className="pcp-body text-xs px-3 py-1.5 sm:py-1 rounded-full bg-felt-bg text-felt-cream/50 uppercase tracking-wide">
            {s.stageCount} tournois
          </span>
        </div>
        <div className="pcp-space" />
        {s.leader ? (
          <div className="pcp-row flex items-center gap-3 sm:gap-3 bg-felt-bg rounded-lg px-3 py-3.5 sm:py-3 mb-4">
            <MiniAvatar name={s.leader.name} size={52} />
            <div className="min-w-0 flex-1">
              <div className="pcp-body text-[10px] text-felt-cream/40 uppercase tracking-wide">Joueur en tête</div>
              <div className="pcp-body text-lg sm:text-base text-felt-gold font-medium truncate">{s.leader.name}</div>
            </div>
            <div className="pcp-value text-felt-gold font-display text-3xl sm:text-2xl shrink-0">{s.leader.totalPoints}</div>
          </div>
        ) : (
          <div className="pcp-body text-sm text-felt-cream/40 mb-4">Aucun résultat pour l'instant.</div>
        )}
        <div className="grid grid-cols-2 gap-3 text-sm sm:text-xs">
          <div>
            <div className="pcp-body text-felt-cream/30 uppercase tracking-wide mb-0.5">Précédent</div>
            {s.previousStage ? (
              <>
                <div className="pcp-body text-felt-gold truncate">{s.previousStage.stage_label || s.previousStage.name}</div>
                <div className="pcp-body text-felt-cream/30 text-[10px]">
                  {formatShortDate(s.previousStage.scheduled_at || s.previousStage.created_at)}
                </div>
              </>
            ) : (
              <div className="pcp-body text-felt-cream/40">—</div>
            )}
          </div>
          <div>
            <div className="pcp-body text-felt-cream/30 uppercase tracking-wide mb-0.5">À venir</div>
            {s.nextStage ? (
              <>
                <div className="pcp-body text-felt-gold truncate">{s.nextStage.stage_label || s.nextStage.name}</div>
                <div className="pcp-body text-felt-cream/30 text-[10px]">{formatShortDate(s.nextStage.scheduled_at)}</div>
              </>
            ) : (
              <div className="pcp-body text-felt-cream/40">—</div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}

function BannerImage({ image, manage, onChange }) {
  if (!image && !manage) return null;
  return (
    <div
      className="relative bg-felt-bg overflow-hidden"
      style={{ height: image ? "var(--pcp-banner-height, 140px)" : "4rem" }}
    >
      {image && <img src={image} alt="" className="w-full h-full object-cover block" />}
      {manage && (
        <label
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-1.5 right-1.5 text-[10px] px-2 py-1 rounded-md bg-black/60 text-white cursor-pointer hover:bg-black/80"
        >
          {image ? "Changer l'image" : "🖼 Ajouter une image"}
          <input type="file" accept="image/*" onChange={(e) => onChange(e.target.files?.[0])} className="hidden" />
        </label>
      )}
    </div>
  );
}

function FinishedChampionshipCard({ s, selected, onClick, manage, onBannerChange }) {
  return (
    <button
      onClick={onClick}
      // Une carte sélectionnée garde son fond doré ; sinon elle suit
      // "Fond des cellules" du panneau (🎨), avec le fond actuel en repli.
      style={
        selected ? undefined : { backgroundColor: "var(--pcp-cell-bg, #1B2027)", color: "var(--pcp-cell-text, inherit)" }
      }
      className={`pcp-card-hover text-left rounded-xl overflow-hidden border ${
        selected ? "bg-felt-gold/10 border-felt-gold" : "border-felt-cream/10 hover:border-felt-cream/30"
      }`}
    >
      <BannerImage image={s.championship.banner_image} manage={manage} onChange={onBannerChange} />
      <div className="p-4 sm:p-5">
        <div className="pcp-title font-display text-xl sm:text-lg mb-2.5 sm:mb-2 truncate">{s.championship.name}</div>
        <div className="flex items-center gap-2 mb-3">
          <span className="pcp-body text-xs px-3 py-1.5 sm:py-1 rounded-full bg-felt-bg text-felt-cream/50 uppercase tracking-wide">
            {s.playerCount} joueurs
          </span>
          <span className="pcp-body text-xs px-3 py-1.5 sm:py-1 rounded-full bg-felt-bg text-felt-cream/50 uppercase tracking-wide">
            {s.stageCount} tournois
          </span>
        </div>
        <div className="space-y-2 mb-3">
          {s.top3.length === 0 && <div className="pcp-body text-sm text-felt-cream/40">Aucun résultat.</div>}
          {s.top3.map((p, i) => (
            <div key={p.playerId} className="flex items-center gap-2">
              <span className="pcp-body w-5 text-center text-sm text-felt-cream/40 shrink-0">{i === 0 ? "🏆" : i + 1}</span>
              <MiniAvatar name={p.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="pcp-body text-white truncate">{p.name}</div>
                {i === 0 && <div className="pcp-body text-[10px] text-felt-gold uppercase tracking-wide">Champion</div>}
              </div>
              <div className="pcp-value text-felt-gold font-display shrink-0">{p.totalPoints}</div>
            </div>
          ))}
        </div>
        {s.dateRange && (
          <div>
            <div className="pcp-body text-[10px] text-felt-cream/30 uppercase tracking-wide mb-0.5">Dates</div>
            <div className="pcp-body text-[11px] text-felt-cream/40">
              {formatShortDate(s.dateRange.start)} – {formatShortDate(s.dateRange.end)}
            </div>
          </div>
        )}
      </div>
    </button>
  );
}

function ChampionshipEditor({ onCreate, onCancel, loading }) {
  const [name, setName] = useState("");
  const [formulaText, setFormulaText] = useState(DEFAULT_FORMULA);
  const [bestStages, setBestStages] = useState("");
  const [countRebuys, setCountRebuys] = useState(false);
  const [previewPlayers, setPreviewPlayers] = useState(20);
  const [bannerImage, setBannerImage] = useState(null);

  async function handleBannerFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await uploadImageToStorage(file, { maxSize: 1200, folder: "championship-banners" });
      setBannerImage(url);
    } catch (err) {
      console.error("handleBannerFile failed:", err);
    }
    e.target.value = "";
  }

  const previewRows = useMemo(() => {
    const p = Math.max(1, Number(previewPlayers) || 1);
    const rows = [];
    for (let f = 1; f <= Math.min(p, 30); f++) {
      const points = evaluateFormula(formulaText, {
        p,
        f,
        b: 0,
        c: 0,
        k: 0,
        z: 0,
        n: p,
        x: 1,
        w: 0,
        m: 0,
        r: 0,
        a: 0,
        t: 1,
        d: 1,
      });
      rows.push({ place: f, points });
    }
    return rows;
  }, [formulaText, previewPlayers]);

  return (
    <div className="p-4 sm:p-6 font-body text-felt-cream grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div>
        <div className="font-display text-xl mb-4">
          {onCancel ? "Nouveau championnat" : "Créer ton premier championnat"}
        </div>

        <label className="block text-xs text-felt-cream/50 mb-1">Nom du championnat</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex : Championnat Hiver 2026"
          className="w-full mb-4 bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
        />

        <label className="block text-xs text-felt-cream/50 mb-1">Image en bandeau (optionnel)</label>
        <div className="flex items-center gap-3 mb-4">
          {bannerImage && <img src={bannerImage} alt="" className="h-14 w-24 object-cover rounded-md" />}
          <label className="px-3 py-2 text-sm bg-felt-panel border border-felt-cream/10 rounded-md cursor-pointer hover:text-felt-gold text-felt-cream/70">
            {bannerImage ? "Changer l'image" : "Ajouter une image"}
            <input type="file" accept="image/*" onChange={handleBannerFile} className="hidden" />
          </label>
          {bannerImage && (
            <button onClick={() => setBannerImage(null)} className="text-xs text-felt-alert/60 hover:text-felt-alert">
              Retirer
            </button>
          )}
        </div>

        <label className="block text-xs text-felt-cream/50 mb-1">Formule</label>
        <input
          value={formulaText}
          onChange={(e) => setFormulaText(e.target.value)}
          placeholder={DEFAULT_FORMULA}
          className="w-full mb-4 bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream font-mono text-sm"
        />

        <div className="bg-felt-panel border border-felt-cream/10 rounded-md p-3 mb-4 text-xs text-felt-cream/60 space-y-1">
          {VARIABLES.map(([v, desc]) => (
            <div key={v}>
              <span className="text-felt-gold font-mono">{v}</span> = {desc}
            </div>
          ))}
          <div className="text-felt-cream/40 pt-1">
            Fonctions : sqrt, log (= ln), log10, abs, pow, min, max, round, floor, ceil. Utilise ^ pour une puissance.
          </div>
        </div>

        <label className="block text-xs text-felt-cream/50 mb-1">
          Nombre de résultats à compter (vide = toutes les étapes)
        </label>
        <input
          type="number"
          value={bestStages}
          onChange={(e) => setBestStages(e.target.value)}
          placeholder="Toutes les étapes"
          className="w-full mb-4 bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream placeholder:text-felt-cream/40"
        />

        <label className="flex items-center gap-2 text-sm text-felt-cream/70 mb-6">
          <input
            type="checkbox"
            checked={countRebuys}
            onChange={(e) => setCountRebuys(e.target.checked)}
          />
          Compter les réentrées dans le classement (variable n inclut les recaves)
        </label>

        <div className="flex gap-2">
          {onCancel && (
            <button onClick={onCancel} className="px-4 py-2 text-felt-cream/60 hover:text-felt-cream">
              Fermer
            </button>
          )}
          <button
            disabled={!name.trim() || loading}
            onClick={() =>
              onCreate({
                name: name.trim(),
                formulaText: formulaText.trim() || DEFAULT_FORMULA,
                bestStagesCount: bestStages ? Number(bestStages) : null,
                countRebuysInRanking: countRebuys,
                bannerImage,
              })
            }
            className="px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display disabled:opacity-40"
          >
            {loading ? "Création…" : "Confirmer"}
          </button>
        </div>
      </div>

      <div>
        <div className="font-display text-lg mb-3">Exemple de tournoi</div>
        <label className="block text-xs text-felt-cream/50 mb-1">Joueurs</label>
        <input
          type="number"
          value={previewPlayers}
          onChange={(e) => setPreviewPlayers(e.target.value)}
          className="w-full mb-4 bg-felt-panel border border-felt-cream/10 rounded-md px-3 py-2 text-felt-cream"
        />
        <div className="bg-felt-panel border border-felt-cream/10 rounded-md overflow-hidden">
          <div className="grid grid-cols-2 text-xs uppercase tracking-wide text-felt-cream/40 px-4 py-2 border-b border-felt-cream/10">
            <div>Place</div>
            <div>Points</div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {previewRows.map((r) => (
              <div
                key={r.place}
                className="grid grid-cols-2 px-4 py-2 border-b border-felt-cream/5 text-sm"
              >
                <div className="text-felt-cream/70">{r.place}</div>
                <div className="text-felt-gold">{r.points}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
