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
    // FCM token save failed — non-critical
  }
}

async function requestPermissions() {
  // WARNING if this ever gets wired up for a real native build: this does
  // the same "grab getUserMedia then immediately stop it" pattern that was
  // the root cause of meetings hanging on "Calling..." forever elsewhere in
  // this app (see App.jsx / useGroupWebRTC.js / useWebRTC.js history) —
  // two getUserMedia() acquisitions fired close together on the same
  // hardware can cause the SECOND one (the real call's actual acquisition)
  // to hang indefinitely on some browser/OS/driver combinations, with zero
  // error to explain why. If this function starts actually running,
  // add enough delay before any call/meeting's own getUserMedia() call, or
  // better, drop this pre-flight pattern entirely the same way it was
  // removed from the call flows.
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

// NOTE: this hook's body is currently a no-op stub for the web build — none
// of saveToken/requestPermissions/isNative above are actually called from
// anywhere. They're presumably scaffolding for a future Capacitor native
// build. Left as dead code intentionally rather than removed, since they
// may be intended for that future use — but see the warning above before
// ever calling requestPermissions() from real app code.

export function useNativePush(uid, { onOpenChat, onOpenGroup } = {}) {
  // Mocked out for web environment.
}
