// Service worker minimal — seulement là pour satisfaire les critères
// d'installabilité (Chrome/Android exige un service worker enregistré avec
// un handler "fetch" pour proposer l'ajout à l'écran d'accueil). Ne met
// rien en cache : l'app doit toujours servir les données à jour.
self.addEventListener("install", () => {
  self.skipWaiting();
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", () => {
  // Laisse passer toutes les requêtes normalement (pas de cache offline).
});
