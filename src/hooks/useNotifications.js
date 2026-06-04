// ═══════════════════════════════════════════════════════
//  useNotifications — Push & Foreground Notifications
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════
import { useEffect, useRef } from 'react';
import { initFCMToken, onForegroundMessage } from '../firebase';

// ── Request notification permission ──────────────────
export async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  const perm = await Notification.requestPermission();
  return perm === 'granted';
}

// ── Show a local notification (tab not focused) ──────
export function showLocalNotification({ title, body, tag, data = {}, onClick }) {
  if (!('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return;

  const n = new Notification(title, {
    body,
    icon: '/icon-192.png',
    tag: tag || 'ff-msg',
    renotify: true,
    requireInteraction: false,
    silent: false,
  });
  n.onclick = () => {
    window.focus();
    if (onClick) onClick(data);
    n.close();
  };
  setTimeout(() => n.close(), 6000);
}

// ── Main hook ─────────────────────────────────────────
export function useNotifications(uid, { onOpenChat, onOpenGroup, onOpenCall } = {}) {
  const unsubRef = useRef(null);

  useEffect(() => {
    if (!uid) return;
    requestNotificationPermission().then(granted => {
      if (granted) initFCMToken(uid).catch(() => {});
    });
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = onForegroundMessage((payload) => {
      const { title, body } = payload.notification || {};
      const data = payload.data || {};
      const isCall = data.callType === 'voice' || data.callType === 'video';

      // For calls, don't show a local notification — the in-app call screen handles it
      if (isCall) return;

      showLocalNotification({
        title: title || 'Family & Friends',
        body: body || '',
        tag: data.tag,
        data,
        onClick: (d) => {
          if (d.chatId  && onOpenChat)  onOpenChat(d.chatId);
          if (d.groupId && onOpenGroup) onOpenGroup(d.groupId);
          if (d.callId  && onOpenCall)  onOpenCall(d.callId);
        },
      });
    });
    return () => { if (unsubRef.current) unsubRef.current(); };
  }, [uid, onOpenChat, onOpenGroup, onOpenCall]);
}

// ── SW postMessage listener (notification tap when app was open) ──
export function listenForNotificationTaps({ onOpenChat, onOpenGroup, onOpenCall }) {
  const handler = (event) => {
    const { type, chatId, groupId, callId } = event.data || {};
    if (type !== 'NOTIFICATION_CLICK') return;
    if (chatId  && onOpenChat)  onOpenChat(chatId);
    if (groupId && onOpenGroup) onOpenGroup(groupId);
    if (callId  && onOpenCall)  onOpenCall(callId);
  };
  navigator.serviceWorker?.addEventListener('message', handler);
  return () => navigator.serviceWorker?.removeEventListener('message', handler);
}

// ── URL params set by SW when app was closed ─────────
export function handleLaunchUrl({ onOpenChat, onOpenGroup }) {
  const params = new URLSearchParams(window.location.search);
  const chatId  = params.get('openChat');
  const groupId = params.get('openGroup');
  if (chatId  && onOpenChat)  { onOpenChat(chatId);   window.history.replaceState({}, '', '/'); }
  if (groupId && onOpenGroup) { onOpenGroup(groupId); window.history.replaceState({}, '', '/'); }
}
