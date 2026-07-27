// Strategia "network-first": prova sempre la rete per primo, così ogni
// aggiornamento dell'app si vede subito. Usa la cache SOLO come riserva
// se il telefono è offline. Questo evita che il telefono resti bloccato
// su una versione vecchia di app.js dopo un aggiornamento.
const CACHE = "scorta-v2";
const SHELL = ["./", "./index.html", "./app.js", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  const isShellFile = url.origin === self.location.origin &&
    SHELL.some(p => url.pathname.endsWith(p.replace("./", "")));
  if (!isShellFile) return; // tutto il resto (Firebase, librerie CDN, camera) passa dritto in rete

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
