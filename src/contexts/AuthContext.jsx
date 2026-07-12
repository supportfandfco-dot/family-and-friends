// ═══════════════════════════════════════════════════════
//  AuthContext — Multi-method Authentication (Supabase)
//  Email/Password · Google
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  onAuthChange, signInWithGoogle, signUpWithEmail, signInWithEmail,
  sendPasswordReset as sendPasswordResetSb, signOut as signOutSb,
  completeProfile as completeProfileSb, updateProfile as updateProfileSb,
  getUserById, setupPresence,
} from '../supabase';
import { uploadMedia } from '../mediaUpload';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]                   = useState(null);
  const [profile, setProfile]             = useState(null);
  const [loading, setLoading]             = useState(true);

  // ── Auth state listener ──────────────────────────────
  useEffect(() => {
    const unsub = onAuthChange(async (u) => {
      // Supabase's user object uses .id, not .uid like Firebase's did.
      // Dozens of components across this app still read user.uid — rather
      // than requiring every single one of them to change in the same
      // pass as this file (which would break the whole app at once,
      // contradicting the incremental migration plan), .uid is aliased
      // onto the same value as .id here. Safe to remove once every
      // component has been individually migrated to read .id instead.
      const normalized = u ? { ...u, uid: u.id } : null;
      setUser(normalized);
      if (normalized) {
        const p = await getUserById(normalized.id);
        setProfile(p);
        try {
          const cleanupPresence = setupPresence(normalized.id);
          if (typeof cleanupPresence === 'function') window._presenceCleanup = cleanupPresence;
        } catch {} // presence is best-effort — never blocks auth
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── Phone OTP — NOT YET CONFIGURED on Supabase ───────
  // Supabase Auth supports phone OTP, but it requires a configured SMS
  // provider (Twilio, MessageBird, etc. — a paid third-party service,
  // unlike Firebase's built-in phone auth). Since the app's actual primary
  // flows are email/Google (per PhoneAuth.jsx's own UI, phone is present
  // but secondary), this is stubbed with a clear error rather than either
  // silently failing or spending migration effort wiring up a paid SMS
  // provider that may not end up being wanted. Wire this up properly if
  // phone sign-in turns out to matter — see Supabase Auth → Providers →
  // Phone in the dashboard.
  const sendOTP = useCallback(async () => {
    throw new Error('Phone sign-in isn\'t configured yet on Supabase — it needs an SMS provider (e.g. Twilio) set up in Authentication → Providers → Phone. Use email or Google sign-in for now.');
  }, []);
  const verifyOTP = useCallback(async () => {
    throw new Error('Phone sign-in isn\'t configured yet on Supabase.');
  }, []);

  // ── Google Sign-In ───────────────────────────────────
  // NOTE: Supabase's OAuth flow is redirect-based (the whole page
  // navigates to Google and back), unlike Firebase's popup option —
  // onAuthChange picks up the new session automatically once the redirect
  // completes, no extra handling needed here.
  const loginWithGoogle = useCallback(async () => {
    await signInWithGoogle();
    // The browser navigates away here — nothing after this line runs
    // until the redirect back completes and onAuthChange fires.
  }, []);

  // ── Email / Password ─────────────────────────────────
  const loginWithEmail = useCallback(async (email, password) => {
    return await signInWithEmail(email, password);
  }, []);

  const registerWithEmail = useCallback(async (email, password) => {
    return await signUpWithEmail(email, password);
  }, []);

  const sendPasswordReset = useCallback(async (email) => {
    await sendPasswordResetSb(email);
  }, []);

  // ── Complete profile setup (after any login method) ──
  const completeProfile = useCallback(async (uid, identifier, name, avatar = null, purpose = '') => {
    let finalAvatar = avatar;
    if (avatar && avatar.startsWith('data:')) {
      finalAvatar = await uploadMedia(avatar, `profiles/${uid}/avatar_${Date.now()}`);
    }
    await completeProfileSb(uid, identifier, name, finalAvatar, purpose);
    const p = await getUserById(uid);
    setProfile(p);
    return p;
  }, []);

  // ── Update profile ───────────────────────────────────
  // Explicit map, not a blind camelCase->snake_case regex — a generic
  // regex would turn "autoPilotRules" into "auto_pilot_rules", but the
  // actual column is "autopilot_rules" (no separating underscore,
  // "autopilot" as one word). A guessed conversion for an ambiguous case
  // like this would silently write to the wrong column name.
  const FIELD_MAP = {
    nameLower: 'name_lower',
    isOnline: 'is_online',
    lastSeen: 'last_seen',
    notificationsEnabled: 'notifications_enabled',
    pushToken: 'push_token',
    autoPilotMode: 'autopilot_mode',
    autoPilotRules: 'autopilot_rules',
    createdAt: 'created_at',
  };
  const updateProfile = useCallback(async (updates) => {
    if (!user) return;
    const mapped = {};
    for (const [k, v] of Object.entries(updates)) {
      mapped[FIELD_MAP[k] || k] = v;
    }
    await updateProfileSb(user.id, mapped);
    setProfile(prev => ({ ...prev, ...updates, ...mapped }));
  }, [user]);

  // ── Logout ───────────────────────────────────────────
  const logout = useCallback(async () => {
    if (typeof window._presenceCleanup === 'function') {
      try { window._presenceCleanup(); } catch {}
      window._presenceCleanup = null;
    }
    await signOutSb();
    setProfile(null);
    setUser(null);
  }, []);

  const value = {
    user, profile, loading,
    sendOTP, verifyOTP,
    loginWithGoogle,
    loginWithEmail, registerWithEmail, sendPasswordReset,
    completeProfile, updateProfile, logout,
    isAuthenticated: !!user && !!profile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
};
