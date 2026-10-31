/* global self, URL, fetch, Response */
// Network-only: never cache audio, playlist responses or session cookies.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate' || new URL(event.request.url).origin !== self.location.origin) return
  event.respondWith(fetch(event.request).catch(() => new Response(
    '<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BPM Mixer Studio · Sin conexión</title><body style="background:#141516;color:#e5e6e9;font-family:sans-serif;padding:10%;line-height:1.6"><h1>Conecta tu cabina</h1><p>Necesitas conexión a internet para abrir BPM Mixer Studio. Tu audio sigue siendo local y privado.</p><a href="/" style="color:#9daccd">Volver a intentar</a></body></html>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  )))
})
