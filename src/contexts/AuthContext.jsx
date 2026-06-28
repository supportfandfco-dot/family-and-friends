// ═══════════════════════════════════════════════════════
//  AuthContext — Multi-method Authentication
//  Phone OTP · Email/Password · Google
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  auth, db, RecaptchaVerifier, signInWithPhoneNumber,
  signInWithGoogle, signUpWithEmail, signInWithEmail, resetPassword,
  doc, getDoc, setDoc, serverTimestamp, setupPresence, uploadMedia
} from '../firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]                   = useState(null);
  const [profile, setProfile]             = useState(null);
  const [loading, setLoading]             = useState(true);
  const [confirmResult, setConfirmResult] = useState(null);

  // ── Auth state listener ──────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const snap = await getDoc(doc(db, 'users', u.uid));
        if (snap.exists()) setProfile({ id: snap.id, ...snap.data() });
        try {
          const cleanupPresence = setupPresence(u.uid);
          // Store cleanup so we can call it on logout
          if (typeof cleanupPresence === 'function') window._presenceCleanup = cleanupPresence;
        } catch {}  // RTDB optional — don't block auth
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return unsub;
  }, []);

  // ── reCAPTCHA helpers (phone only) ───────────────────
  const clearRecaptcha = () => {
    if (window.recaptchaVerifier) {
      try { window.recaptchaVerifier.clear(); } catch {}
      window.recaptchaVerifier = null;
    }
    const el = document.getElementById('recaptcha-container');
    if (el) el.innerHTML = '';
  };

  const setupRecaptcha = useCallback(() => {
    clearRecaptcha();
    window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {},
      'expired-callback': () => clearRecaptcha(),
    });
    return window.recaptchaVerifier;
  }, []);

  // ── Phone OTP ────────────────────────────────────────
  const sendOTP = useCallback(async (phoneNumber) => {
    try {
      const verifier = setupRecaptcha();
      const result = await signInWithPhoneNumber(auth, phoneNumber, verifier);
      setConfirmResult(result);
      return result;
    } catch (err) {
      clearRecaptcha();
      if (err.code === 'auth/unauthorized-domain') {
        throw new Error(`Please add "${window.location.hostname}" to Firebase Console -> Authentication -> Settings -> Authorized domains to use Phone Auth.`);
      }
      throw err;
    }
  }, [setupRecaptcha]);

  const verifyOTP = useCallback(async (otp) => {
    if (!confirmResult) throw new Error('Session expired. Please request a new OTP.');
    try {
      const cred = await confirmResult.confirm(otp);
      return cred.user;
    } catch {
      throw new Error('Invalid OTP. Please check and try again.');
    }
  }, [confirmResult]);

  // ── Google Sign-In ───────────────────────────────────
  const loginWithGoogle = useCallback(async () => {
    const res = await signInWithGoogle();
    return res?.user;
  }, []);

  // ── Email / Password ─────────────────────────────────
  const loginWithEmail = useCallback(async (email, password) => {
    const u = await signInWithEmail(email, password);
    return u;
  }, []);

  const registerWithEmail = useCallback(async (email, password) => {
    const u = await signUpWithEmail(email, password);
    return u;
  }, []);

  const sendPasswordReset = useCallback(async (email) => {
    await resetPassword(email);
  }, []);

  // ── Complete profile setup (after any login method) ──
  const completeProfile = useCallback(async (uid, identifier, name, avatar = null) => {
    let finalAvatar = avatar;
    if (avatar && avatar.startsWith('data:')) {
      finalAvatar = await uploadMedia(avatar, `profiles/${uid}/avatar_${Date.now()}`);
    }
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const profileData = {
      uid,
      phone: (identifier && identifier.startsWith('+')) ? identifier : null,
      email: (identifier && identifier.includes('@')) ? identifier : null,
      name,
      nameLower: name.toLowerCase(),
      avatar: finalAvatar || null,
      code,
      about: 'Hey there! I am using Family & Friends.',
      createdAt: serverTimestamp(),
      pushToken: null,
      theme: 'system',
      wallpaper: 'default',
      notificationsEnabled: true,
      contacts: [],
      blockedUsers: [],
    };
    try {
      await setDoc(doc(db, 'users', uid), profileData);
    } catch (e) {
      // setDoc error — handled by retry
      throw e;
    }
    setProfile({ id: uid, ...profileData });
    return profileData;
  }, []);

  // ── Update profile ───────────────────────────────────
  const updateProfile = useCallback(async (updates) => {
    if (!user) return;
    await setDoc(doc(db, 'users', user.uid), updates, { merge: true });
    setProfile(prev => ({ ...prev, ...updates }));
  }, [user]);

  // ── Logout ───────────────────────────────────────────
  const logout = useCallback(async () => {
    clearRecaptcha();
    // Clean up presence before signing out
    if (typeof window._presenceCleanup === 'function') {
      try { window._presenceCleanup(); } catch {}
      window._presenceCleanup = null;
    }
    await signOut(auth);
    setProfile(null);
    setUser(null);
  }, []);

  const value = {
    user, profile, loading, confirmResult,
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
