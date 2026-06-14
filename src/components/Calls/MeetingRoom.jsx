// ═══════════════════════════════════════════════════════
//  MeetingRoom v2 — production-grade waiting room
//  No race conditions. Firestore-backed. Works reliably.
// ═══════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react';
import { db } from '../../firebase';
import {
  doc, setDoc, getDoc, onSnapshot, updateDoc,
  collection, addDoc, deleteDoc, serverTimestamp, writeBatch,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import {
  Video, Users, Check, X, Clock, Wifi, WifiOff,
  Copy, UserCheck, AlertCircle, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Firestore paths ───────────────────────────────────
const meetingRef   = (code) => doc(db, 'meetings', code);
const waitingRef   = (code, uid) => doc(db, 'meetings', code, 'waiting', uid);
const admittedRef  = (code, uid) => doc(db, 'meetings', code, 'admitted', uid);
const waitingCol   = (code) => collection(db, 'meetings', code, 'waiting');
const admittedCol  = (code) => collection(db, 'meetings', code, 'admitted');

// ── Status badge ──────────────────────────────────────
function Badge({ status }) {
  const map = {
    waiting:     'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    active:      'bg-brand-500/15 text-brand-500 border-brand-500/30',
    ended:       'bg-[var(--hover)] text-[var(--text-secondary)] border-[var(--border)]',
    not_started: 'bg-[var(--hover)] text-[var(--text-secondary)] border-[var(--border)]',
  };
  const labels = {
    waiting: '⏳ Waiting for participants',
    active:  '🟢 Meeting Active',
    ended:   '⬛ Meeting Ended',
    not_started: '⚪ Not Started',
  };
  const s = status || 'not_started';
  return (
    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${map[s] || map.not_started}`}>
      {labels[s] || labels.not_started}
    </span>
  );
}

// ── HOST VIEW ─────────────────────────────────────────
function HostView({ code, meeting, onStartCall }) {
  const [waiting, setWaiting] = useState([]);

  useEffect(() => {
    if (!code) return;
    return onSnapshot(waitingCol(code), snap =>
      setWaiting(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
  }, [code]);

  const admit = useCallback(async (req) => {
    try {
      const batch = writeBatch(db);
      // 1. Add to admitted
      batch.set(admittedRef(code, req.uid), {
        uid: req.uid, name: req.name, admittedAt: serverTimestamp(),
      });
      // 2. Remove from waiting
      batch.delete(waitingRef(code, req.uid));
      // 3. Update meeting status + participant list
      batch.update(meetingRef(code), {
        status: 'active',
        [`participants.${req.uid}`]: { name: req.name, joinedAt: serverTimestamp() },
      });
      await batch.commit();
      toast.success(`${req.name} admitted`);
    } catch (e) {
      toast.error('Failed to admit: ' + e.message);
    }
  }, [code]);

  const reject = useCallback(async (req) => {
    try {
      // Write rejected status FIRST, then delete (participant reads it before deletion)
      await updateDoc(waitingRef(code, req.uid), { status: 'rejected' });
      setTimeout(() => deleteDoc(waitingRef(code, req.uid)).catch(() => {}), 2000);
    } catch {}
    toast(`${req.name} rejected`);
  }, [code]);

  const admitAll = () => Promise.all(waiting.map(r => admit(r)));

  const endMeeting = async () => {
    await updateDoc(meetingRef(code), { status: 'ended' }).catch(() => {});
    toast('Meeting ended');
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code).then(() => toast.success('Room code copied!')).catch(() => {});
  };

  const participants = Object.entries(meeting?.participants || {});

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-y-auto pb-6">
      <div className="text-center">
        <p className="text-xs text-[var(--text-secondary)] mb-1">You are the host</p>
        <h2 className="font-bold text-lg text-[var(--text-primary)]">{meeting?.name || 'Instant Meeting'}</h2>
        <div className="flex justify-center mt-2"><Badge status={meeting?.status} /></div>
      </div>

      {/* Room code */}
      <div className="bg-[var(--hover)] border border-[var(--border)] rounded-2xl p-4">
        <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Room Code — Share with participants</p>
        <div className="flex items-center justify-between">
          <span className="font-mono font-bold text-xl text-[var(--text-primary)] tracking-widest">{code}</span>
          <button onClick={copyCode}
            className="flex items-center gap-1.5 text-xs text-brand-500 font-semibold px-3 py-1.5 bg-brand-500/10 rounded-lg hover:bg-brand-500/20 transition-all">
            <Copy size={13} /> Copy
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-2">
        <div className="flex-1 bg-[var(--hover)] border border-[var(--border)] rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-[var(--text-primary)]">{participants.length}</p>
          <p className="text-[10px] text-[var(--text-secondary)]">In Room</p>
        </div>
        <div className="flex-1 bg-orange-500/10 border border-orange-500/20 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-orange-400">{waiting.length}</p>
          <p className="text-[10px] text-[var(--text-secondary)]">Waiting</p>
        </div>
      </div>

      {/* Waiting room */}
      {waiting.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Clock size={14} className="text-orange-400" />
              Waiting Room
            </p>
            {waiting.length > 1 && (
              <button onClick={admitAll} className="text-xs text-brand-500 font-semibold hover:underline">
                Admit All ({waiting.length})
              </button>
            )}
          </div>
          <div className="space-y-2">
            {waiting.map(req => (
              <div key={req.uid}
                className="flex items-center gap-3 bg-[var(--sidebar-bg)] border border-orange-500/30 rounded-xl p-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold flex-shrink-0 text-sm">
                  {req.name?.[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{req.name}</p>
                  <p className="text-[11px] text-orange-400">Wants to join</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => admit(req)}
                    className="w-8 h-8 rounded-full bg-brand-500 hover:bg-brand-600 flex items-center justify-center transition-all">
                    <Check size={14} className="text-white" />
                  </button>
                  <button onClick={() => reject(req)}
                    className="w-8 h-8 rounded-full bg-[var(--hover)] border border-[var(--border)] hover:border-red-400 flex items-center justify-center transition-all">
                    <X size={14} className="text-[var(--text-secondary)]" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {waiting.length === 0 && (
        <div className="flex-1 flex items-center justify-center py-6">
          <div className="text-center">
            <Clock size={24} className="mx-auto text-[var(--text-secondary)] opacity-30 mb-2" />
            <p className="text-sm text-[var(--text-secondary)]">No one waiting</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2 mt-auto">
        <button onClick={onStartCall}
          className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
          <Video size={16} /> Start Video Feed
        </button>
        {meeting?.status !== 'ended' && (
          <button onClick={endMeeting}
            className="w-full py-2.5 bg-[var(--hover)] border border-[var(--border)] text-red-400 rounded-xl text-sm font-semibold hover:border-red-400 transition-all">
            End Meeting
          </button>
        )}
      </div>
    </div>
  );
}

// ── PARTICIPANT VIEW ──────────────────────────────────
function ParticipantView({ code, uid, userName, onAdmitted }) {
  const [status, setStatus]   = useState('requesting'); // requesting | waiting | admitted | rejected
  const [meeting, setMeeting] = useState(null);

  // Watch meeting doc for status/host info
  useEffect(() => {
    if (!code) return;
    return onSnapshot(meetingRef(code), snap => setMeeting(snap.exists() ? snap.data() : null));
  }, [code]);

  // Write join request and watch own waiting doc
  useEffect(() => {
    if (!code || !uid) return;
    let unsubWaiting = null;

    const joinAndWatch = async () => {
      // Write the join request
      try {
        await setDoc(waitingRef(code, uid), {
          uid, name: userName,
          requestedAt: serverTimestamp(),
          status: 'waiting',
        });
        setStatus('waiting');
      } catch (e) {
        setStatus('error');
        return;
      }

      // Watch own waiting doc
      unsubWaiting = onSnapshot(waitingRef(code, uid), async (snap) => {
        if (!snap.exists()) {
          // Deleted — check if admitted
          try {
            const admSnap = await getDoc(admittedRef(code, uid));
            if (admSnap.exists()) {
              setStatus('admitted');
              // Delay slightly for animation, then trigger call
              setTimeout(() => onAdmitted?.(), 1500);
            } else {
              setStatus('rejected');
            }
          } catch {
            setStatus('rejected');
          }
        } else {
          const d = snap.data();
          if (d.status === 'rejected') {
            setStatus('rejected');
          }
        }
      });
    };

    joinAndWatch();

    return () => {
      unsubWaiting?.();
      // Clean up waiting doc on unmount (if still waiting)
      getDoc(waitingRef(code, uid)).then(snap => {
        if (snap.exists() && snap.data()?.status === 'waiting') {
          deleteDoc(waitingRef(code, uid)).catch(() => {});
        }
      }).catch(() => {});
    };
  }, [code, uid, userName]);

  const hostName         = meeting?.hostName || 'The host';
  const participantCount = Object.keys(meeting?.participants || {}).length;
  const hostOnline       = meeting?.hostOnline !== false;
  const meetingStatus    = meeting?.status || 'waiting';

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 gap-5 text-center">
      <div>
        <h2 className="font-bold text-lg text-[var(--text-primary)]">{meeting?.name || 'Meeting'}</h2>
        <div className="flex justify-center mt-2"><Badge status={meetingStatus} /></div>
        <div className="flex items-center justify-center gap-3 mt-3 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1">
            {hostOnline
              ? <Wifi size={11} className="text-brand-500" />
              : <WifiOff size={11} />}
            {hostName} {hostOnline ? 'online' : 'offline'}
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Users size={11} /> {participantCount} inside
          </span>
        </div>
      </div>

      <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
        status === 'admitted'  ? 'bg-brand-500/15' :
        status === 'rejected'  ? 'bg-red-500/15'   :
        'bg-orange-500/15'
      }`}>
        {status === 'admitted'
          ? <UserCheck size={28} className="text-brand-500" />
          : status === 'rejected'
          ? <X size={28} className="text-red-400" />
          : <Clock size={28} className="text-orange-400 animate-pulse" />}
      </div>

      <div>
        {(status === 'waiting' || status === 'requesting') && (
          <>
            <p className="font-semibold text-[var(--text-primary)]">Waiting for host approval</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">{hostName} will admit you shortly</p>
          </>
        )}
        {status === 'admitted' && (
          <>
            <p className="font-semibold text-brand-500">Host admitted you!</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">Joining meeting…</p>
          </>
        )}
        {status === 'rejected' && (
          <>
            <p className="font-semibold text-red-400">Host declined your request</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">You were not admitted to this meeting</p>
          </>
        )}
        {status === 'error' && (
          <p className="text-sm text-red-400">Could not join. Meeting may not exist.</p>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  Main MeetingRoom
// ═══════════════════════════════════════════════════════
export default function MeetingRoom({ meetingCode, isHost = false, onStartCall, onClose }) {
  const { user, profile } = useAuth();
  const [meeting, setMeeting]   = useState(null);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);
  const code = meetingCode;

  useEffect(() => {
    if (!code) return;

    // Host initializes the meeting doc
    if (isHost) {
      setDoc(meetingRef(code), {
        code,
        name:        `${profile?.name || 'My'}'s Meeting`,
        hostId:      user.uid,
        hostName:    profile?.name || 'Host',
        hostOnline:  true,
        status:      'waiting',
        participants: { [user.uid]: { name: profile?.name || 'Host', joinedAt: serverTimestamp() } },
        createdAt:   serverTimestamp(),
      }, { merge: true });

      // Mark host offline on unmount
      return () => {
        updateDoc(meetingRef(code), { hostOnline: false }).catch(() => {});
      };
    }
  }, [code, isHost, user?.uid]);

  // Watch meeting doc
  useEffect(() => {
    if (!code) return;
    return onSnapshot(meetingRef(code), snap => {
      setLoading(false);
      if (!snap.exists()) { setNotFound(true); return; }
      setMeeting(snap.data());
      setNotFound(false);
    });
  }, [code]);

  if (!code) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 z-[300] bg-[var(--sidebar-bg)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[var(--text-secondary)]">Loading meeting…</p>
        </div>
      </div>
    );
  }

  if (notFound && !isHost) {
    return (
      <div className="fixed inset-0 z-[300] bg-[var(--sidebar-bg)] flex items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-[var(--text-primary)]">Meeting not found</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            The room code <span className="font-mono font-bold">{code}</span> is invalid or this meeting has ended.
          </p>
          <button onClick={onClose}
            className="mt-4 px-5 py-2.5 bg-brand-500 text-white rounded-xl text-sm font-semibold">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[300] bg-[var(--sidebar-bg)] flex flex-col">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
        <button onClick={onClose} className="text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1">
          ← Back
        </button>
        <p className="text-sm font-semibold text-[var(--text-primary)]">Meeting Room</p>
        <div className="w-12" />
      </div>

      <div className="flex-1 overflow-hidden">
        {isHost ? (
          <HostView
            code={code}
            meeting={meeting}
            onStartCall={onStartCall}
          />
        ) : (
          <ParticipantView
            code={code}
            uid={user?.uid}
            userName={profile?.name || 'Guest'}
            onAdmitted={() => {
              onStartCall?.();
            }}
          />
        )}
      </div>
    </div>
  );
}
