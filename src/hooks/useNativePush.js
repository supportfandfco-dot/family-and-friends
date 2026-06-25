// ═══════════════════════════════════════════════════════
//  useNativePush — Native Android Push + Permissions
//  Family & Friends · Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════
import { useEffect } from 'react';
import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';

const isNative = () =>
  typeof window !== 'undefined' && !!window.Capacitor?.isNativePlatform?.();

async function saveToken(uid, token) {
  try {
    await updateDoc(doc(db, 'users', uid), {
      fcmToken: token,
      fcmUpdatedAt: serverTimestamp(),
    });
  } catch (e) {
    console.warn('Failed to save token:', e);
  }
}

async function requestPermissions() {
  // Ask for microphone early so WebRTC works
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    s.getTracks().forEach(t => t.stop());
  } catch {}
  // Ask for camera
  try {
    const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: true });
    s.getTracks().forEach(t => t.stop());
  } catch {}
}

export function useNativePush(uid, { onOpenChat, onOpenGroup } = {}) {
  // Mocked out for web environment.
}
