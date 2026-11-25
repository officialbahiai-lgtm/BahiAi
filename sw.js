// ============================================================
// BahiAi — Offline Service Worker
// ============================================================
// Caches the app itself (HTML, icons, fonts and the PDF/Excel libraries)
// so the app opens and works even with no internet. Orders and entries made
// offline are saved on the device and sync automatically when internet is back.
//
// Calls to Supabase (login and data) and to Google APIs are NEVER cached -
// they always go straight to the network, so data stays live and correct.
//
// HOW TO UPDATE: whenever index.html is updated, bump CACHE_NAME below
// (e.g. v1 -> v2) so every device notices the new version and fetches it.
// ============================================================

// ------------------------------------------------------------
// BACKGROUND PUSH (new-order alerts even when the app is closed)
// Fill the SAME Firebase values here as in index.html (FIREBASE_CONFIG).
// Wrapped in try/catch so, if anything here fails, the offline app itself
// keeps working exactly as before.
// ------------------------------------------------------------
try {
  importScripts(
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
    'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js'
  );
  firebase.initializeApp({
    apiKey: 'PASTE_API_KEY',
    authDomain: 'PASTE_PROJECT_ID.firebaseapp.com',
    projectId: 'PASTE_PROJECT_ID',
    messagingSenderId: 'PASTE_SENDER_ID',
    appId: 'PASTE_APP_ID'
  });
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    const d = (payload && payload.data) || {};
    return self.registration.showNotification(d.title || 'New Order', {
      body: d.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: d.tag || undefined
    });
  });
} catch (e) {
  console.error('Push setup skipped in service worker', e);
}

const CACHE_NAME = 'ssa-app-v58';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .catch((e) => console.error('Service worker install caching failed', e))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Old Google Apps Script backend (no longer used) - never cached.
  if (req.url.indexOf('script.google.com') !== -1) return;
  // Supabase (login + data) is always live from the network, never cached.
  if (req.url.indexOf('supabase.co') !== -1) return;
  // Google Drive API calls are always live too.
  if (req.url.indexOf('googleapis.com') !== -1) return;

  // Only handle simple page/asset loads.
  if (req.method !== 'GET') return;

  // The app page itself (index.html / the app's URL) ALWAYS tries the
  // network first. This is what makes a new deploy show up the very next
  // time someone opens the app, instead of needing several reloads before
  // the old cached copy finally gets replaced. Offline, it still falls
  // back to whatever was last cached, so the app keeps working with no
  // signal at all.
  const isPage = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isPage) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => caches.match(req, { ignoreSearch: true }))
    );
    return;
  }

  // Everything else (icons, manifest, fonts, PDF/Excel libraries) rarely
  // changes, so these still serve instantly from cache while quietly
  // refreshing in the background — keeps the app feeling fast and fully
  // usable offline.
  event.respondWith(
    caches.match(req).then((cached) => {
      const networkFetch = fetch(req)
        .then((res) => {
          if (res && res.status === 200) {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          }
          return res;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});

// Tapping a "New Order" notification brings the app to the front
// (or opens it if it was closed).
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});
