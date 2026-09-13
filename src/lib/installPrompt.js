/**
 * installPrompt.js — capture l'évènement "beforeinstallprompt" (Chrome/
 * Android) dès le chargement de la page, pour pouvoir le déclencher plus
 * tard (par exemple juste après la création d'un compte) plutôt que de le
 * perdre s'il arrive avant qu'un composant React soit prêt à l'écouter.
 */
let deferredPrompt = null;
let listeners = [];

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((cb) => cb());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
  });
}

export function getDeferredPrompt() {
  return deferredPrompt;
}

export function onPromptAvailable(cb) {
  listeners.push(cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
  };
}

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

export function isIos() {
  if (typeof window === "undefined") return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}
