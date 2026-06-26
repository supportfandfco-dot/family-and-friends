# Family & Friends — Final Project Report

---

## What The App Is

**Family & Friends** is a full-featured WhatsApp-style messaging platform built for **Ishrit Sachdeva**. It's a real-time communication app with messaging, voice/video calls, group chats, status/moments, and push notifications — built entirely as a **web app that also packages into an Android APK**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, Tailwind CSS, Lucide Icons |
| Backend/DB | Firebase Firestore (messages, users, groups) |
| Realtime | Firebase Realtime Database (presence/online status) |
| Auth | Firebase Auth (Email/Password + Google Sign-In) |
| Calls | WebRTC (peer-to-peer, mesh for groups) |
| Push | FCM V1 API (service worker + native Capacitor) |
| Mobile | Capacitor (Android APK packaging) |
| Fonts | Nunito + Poppins |

---

## Features Built & Logic Used

### 🔐 Authentication
- **Email/Password** — Firebase `createUserWithEmailAndPassword` / `signInWithEmailAndPassword`
- **Google Sign-In** — Firebase `signInWithPopup` with `GoogleAuthProvider`
- **Profile Setup** — First-time users set name + avatar after login; stored in Firestore `users/{uid}`
- **Password Reset** — `sendPasswordResetEmail`
- Phone OTP removed (requires Blaze billing plan)

---

### 💬 Messaging
- **Real-time messages** — Firestore `onSnapshot` on `chats/{chatId}/messages` collection
- **Chat creation** — `getOrCreateChat(uid1, uid2)` generates deterministic chatId by sorting UIDs
- **Message types** — text, image (base64), file (base64), voice note, camera capture
- **Features** — reply, edit, delete (for me / for everyone), forward, reactions (emoji), read receipts (double tick), typing indicator
- **Media** — stored as base64 data URLs in Firestore (max 8MB, no Firebase Storage needed)
- **Forwarding** — `forwardMessage` sends to multiple chats/groups simultaneously

---

### 👥 Group Chats
- Groups stored in `groups/{groupId}` with members array
- **Real-time member updates** — live Firestore subscription; removed members see toast + auto-navigate out
- **Group info panel** — description, add/remove members, admin controls
- **Group messages** — stored in `groups/{groupId}/messages`
- **Exit/Remove** — `exitGroupWithNotice` / `removeGroupMember` post system messages

---

### 📞 Voice & Video Calls (WebRTC)

**1-on-1 calls:**
- Caller creates `calls/{callId}` doc with status `ringing`
- Both sides exchange SDP offer/answer via Firestore signaling
- ICE candidates stored in `calls/{callId}/candidates`
- `useWebRTC` hook manages the full lifecycle: stream capture → peer connection → answer/decline/end
- **Camera flip** — `switchCamera()` stops old video track, opens new `getUserMedia` with opposite `facingMode`, replaces track in `RTCPeerConnection` via `replaceTrack`
- **Speaker toggle** — `setSinkId` on desktop; AudioContext trick for Android WebView

**Group calls (mesh topology):**
- Every participant connects directly to every other — N×(N-1)/2 peer connections
- `useGroupWebRTC` hook manages multiple `RTCPeerConnection` objects keyed by peer UID
- Signaling via `groupCalls/{callId}/signals/{offerer}_{answerer}`
- `RemoteAudio` component handles audio separately (video elements stay muted for autoplay)

---

### 📸 Moments (Status)
- Posts stored in `statuses/{id}` with 24h expiry
- **Privacy** — "My contacts" / "Contacts except..." / "Only share with..." — contact picker filters who sees each post
- `StatusTab` enforces privacy rules when loading others' moments
- **Viewer tracking** — `viewers[]` array updated when someone watches
- **Progress bar** — `requestAnimationFrame` timer; pauses when viewer list panel is open

---

### 🔔 Push Notifications
- **Web (browser)** — FCM V1 API with JWT signed client-side using `SubtleCrypto` (service account credentials in `.env`)
- **Android APK** — `@capacitor/push-notifications` plugin registers native FCM token
- **Service Worker** (`firebase-messaging-sw.js`) — handles background messages, shows OS notifications with Reply/Dismiss actions
- **Notification tap** — SW posts message to app via `postMessage`; app routes to correct chat
- Calls show **"Open app"** button; messages show **"↩ Reply"** button

---

### 👤 Contacts & Search
- **Search by name** — client-side filter on all Firestore users (works without index)
- **Search by 6-digit code** — each user gets a random code on registration; `getUserByCode` query
- **Adding contacts** — mutual: both users added to each other's contacts list
- Contacts stored as UID arrays in `users/{uid}.contacts`

---

### ⚙️ Settings
| Section | What's Wired |
|---|---|
| Profile | Edit name, about, avatar (base64, 2MB limit) |
| Notifications | 5 toggles saved to Firestore `users/{uid}.notifications` |
| Privacy | Last seen, profile photo, about, read receipts — saved to `users/{uid}.privacy` |
| Appearance | 6 wallpapers (gradients applied via inline `style={{ background }}` on chat area), 3 themes (light/dark/system), font size |
| Blocklist | Block/unblock contacts; blocked users can't message you |

---

### 📱 Android APK
- **Capacitor** wraps the React build into a native WebView app
- `capacitor.config.ts` configures app ID `com.familyandfriends.app`
- `google-services.json` enables native FCM
- Build: `npm run build → npx cap sync android → Android Studio → Build APK`

---

### 🎨 UI/UX Details
- **Drag-and-drop PiP** — call screen small window uses ref-based DOM transforms (no React re-renders during drag = no flicker)
- **Video swap** — separate `pipLocalVideoRef` and `pipRemoteVideoRef` to avoid the "one ref, two elements" bug
- **Camera LED fix** — generation counter prevents stale `getUserMedia` from overwriting a killed stream; `srcObject = null` before `track.stop()`
- **Call sounds** — Web Audio API with `masterGain` node; ramped to 0 on stop so pre-scheduled oscillators don't play through
- **Online dot** — `subscribeToPresence` (Firebase RTDB) per chat partner; only green when `state === 'online'`
- **Animations** — custom CSS keyframes: slide-up, fade-in, zoom-in, sheet-up

---

### 🗄️ Firestore Structure
```
users/{uid}               → profile, contacts, privacy, notifications
chats/{chatId}/messages   → direct messages
groups/{groupId}/messages → group messages
calls/{callId}            → 1-on-1 call signaling
groupCalls/{callId}       → group call signaling + ICE
statuses/{statusId}       → moments posts
```

---

### 🚀 Deployment (Vercel)
1. Push to GitHub
2. Connect repo on vercel.com → Framework: Vite
3. Add 3 env vars: `VITE_FIREBASE_VAPID_KEY`, `VITE_SA_CLIENT_EMAIL`, `VITE_SA_PRIVATE_KEY`
4. Add Vercel domain to Firebase Auth → Authorized domains

---

## What's NOT included (requires Firebase Blaze)
- Real phone OTP (Blaze billing needed)
- Push notifications when app is completely closed on web (service worker limitation without backend)
- Video/file storage beyond 8MB