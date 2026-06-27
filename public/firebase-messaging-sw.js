// ═══════════════════════════════════════════════════════
//  Firebase Messaging Service Worker
//  Required for FCM background push notifications.
//  Served from the domain root via Cloudflare Pages / Vite.
// ═══════════════════════════════════════════════════════

importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey:            "AIzaSyDnBVDUUeLRN7fTU5onblF0cqNqbhLEH0E",
  authDomain:        "family-friends-ee992.firebaseapp.com",
  projectId:         "family-friends-ee992",
  storageBucket:     "family-friends-ee992.firebasestorage.app",
  messagingSenderId: "578419914834",
  appId:             "1:578419914834:web:de1cfc867a78b706f6878b",
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(payload => {
  const { title, body } = payload.notification || {};
  const data = payload.data || {};
  if (data.callType) return; // calls handled by in-app UI

  self.registration.showNotification(title || 'Family & Friends', {
    body:               body || '',
    icon:               '/icon-192.png',
    badge:              '/icon-72.png',
    tag:                data.tag || 'ff-msg',
    renotify:           true,
    requireInteraction: false,
    data,
    actions: [
      { action: 'reply',   title: '↩ Reply' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  });
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const win = list.find(c => c.url.includes(self.location.origin));
      if (win) {
        win.focus();
        win.postMessage({ type: 'NOTIFICATION_CLICK', action: event.action, ...data });
        return;
      }
      return clients.openWindow('/').then(c => {
        if (c) c.postMessage({ type: 'NOTIFICATION_CLICK', action: event.action, ...data });
      });
    })
  );
});
