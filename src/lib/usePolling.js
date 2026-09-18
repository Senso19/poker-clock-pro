import { useEffect, useRef } from "react";

/**
 * usePolling — un sondage qui s'arrête quand personne ne regarde.
 *
 * Les écrans de l'app se relisent régulièrement pour rester justes pendant
 * une partie. Mais l'intervalle continuait de tourner téléphone verrouillé
 * ou onglet en arrière-plan : la table accounts avait accumulé 81 000
 * lectures pour cinq lignes, et chat_messages 26 800 pour une table vide.
 *
 * Ici le tic est sauté tant que le document est masqué, et le sondage
 * repart d'un coup au retour — sans attendre le prochain intervalle, sinon
 * on rouvrirait l'app sur des données périmées le temps d'un cycle.
 *
 * `actif` permet de conditionner le sondage à autre chose que la
 * visibilité de la page : le panneau de discussion s'en sert pour ne
 * sonder que lorsqu'il est réellement à l'écran.
 */
export function usePolling(callback, delaiMs, { actif = true, immediat = true } = {}) {
  // Le callback change à chaque rendu ; passer par une ref évite de
  // redémarrer l'intervalle à chaque fois (ce qui repousserait le tic
  // indéfiniment sur un composant qui se rend souvent).
  const ref = useRef(callback);
  useEffect(() => {
    ref.current = callback;
  });

  useEffect(() => {
    if (!actif || !delaiMs) return undefined;

    const executer = () => ref.current?.();
    if (immediat) executer();

    const timer = setInterval(() => {
      if (document.hidden) return;
      executer();
    }, delaiMs);

    const auRetour = () => {
      if (!document.hidden) executer();
    };
    document.addEventListener("visibilitychange", auRetour);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", auRetour);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [delaiMs, actif, immediat]);
}
