// ═══════════════════════════════════════════════════════
//  HiddenChats — Passcode-protected hidden conversations
// ═══════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { db, getUserById, setChatHidden } from '../../firebase';
import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { Lock, ArrowLeft, Check, AlertCircle, MessageCircle, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';

// PIN is hashed before ever reaching Firestore — the previous version
// compared/stored it in plaintext. A 4-digit PIN is low-entropy enough
// that hashing alone isn't cryptographically bulletproof, but it's
// strictly better than plaintext, and matches how a real "forgot my PIN"
// flow would need to work anyway (compare hashes, never expose the
// original value).
async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── PIN pad ───────────────────────────────────────────
function PinPad({ onComplete, title, subtitle }) {
  const [pin, setPin] = useState('');
  const digits = [1,2,3,4,5,6,7,8,9,'',0,'⌫'];

  const press = (d) => {
    if (d === '⌫') { setPin(p => p.slice(0,-1)); return; }
    if (d === '') return;
    const next = pin + String(d);
    setPin(next);
    if (next.length === 4) {
      setTimeout(() => { onComplete(next); setPin(''); }, 200);
    }
  };

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="text-center">
        <div className="w-14 h-14 rounded-2xl bg-brand-500/10 flex items-center justify-center mx-auto mb-3">
          <Lock size={24} className="text-brand-500" />
        </div>
        <h2 className="font-bold text-lg text-[var(--text-primary)]">{title}</h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1">{subtitle}</p>
      </div>

      {/* PIN dots */}
      <div className="flex gap-4">
        {[0,1,2,3].map(i => (
          <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${
            pin.length > i ? 'bg-brand-500 border-brand-500' : 'border-[var(--border)]'
          }`} />
        ))}
      </div>

      {/* Keypad */}
      <div className="grid grid-cols-3 gap-3 w-full max-w-[260px]">
        {digits.map((d, i) => (
          <button key={i} onClick={() => press(d)}
            className={`h-14 rounded-2xl text-xl font-semibold transition-all active:scale-95 ${
              d === ''
                ? 'pointer-events-none'
                : d === '⌫'
                ? 'bg-[var(--hover)] text-[var(--text-secondary)]'
                : 'bg-[var(--sidebar-bg)] border border-[var(--border)] text-[var(--text-primary)] hover:border-brand-400'
            }`}>
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Hidden chat row ───────────────────────────────────
function HiddenChatRow({ chatId, uid, onOpen, onUnhide }) {
  const [preview, setPreview] = useState(null); // { partner, chat }

  useEffect(() => {
    let stale = false;
    (async () => {
      try {
        const chatSnap = await getDoc(doc(db, 'chats', chatId));
        if (!chatSnap.exists()) return;
        const chat = { id: chatSnap.id, ...chatSnap.data() };
        const partnerId = chat.participants?.find(p => p !== uid);
        if (!partnerId) return;
        const partner = await getUserById(partnerId);
        if (!stale) setPreview({ partner, chat });
      } catch {}
    })();
    return () => { stale = true; };
  }, [chatId, uid]);

  if (!preview?.partner) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-[var(--hover)] transition-colors">
      <button onClick={() => onOpen(preview.partner, chatId)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
        {preview.partner.avatar ? (
          <img src={preview.partner.avatar} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
        ) : (
          <div className="w-11 h-11 rounded-full bg-brand-500/20 flex items-center justify-center flex-shrink-0">
            <MessageCircle size={18} className="text-brand-500" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[var(--text-primary)] truncate">{preview.partner.name || 'Unknown'}</p>
          <p className="text-xs text-[var(--text-secondary)] truncate">
            {preview.chat.lastMessage?.content || 'No messages yet'}
          </p>
        </div>
      </button>
      <button onClick={() => onUnhide(chatId)} title="Unhide"
        className="w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center flex-shrink-0">
        <EyeOff size={16} className="text-[var(--text-secondary)]" />
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
export default function HiddenChats({ onBack, onOpenChat }) {
  const { user } = useAuth();
  const [screen, setScreen] = useState('loading'); // loading | setup | confirm | verify | list
  const [tempPin, setTempPin] = useState('');
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState('');
  const [hiddenChatIds, setHiddenChatIds] = useState([]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, 'users', user.uid, 'settings', 'hiddenChats')).then(snap => {
      const data = snap.data();
      if (snap.exists() && data?.pinHash) {
        setScreen('verify');
      } else {
        setScreen('setup');
      }
    }).catch(() => setScreen('setup'));
  }, [user]);

  // Live-updating list of hidden chat ids, once unlocked — so hiding a
  // chat from ChatList's long-press menu while this screen is open (or in
  // another tab) reflects immediately, not just on next open.
  useEffect(() => {
    if (!user || !unlocked) return;
    return onSnapshot(doc(db, 'users', user.uid, 'settings', 'hiddenChats'), snap => {
      setHiddenChatIds(snap.data()?.hiddenChatIds || []);
    });
  }, [user, unlocked]);

  const savePinHash = async (pin) => {
    const pinHash = await hashPin(pin);
    await setDoc(doc(db, 'users', user.uid, 'settings', 'hiddenChats'), {
      pinHash,
      updatedAt: new Date().toISOString(),
    }, { merge: true });
  };

  const handleSetup = (pin) => {
    setTempPin(pin);
    setScreen('confirm');
  };

  const handleConfirm = async (pin) => {
    if (pin !== tempPin) {
      setError('PINs do not match. Try again.');
      setScreen('setup');
      setTempPin('');
      return;
    }
    await savePinHash(pin);
    toast.success('Hidden Chats PIN set!');
    setUnlocked(true);
    setScreen('list');
  };

  const handleVerify = async (pin) => {
    const snap = await getDoc(doc(db, 'users', user.uid, 'settings', 'hiddenChats'));
    const storedHash = snap.data()?.pinHash;
    const enteredHash = await hashPin(pin);
    if (enteredHash === storedHash) {
      setUnlocked(true);
      setScreen('list');
      setError('');
    } else {
      setError('Wrong PIN. Try again.');
    }
  };

  const handleUnhide = async (chatId) => {
    await setChatHidden(user.uid, chatId, false);
    toast.success('Chat unhidden');
  };

  const handleOpen = (partner, chatId) => {
    onOpenChat?.(partner, chatId);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
        <button onClick={onBack} className="w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center">
          <ArrowLeft size={20} className="text-[var(--text-secondary)]"/>
        </button>
        <h2 className="font-bold text-[var(--text-primary)]">Hidden Chats</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="mx-4 mt-4 flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl p-3">
            <AlertCircle size={16} className="text-red-400 flex-shrink-0"/>
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {screen === 'loading' && (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
          </div>
        )}

        {screen === 'setup' && (
          <PinPad
            title="Set Your PIN"
            subtitle="Choose a 4-digit PIN to protect hidden chats"
            onComplete={handleSetup}
          />
        )}

        {screen === 'confirm' && (
          <PinPad
            title="Confirm Your PIN"
            subtitle="Enter the same PIN again to confirm"
            onComplete={handleConfirm}
          />
        )}

        {screen === 'verify' && (
          <PinPad
            title="Enter PIN"
            subtitle="Enter your PIN to access hidden chats"
            onComplete={handleVerify}
          />
        )}

        {screen === 'list' && unlocked && (
          <div className="p-4 space-y-4">
            <div className="bg-brand-500/10 border border-brand-500/20 rounded-2xl p-4 flex items-center gap-3">
              <Check size={18} className="text-brand-500 flex-shrink-0"/>
              <div>
                <p className="text-sm font-semibold text-[var(--text-primary)]">Hidden Chats Unlocked</p>
                <p className="text-xs text-[var(--text-secondary)]">Long-press any chat and choose "Hide" to add it here</p>
              </div>
            </div>

            {hiddenChatIds.length === 0 ? (
              <div className="text-center py-12">
                <Lock size={28} className="mx-auto text-[var(--text-secondary)] opacity-30 mb-3"/>
                <p className="text-sm text-[var(--text-secondary)]">No hidden chats yet</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">Chats you hide will appear here</p>
              </div>
            ) : (
              <div className="space-y-1">
                {hiddenChatIds.map(chatId => (
                  <HiddenChatRow
                    key={chatId}
                    chatId={chatId}
                    uid={user.uid}
                    onOpen={handleOpen}
                    onUnhide={handleUnhide}
                  />
                ))}
              </div>
            )}

            <button onClick={() => { setScreen('setup'); setTempPin(''); setError(''); }}
              className="w-full py-3 bg-[var(--hover)] border border-[var(--border)] rounded-xl text-sm font-semibold text-[var(--text-primary)] hover:border-brand-400 transition-all">
              Change PIN
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
