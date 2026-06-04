// ═══════════════════════════════════════════════════════
//  PhoneAuth — Login Screen (Email · Google)
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════
import { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import toast from 'react-hot-toast';
import { Eye, EyeOff, ArrowLeft, MessageSquare } from 'lucide-react';

export default function PhoneAuth() {
  const { loginWithGoogle, loginWithEmail, registerWithEmail, sendPasswordReset, completeProfile } = useAuth();

  const [step,       setStep]       = useState('login');
  const [loading,    setLoading]    = useState(false);
  const [showPass,   setShowPass]   = useState(false);
  const [isRegister, setIsRegister] = useState(false);
  const [email,      setEmail]      = useState('');
  const [password,   setPassword]   = useState('');
  const [confirm,    setConfirm]    = useState('');
  const [pendingUser,setPendingUser] = useState(null);
  const [name,       setName]       = useState('');
  const [avatar,     setAvatar]     = useState(null);
  const [purpose,    setPurpose]    = useState('');

  const checkProfile = async (u) => {
    const snap = await getDoc(doc(db, 'users', u.uid));
    if (!snap.exists()) {
      setPendingUser(u);
      if (u.displayName) setName(u.displayName);
      if (u.photoURL)    setAvatar(u.photoURL);
      setStep('profile');
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try { await checkProfile(await loginWithGoogle()); }
    catch (e) { toast.error(e.message || 'Google sign-in failed'); }
    finally { setLoading(false); }
  };

  const handleEmail = async () => {
    if (!email.trim() || !password) { toast.error('Enter email and password'); return; }
    if (isRegister && password !== confirm) { toast.error('Passwords do not match'); return; }
    if (isRegister && password.length < 6)  { toast.error('Password must be at least 6 characters'); return; }
    setLoading(true);
    try {
      const u = isRegister
        ? await registerWithEmail(email.trim(), password)
        : await loginWithEmail(email.trim(), password);
      if (isRegister) {
        toast.success('Account created! Check your email to verify your account.', { duration: 6000 });
      }
      await checkProfile(u);
    } catch (e) {
      const msg = e.code === 'auth/user-not-found'       ? 'No account found with this email'
                : e.code === 'auth/wrong-password'       ? 'Incorrect password'
                : e.code === 'auth/invalid-credential'   ? 'Incorrect email or password'
                : e.code === 'auth/email-already-in-use' ? 'Email already registered — try signing in'
                : e.code === 'auth/invalid-email'        ? 'Invalid email address'
                : e.code === 'auth/network-request-failed' ? 'Network error — check your connection'
                : e.message || 'Authentication failed';
      toast.error(msg);
    } finally { setLoading(false); }
  };

  const handleForgot = async () => {
    if (!email.trim()) { toast.error('Enter your email first'); return; }
    setLoading(true);
    try {
      await sendPasswordReset(email.trim());
      toast.success('Reset link sent! Check your inbox and spam folder.');
      setStep('login');
    } catch (e) {
      const msg = e?.code === 'auth/user-not-found'    ? 'No account found with this email.' :
                  e?.code === 'auth/invalid-email'     ? 'Invalid email address.' :
                  e?.code === 'auth/too-many-requests' ? 'Too many attempts. Try again later.' :
                  `Error: ${e?.message || 'Failed to send reset email'}`;
      toast.error(msg);
    }
    finally { setLoading(false); }
  };

  const handleAvatarPick = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Max 2MB'); return; }
    const r = new FileReader();
    r.onload = () => setAvatar(r.result);
    r.readAsDataURL(file);
  };

  const handleProfile = async () => {
    if (!name.trim()) { toast.error('Enter your name'); return; }
    if (!pendingUser) return;
    setLoading(true);
    try {
      await completeProfile(pendingUser.uid, pendingUser.email || pendingUser.uid, name.trim(), avatar);
    } catch (e) {
      console.error('Profile error:', e);
      toast.error(e.message || 'Failed to save profile');
    } finally { setLoading(false); }
  };

  const inputCls = "w-full px-4 py-3 rounded-2xl bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-brand-400 transition-colors text-sm";
  const btnCls   = "w-full py-3.5 rounded-2xl font-semibold text-sm transition-all press-scale disabled:opacity-50";

  if (step === 'profile') return (
    <div className="min-h-screen bg-gradient-to-br from-[#052e16] via-[#14532d] to-[#052e16] flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-4xl mb-2">👋</div>
          <h1 className="text-2xl font-bold text-white">Set up your profile</h1>
          <p className="text-white/60 text-sm mt-1">This is how others will see you</p>
        </div>
        <div className="flex justify-center">
          <label className="cursor-pointer group">
            <div className="w-24 h-24 rounded-full bg-white/10 border-2 border-dashed border-white/30 group-hover:border-brand-400 flex items-center justify-center overflow-hidden transition-colors">
              {avatar ? <img src={avatar} className="w-full h-full object-cover" alt="avatar" />
                      : <span className="text-3xl">{name?.[0]?.toUpperCase() || '📷'}</span>}
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
          </label>
        </div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
          className={inputCls} />

        <div className="pt-2">
          <p className="text-white/80 text-sm mb-3">What do you want UnifyAI to help with?</p>
          <div className="flex flex-wrap gap-2">
            {['Family', 'School', 'Work', 'Friends'].map(p => (
              <button key={p} onClick={() => setPurpose(p)}
                className={`px-4 py-2 rounded-xl text-sm transition-all focus:outline-none ${purpose === p ? 'bg-brand-500 text-white border border-brand-400' : 'bg-white/10 text-white/70 border border-white/20 hover:bg-white/20'}`}>
                {p}
              </button>
            ))}
          </div>
        </div>

        <button onClick={handleProfile} disabled={loading}
          className={`${btnCls} bg-brand-500 hover:bg-brand-400 text-white mt-4`}>
          {loading ? 'Setting up…' : 'Continue →'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#052e16] via-[#14532d] to-[#052e16] flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-5">

        <div className="text-center mb-2">
          <div className="w-16 h-16 rounded-2xl bg-brand-500 flex items-center justify-center mx-auto mb-3">
            <MessageSquare size={32} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Family & Friends</h1>
          <p className="text-white/60 text-sm mt-1">Stay connected with the ones you love</p>
        </div>

        {step === 'forgot' ? (
          <div className="space-y-3">
            <button onClick={() => setStep('login')} className="text-white/60 hover:text-white flex items-center gap-2 text-sm">
              <ArrowLeft size={16}/> Back
            </button>
            <p className="text-white/70 text-sm">Enter your email and we'll send you a reset link.</p>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email"
              placeholder="Email address" className={inputCls} />
            <button onClick={handleForgot} disabled={loading}
              className={`${btnCls} bg-brand-500 hover:bg-brand-400 text-white`}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <input value={email} onChange={e => setEmail(e.target.value)} type="email"
              placeholder="Email address" className={inputCls} />
            <div className="relative">
              <input value={password} onChange={e => setPassword(e.target.value)}
                type={showPass ? 'text' : 'password'} placeholder="Password" className={inputCls}
                onKeyDown={e => e.key === 'Enter' && handleEmail()} />
              <button onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/50 hover:text-white">
                {showPass ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
            {isRegister && (
              <input value={confirm} onChange={e => setConfirm(e.target.value)}
                type="password" placeholder="Confirm password" className={inputCls}
                onKeyDown={e => e.key === 'Enter' && handleEmail()} />
            )}
            <button onClick={handleEmail} disabled={loading}
              className={`${btnCls} bg-brand-500 hover:bg-brand-400 text-white`}>
              {loading ? (isRegister ? 'Creating account…' : 'Signing in…')
                       : (isRegister ? 'Create account' : 'Sign in')}
            </button>
            <div className="flex justify-between text-xs">
              <button onClick={() => { setIsRegister(v => !v); setConfirm(''); }}
                className="text-white/60 hover:text-white">
                {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
              </button>
              {!isRegister && (
                <button onClick={() => setStep('forgot')} className="text-brand-400 hover:text-brand-300">
                  Forgot password?
                </button>
              )}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-white/40 text-xs">or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <button onClick={handleGoogle} disabled={loading}
          className={`${btnCls} bg-white hover:bg-white/90 text-gray-800 flex items-center justify-center gap-2`}>
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.1-4z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.5 29.3 4 24 4c-7.7 0-14.3 4.4-17.7 10.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.5 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7l-6.5 5C9.7 39.6 16.4 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.5-2.6 4.6-4.8 6l6.2 5.2C40.7 35.5 44 30.2 44 24c0-1.3-.1-2.7-.4-4z"/>
          </svg>
          Continue with Google
        </button>

      </div>
      <div id="recaptcha-container" />
    </div>
  );
}
