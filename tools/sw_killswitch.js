// HORDES KILL SWITCH (R4). Copy this file over sw.js (same name, same place) and release it to switch the
// service worker off for every player. The browser fetches sw.js past the HTTP cache on the next page load;
// this worker takes over at once, deletes HORDES's caches for its scope and unregisters itself. The load after
// that comes from the network, as before the worker existed. It has no fetch handler, and no page is reloaded
// by it (a page still loading reloads itself, index.html G1). While it is live, each load registers it and it
// unregisters again (a few hundred bytes). To turn the worker back on: restore the real sw.js from git and run
// node tools/gen_sw.mjs. NEVER delete sw.js instead: a 404 keeps the old worker forever.
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (e) => e.waitUntil((async () => {
  const prefix = 'hordes:' + new URL(self.registration.scope).pathname + ':';
  try { for (const k of await caches.keys()) if (k.startsWith(prefix)) await caches.delete(k); } catch (err) { /* keep going */ }
  try { await self.registration.unregister(); } catch (err) { /* nothing more to do */ }
})()));
