/**
 * chips.js — les jetons réellement posés sur les tables.
 *
 * Jusqu'ici la structure se générait sur une échelle de blinds abstraite,
 * sans savoir avec quoi on paie. C'est ce qui produisait des niveaux
 * impayables : une small blind de 125 n'a de sens que si des jetons de 25
 * circulent encore, et un club qui commence à 100 n'a que faire d'un
 * premier niveau à 25/50.
 *
 * Deux notions distinctes :
 *
 *   — le JEU DE JETONS : les valeurs dont le club dispose (25, 100, 500,
 *     1000, 5000…). C'est une propriété du matériel, la même d'un tournoi
 *     à l'autre, et c'est elle qui décide des blinds possibles.
 *
 *   — la RÉPARTITION : combien de jetons de chaque valeur composent le
 *     tapis de départ. Elle varie d'un tournoi à l'autre et donne le
 *     tapis par simple multiplication.
 */

/**
 * Couleurs usuelles des jetons de tournoi. Ce sont celles des mallettes du
 * commerce, pas une invention : un joueur reconnaît un 500 rose et un 5000
 * bleu sans lire le chiffre.
 */
const COULEURS = {
  1: { fond: "#F2F2F2", texte: "#14181C" },
  5: { fond: "#C0392B", texte: "#FFFFFF" },
  25: { fond: "#27A567", texte: "#FFFFFF" },
  100: { fond: "#1C1C1C", texte: "#FFFFFF" },
  500: { fond: "#D6246E", texte: "#FFFFFF" },
  1000: { fond: "#E8C020", texte: "#14181C" },
  5000: { fond: "#2E7FB8", texte: "#FFFFFF" },
  10000: { fond: "#E255A0", texte: "#FFFFFF" },
  25000: { fond: "#7D3FB5", texte: "#FFFFFF" },
  50000: { fond: "#A02020", texte: "#FFFFFF" },
  100000: { fond: "#1F6F4A", texte: "#FFFFFF" },
};
const COULEUR_INCONNUE = { fond: "#3A3F47", texte: "#EDEAE3" };

export function chipColor(valeur) {
  return COULEURS[Number(valeur)] || COULEUR_INCONNUE;
}

/**
 * Libellé court d'un jeton : 1000 s'écrit « 1K », 25000 « 25K ». Au-delà du
 * millier, le chiffre entier ne tient pas dans la pastille.
 */
export function chipLabel(valeur) {
  const v = Number(valeur) || 0;
  if (v >= 1000 && v % 1000 === 0) return `${v / 1000}K`;
  return String(v);
}

/**
 * Les jeux de jetons proposés d'emblée. Ce sont les mallettes courantes,
 * de la partie de salon au tournoi à gros tapis. Le club peut les
 * modifier, en dupliquer et en ajouter : ce ne sont que des valeurs de
 * départ.
 */
export const DEFAULT_CHIP_SETS = [
  [1, 5, 25, 100, 500],
  [5, 25, 100, 500, 1000],
  [25, 100, 500, 1000, 5000],
  [100, 500, 1000, 5000, 10000],
  [500, 1000, 5000, 10000, 25000, 50000],
];

export function defaultChipSet() {
  return [...DEFAULT_CHIP_SETS[2]];
}

/** Trie, dédoublonne et ne garde que des valeurs positives. */
export function normaliserJeu(jeu) {
  const valeurs = (jeu || []).map((v) => Number(v) || 0).filter((v) => v > 0);
  return [...new Set(valeurs)].sort((a, b) => a - b);
}

/** La plus petite valeur du jeu — celle qui décide du premier niveau. */
export function plusPetitJeton(jeu) {
  const j = normaliserJeu(jeu);
  return j.length ? j[0] : 25;
}

/**
 * Répartition de départ conseillée pour un jeu de jetons et un tapis visé.
 *
 * On sert d'abord les grosses valeurs, puis on descend, en gardant
 * toujours de quoi payer les premières blinds en petites coupures : un
 * tapis de 25 000 fait uniquement de jetons de 5 000 est injouable au
 * niveau 25/50.
 *
 * Le tapis obtenu est donc arrondi à ce que les jetons permettent — c'est
 * la répartition qui fait foi, pas le chiffre rond qu'on avait en tête.
 */
export function repartitionConseillee(jeu, tapisVise) {
  const valeurs = normaliserJeu(jeu);
  if (!valeurs.length) return {};
  const cible = Math.max(0, Number(tapisVise) || 0);
  const counts = {};
  // Un socle de menue monnaie : de quoi tenir les premiers niveaux sans
  // avoir à faire de change à chaque main.
  const petites = valeurs.slice(0, 2);
  let reste = cible;
  for (const v of petites) {
    const n = Math.min(8, Math.floor(reste / v));
    counts[v] = n;
    reste -= n * v;
  }
  // Le reste part sur les grosses valeurs, de la plus haute à la plus
  // basse, pour limiter le nombre de jetons à compter.
  for (const v of [...valeurs].reverse()) {
    if (petites.includes(v)) continue;
    const n = Math.floor(reste / v);
    if (n > 0) {
      counts[v] = (counts[v] || 0) + n;
      reste -= n * v;
    } else if (counts[v] == null) {
      counts[v] = 0;
    }
  }
  // Ce qu'il reste de menu se rattrape sur la plus petite valeur.
  if (reste > 0) {
    const v = valeurs[0];
    counts[v] = (counts[v] || 0) + Math.round(reste / v);
  }
  return counts;
}

/** Tapis effectivement constitué par une répartition. */
export function tapisDeLaRepartition(counts) {
  return Object.entries(counts || {}).reduce((somme, [valeur, nombre]) => somme + Number(valeur) * (Number(nombre) || 0), 0);
}

/**
 * L'échelle canonique des blinds, du jeton de 1 au tapis de gala.
 *
 * Écrite à la main plutôt que calculée : ce sont les paliers qu'un
 * directeur de tournoi pose spontanément. Les tentatives de les engendrer
 * par progression géométrique ressortaient des 750, 1250 ou 3750 que
 * personne n'emploie.
 */
export const BLIND_LADDER = [
  1, 2, 3, 4, 5, 10, 15, 20,
  25, 50, 75, 100, 150, 200, 250, 300, 350, 400, 500, 600, 700, 800,
  1000, 1200, 1500, 1800, 2000, 2500, 3000, 4000, 5000, 6000, 8000,
  10000, 12000, 15000, 20000, 25000, 30000, 40000, 50000, 60000, 80000,
  100000, 125000, 150000, 200000, 250000, 300000, 400000, 500000,
];

/**
 * Au bout de combien de fois sa propre valeur une coupure quitte la table.
 *
 * C'est le chip race : les petits jetons sont échangés en cours de partie,
 * sinon il en faudrait des piles entières pour suivre les blinds. Vingt
 * fois la valeur du jeton est le repère usuel — les 25 servent jusqu'aux
 * environs de 500/1000, les 100 jusqu'aux environs de 2000/4000.
 */
export const SEUIL_CHIP_RACE = 20;

/**
 * La plus petite coupure encore en jeu quand la small blind vaut `sb`.
 * C'est elle qui fixe le pas des blinds : tant que les 25 circulent, un
 * niveau 75/150 se paie ; une fois échangés, il ne se paie plus et les
 * blinds deviennent des multiples de 100.
 */
export function plusPetitJetonEnJeu(jeu, sb) {
  const valeurs = normaliserJeu(jeu);
  if (!valeurs.length) return 25;
  const encore = valeurs.filter((d) => Number(sb) < d * SEUIL_CHIP_RACE);
  return encore.length ? encore[0] : valeurs[valeurs.length - 1];
}

/**
 * L'échelle permise par un jeu de jetons donné.
 *
 * Le premier niveau vaut le plus petit jeton : 25 → 25/50, 100 → 100/200,
 * 500 → 500/1000. Un club sans jetons de 25 n'a que faire d'un 25/50.
 *
 * Ensuite chaque palier doit être payable avec ce qui reste sur la table.
 * Les 25 permettent 25/50, 50/100, 75/150 ; une fois échangés, plus aucune
 * valeur en 25 ni en 50 ne passe et l'on saute à des multiples de 100.
 * Puis les 100 partent à leur tour, et ainsi de suite.
 */
export function echelleDesBlinds(jeu) {
  const valeurs = normaliserJeu(jeu);
  const base = valeurs.length ? valeurs[0] : 25;
  return BLIND_LADDER.filter((v) => v >= base && v % plusPetitJetonEnJeu(valeurs, v) === 0);
}

/**
 * Les échanges de jetons qu'une structure impose.
 *
 * Pour chaque coupure qui cesse d'être payable, le niveau à partir duquel
 * elle ne sert plus. C'est une INDICATION pour le directeur de tournoi :
 * aucun niveau n'est créé, aucune numérotation ne bouge.
 */
export function chipRaces(jeu, niveaux) {
  const valeurs = normaliserJeu(jeu);
  const races = [];
  let precedente = null;
  (niveaux || []).forEach((l, i) => {
    if (l.isBreak) return;
    const minimale = plusPetitJetonEnJeu(valeurs, Number(l.smallBlind) || 0);
    if (precedente != null && minimale > precedente) {
      // Toutes les coupures passées sous le seuil d'un coup, pas seulement
      // la première : une structure rapide peut en retirer deux à la fois.
      const sorties = valeurs.filter((d) => d >= precedente && d < minimale);
      if (sorties.length) races.push({ position: i, jetons: sorties });
    }
    precedente = minimale;
  });
  return races;
}

/**
 * Où POSER ces échanges dans la structure.
 *
 * Le moment où une coupure cesse d'être payable est une donnée
 * arithmétique ; le moment où on l'échange est une décision d'organisation.
 * Échanger en plein jeu immobilise la table — on le fait pendant une
 * pause, quand les joueurs sont debout.
 *
 * Chaque échange est donc reculé jusqu'à la dernière pause qui le précède.
 * À défaut de pause avant lui, on prend la première qui suit, quitte à
 * jouer un ou deux niveaux avec des jetons devenus inutiles — c'est sans
 * conséquence, l'inverse ne l'est pas : on ne peut pas payer une blind
 * avec des jetons déjà ramassés.
 *
 * `overrides` permet à l'administrateur de placer un échange où il veut :
 * la clé est la plus petite coupure échangée, la valeur la position du
 * niveau. Son choix l'emporte toujours.
 */
export function placerChipRaces(jeu, niveaux, overrides = {}) {
  const lignes = niveaux || [];
  const pauses = lignes.map((l, i) => (l.isBreak ? i : -1)).filter((i) => i >= 0);

  return chipRaces(jeu, lignes).map((race) => {
    const cle = String(race.jetons[0]);
    const impose = overrides?.[cle];
    if (impose != null && impose >= 0 && impose < lignes.length) {
      return { ...race, position: Number(impose), automatique: false };
    }
    const avant = pauses.filter((i) => i <= race.position);
    const apres = pauses.filter((i) => i > race.position);
    let position = race.position;
    if (avant.length) position = avant[avant.length - 1];
    else if (apres.length) position = apres[0];
    return { ...race, position, automatique: true };
  });
}
