import { useState } from "react";
import { chipColor, chipLabel, normaliserJeu, repartitionConseillee, tapisDeLaRepartition } from "../lib/chips.js";

/**
 * ChipSetPicker.jsx — le jeu de jetons du club et la composition du tapis.
 *
 * Deux réglages qu'on confond volontiers mais qui ne vivent pas au même
 * rythme :
 *
 *   — le JEU DE JETONS est une propriété du matériel. Le club possède des
 *     25, des 100, des 500… et cela ne change pas d'un tournoi à l'autre.
 *     C'est lui qui décide des blinds possibles : sans jeton de 25, un
 *     premier niveau à 25/50 est impayable.
 *
 *   — la RÉPARTITION dit combien de jetons de chaque valeur composent le
 *     tapis de départ. Elle change à chaque tournoi, et le tapis n'est que
 *     sa somme : on ne le saisit plus à la main, on compte les jetons.
 */

export function ChipPastille({ valeur, taille = 34 }) {
  const { fond, texte } = chipColor(valeur);
  return (
    <span
      title={`${valeur}`}
      style={{
        width: taille,
        height: taille,
        backgroundColor: fond,
        color: texte,
        fontSize: Math.max(9, Math.round(taille * 0.32)),
        // Le liseré clair imite les encoches d'un vrai jeton et détache les
        // valeurs sombres (le 100 noir) du fond, lui aussi sombre.
        boxShadow: "inset 0 0 0 2px rgba(255,255,255,0.35)",
      }}
      className="inline-flex shrink-0 items-center justify-center rounded-full font-display font-semibold select-none"
    >
      {chipLabel(valeur)}
    </span>
  );
}

/** La ligne « Jeu de jetons » : les pastilles, et de quoi en changer. */
export function ChipSetRow({ jeu, jeux, onChoisir, onModifier }) {
  const courant = normaliserJeu(jeu);
  const index = jeux.findIndex((j) => normaliserJeu(j).join("-") === courant.join("-"));
  return (
    <div className="flex flex-col gap-1.5">
      <div
        style={{ backgroundColor: "var(--pcp-cell-bg, #14181C)" }}
        className="flex items-center gap-2 border border-felt-cream/10 rounded-md px-3 py-2 overflow-x-auto"
      >
        {courant.length === 0 ? (
          <span className="text-sm text-felt-cream/40">Aucun jeton</span>
        ) : (
          courant.map((v) => <ChipPastille key={v} valeur={v} />)
        )}
        <select
          value={index}
          onChange={(e) => onChoisir(jeux[Number(e.target.value)])}
          title="Choisir un jeu de jetons"
          style={{ backgroundColor: "transparent", color: "var(--pcp-cell-text, #EDEAE3)" }}
          className="ml-auto shrink-0 border-0 text-sm cursor-pointer focus:outline-none"
        >
          {index === -1 && <option value={-1}>Jeu personnalisé</option>}
          {jeux.map((j, i) => (
            <option key={i} value={i} style={{ backgroundColor: "#14181C" }}>
              {normaliserJeu(j).map(chipLabel).join(" · ")}
            </option>
          ))}
        </select>
      </div>
      <button onClick={onModifier} className="self-start text-sm text-felt-gold hover:underline font-display">
        ⚙ Modifier les jeux de jetons
      </button>
    </div>
  );
}

/** Bibliothèque : dupliquer, supprimer, ajouter un jeu, changer ses valeurs. */
export function ChipSetsModal({ jeux, onChange, onClose }) {
  const [ajout, setAjout] = useState({});

  const remplacer = (i, jeu) => onChange(jeux.map((j, k) => (k === i ? jeu : j)));

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-lg max-h-[85vh] overflow-y-auto font-body text-felt-cream p-5"
      >
        <h3 className="font-display text-xl mb-4">Jeux de jetons</h3>
        <div className="space-y-3">
          {jeux.map((jeu, i) => (
            <div key={i} className="border border-felt-cream/10 rounded-md p-3">
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {normaliserJeu(jeu).map((v) => (
                  <button
                    key={v}
                    onClick={() => remplacer(i, jeu.filter((x) => Number(x) !== v))}
                    title={`Retirer le jeton de ${v}`}
                    className="relative group"
                  >
                    <ChipPastille valeur={v} />
                    <span className="absolute -top-1 -right-1 hidden group-hover:flex w-4 h-4 rounded-full bg-felt-alert text-white text-[10px] items-center justify-center">
                      ✕
                    </span>
                  </button>
                ))}
                <input
                  type="number"
                  value={ajout[i] ?? ""}
                  onChange={(e) => setAjout((a) => ({ ...a, [i]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    const v = Number(ajout[i]);
                    if (v > 0) remplacer(i, [...jeu, v]);
                    setAjout((a) => ({ ...a, [i]: "" }));
                  }}
                  placeholder="+ valeur"
                  style={{ backgroundColor: "var(--pcp-cell-bg, #14181C)" }}
                  className="w-24 border border-felt-cream/10 rounded px-2 py-1 text-sm"
                />
              </div>
              <div className="flex gap-3 text-sm">
                <button onClick={() => onChange([...jeux.slice(0, i + 1), [...jeu], ...jeux.slice(i + 1)])} className="text-felt-cream/60 hover:text-felt-cream">
                  Dupliquer
                </button>
                <button
                  onClick={() => onChange(jeux.filter((_, k) => k !== i))}
                  disabled={jeux.length <= 1}
                  className="text-felt-alert hover:underline disabled:opacity-40 disabled:no-underline"
                  title={jeux.length <= 1 ? "Il faut garder au moins un jeu" : undefined}
                >
                  Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between gap-3 mt-5">
          <button
            onClick={() => onChange([...jeux, [25, 100, 500, 1000, 5000]])}
            className="text-sm px-3 py-2 bg-felt-bg border border-felt-cream/10 rounded-md font-display text-felt-cream/70 hover:text-felt-cream"
          >
            Ajouter un jeu de jetons
          </button>
          <button onClick={onClose} className="text-sm px-4 py-2 bg-felt-gold text-felt-bg rounded-md font-display">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Répartition : combien de jetons de chaque valeur dans le tapis de départ.
 * Le tapis affiché est leur somme — c'est elle qui devient le tapis de
 * départ du tournoi, car c'est elle qu'on pose réellement sur la table.
 */
export function ChipDistributionModal({ jeu, counts, tapisVise, onChange, onClose }) {
  const valeurs = normaliserJeu(jeu);
  const total = tapisDeLaRepartition(counts);

  const changer = (v, n) => onChange({ ...counts, [v]: Math.max(0, n) });

  // « Plus / moins de jetons » garde la même composition et la dilate : on
  // ne veut pas rejouer la répartition à la main pour passer de 25 000 à
  // 50 000 de tapis.
  const dilater = (facteur) => {
    const suivant = {};
    for (const v of valeurs) suivant[v] = Math.max(0, Math.round((Number(counts[v]) || 0) * facteur));
    onChange(suivant);
  };

  return (
    <div onClick={onClose} className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-felt-panel border border-felt-cream/10 rounded-lg w-full max-w-sm font-body text-felt-cream p-5"
      >
        <h3 className="font-display text-xl mb-4">Répartition de jetons</h3>
        <div className="space-y-3">
          {valeurs.map((v) => (
            <div key={v} className="flex items-center gap-3">
              <ChipPastille valeur={v} taille={40} />
              <button onClick={() => changer(v, (Number(counts[v]) || 0) - 1)} className="w-8 h-8 rounded bg-felt-bg border border-felt-cream/10 text-felt-cream/70">
                −
              </button>
              <input
                type="number"
                value={counts[v] ?? 0}
                onChange={(e) => changer(v, e.target.value === "" ? 0 : Number(e.target.value))}
                style={{ backgroundColor: "var(--pcp-cell-bg, #14181C)" }}
                className="w-16 border border-felt-cream/10 rounded px-2 py-1.5 text-center"
              />
              <button onClick={() => changer(v, (Number(counts[v]) || 0) + 1)} className="w-8 h-8 rounded bg-felt-bg border border-felt-cream/10 text-felt-cream/70">
                +
              </button>
              <span className="ml-auto text-sm text-felt-cream/40">{(Number(counts[v]) || 0) * v}</span>
            </div>
          ))}
        </div>
        <div className="mt-4 pt-3 border-t border-felt-cream/10 flex items-baseline justify-between">
          <span className="text-sm text-felt-cream/60">Tapis de départ</span>
          <span className="font-display text-2xl text-felt-gold">{total.toLocaleString("fr-FR")}</span>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <button onClick={() => dilater(2)} className="text-sm px-3 py-2 bg-felt-gold text-felt-bg rounded-md font-display">
            Plus de jetons
          </button>
          <button onClick={() => dilater(0.5)} className="text-sm px-3 py-2 bg-felt-gold text-felt-bg rounded-md font-display">
            Moins de jetons
          </button>
          <button
            onClick={() => onChange(repartitionConseillee(jeu, tapisVise || total))}
            className="text-sm px-3 py-2 bg-felt-bg border border-felt-cream/10 rounded-md font-display text-felt-cream/70"
          >
            Restaurer
          </button>
          <button onClick={onClose} className="ml-auto text-sm px-4 py-2 text-felt-cream/60 hover:text-felt-cream font-display">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
