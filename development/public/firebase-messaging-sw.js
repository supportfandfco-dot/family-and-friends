importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey:            "AIzaSyDnBVDUUeLRN7fTU5onblF0cqNqbhLEH0E",
  authDomain:        "family-friends-ee992.firebaseapp.com",
  databaseURL:       "https://family-friends-ee992-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId:         "family-friends-ee992",
  storageBucket:     "family-friends-ee992.firebasestorage.app",
  messagingSenderId: "578419914834",
  appId:             "1:578419914834:web:de1cfc867a78b706f6878b"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  const data = payload.data || {};
  const isCall = data.callType === 'voice' || data.callType === 'video';
  const isGroupCall = isCall && !!data.groupId;

  const actions = isCall
    ? [{ action: 'open', title: '📲 Open App' }]
    : [{ action: 'reply', title: '↩ Reply' }, { action: 'dismiss', title: 'Dismiss' }];

  const icon = isCall
    ? (data.callType === 'video' ? '/icon-video-call.png' : '/icon-voice-call.png')
    : '/icon-192.png';

  self.registration.showNotification(title || 'Family & Friends', {
    body: body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'ff-msg',
    renotify: true,
    requireInteraction: isCall, // keep call notifications on screen
    vibrate: isCall ? [200, 100, 200, 100, 200] : [100],
    data: data,
    actions,
  });
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const action = event.action;

  if (action === 'dismiss') return;

  // Build the URL to navigate to
  const origin = self.location.origin;
  let url = origin + '/';
  if (data.chatId)  url = origin + '/?openChat='  + data.chatId;
  if (data.groupId && !data.callType) url = origin + '/?openGroup=' + data.groupId;
  if (data.callType) url = origin + '/'; // calls: just open the app, ring screen will appear

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      // Try to find an existing app window and focus it
      for (const client of list) {
        if (client.url.startsWith(origin)) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', ...data });
          return client.focus();
        }
      }
      // No window open — launch a new one
      return clients.openWindow(url);
    })
  );
});
