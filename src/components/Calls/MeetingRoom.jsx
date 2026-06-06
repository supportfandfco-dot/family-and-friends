// ═══════════════════════════════════════════════════════
//  MeetingRoom — Waiting room with host approval flow
//  Host creates → participants wait → host admits/rejects
// ═══════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { db, auth } from '../../firebase';
import {
  doc, setDoc, getDoc, onSnapshot, updateDoc, serverTimestamp,
  collection, addDoc, deleteDoc, getDocs,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import {
  Video, Users, Check, X, Clock, Wifi, WifiOff,
  Copy, Share2, UserCheck, AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Meeting status badge ──────────────────────────────
function StatusBadge({ status }) {
  const map = {
    waiting:  { color: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30', label: '⏳ Waiting for participants' },
    active:   { color: 'bg-brand-500/15 text-brand-500 border-brand-500/30',   label: '🟢 Meeting Active' },
    ended:    { color: 'bg-[var(--hover)] text-[var(--text-secondary)] border-[var(--border)]', label: '⬛ Meeting Ended' },
    not_started: { color: 'bg-[var(--hover)] text-[var(--text-secondary)] border-[var(--border)]', label: '⚪ Not Started' },
  };
  const s = map[status] || map.not_started;
  return (
    <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${s.color}`}>
      {s.label}
    </span>
  );
}

// ── HOST VIEW ─────────────────────────────────────────
function HostView({ meeting, meetingId, onStartCall }) {
  const [waitingList, setWaitingList] = useState([]);

  useEffect(() => {
    if (!meetingId) return;
    const unsub = onSnapshot(
      collection(db, 'meetings', meetingId, 'waiting'),
      snap => setWaitingList(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    return unsub;
  }, [meetingId]);

  const admit = async (req) => {
    try {
      await addDoc(collection(db, 'meetings', meetingId, 'admitted'), {
        uid: req.uid, name: req.name, admittedAt: serverTimestamp(),
      });
      await deleteDoc(doc(db, 'meetings', meetingId, 'waiting', req.id));
      await updateDoc(doc(db, 'meetings', meetingId), {
        status: 'active',
        [`participants.${req.uid}`]: { name: req.name, joinedAt: serverTimestamp() },
      });
      toast.success(`${req.name} admitted`);
    } catch { toast.error('Failed to admit'); }
  };

  const reject = async (req) => {
    try {
      await updateDoc(doc(db, 'meetings', meetingId, 'waiting', req.id), {
        status: 'rejected',
      });
      await deleteDoc(doc(db, 'meetings', meetingId, 'waiting', req.id));
      toast(`${req.name} rejected`);
    } catch {}
  };

  const admitAll = async () => {
    await Promise.all(waitingList.map(r => admit(r)));
  };

  const endMeeting = async () => {
    await updateDoc(doc(db, 'meetings', meetingId), { status: 'ended' });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(meeting?.code || meetingId);
    toast.success('Room code copied');
  };

  const participantCount = Object.keys(meeting?.participants || {}).length;

  return (
    <div className="flex flex-col h-full p-4 gap-4">
      {/* Header */}
      <div className="text-center">
        <p className="text-xs text-[var(--text-secondary)] mb-1">You are the host</p>
        <h2 className="font-bold text-lg text-[var(--text-primary)]">{meeting?.name || 'Instant Meeting'}</h2>
        <div className="flex justify-center mt-2">
          <StatusBadge status={meeting?.status || 'waiting'} />
        </div>
      </div>

      {/* Room code */}
      <div className="bg-[var(--hover)] border border-[var(--border)] rounded-2xl p-4">
        <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Room Code</p>
        <div className="flex items-center justify-between">
          <span className="font-mono font-bold text-lg text-[var(--text-primary)] tracking-widest">
            {meeting?.code || meetingId}
          </span>
          <button onClick={copyCode}
            className="flex items-center gap-1.5 text-xs text-brand-500 font-semibold px-3 py-1.5 bg-brand-500/10 rounded-lg hover:bg-brand-500/20 transition-all">
            <Copy size={13} /> Copy
          </button>
        </div>
      </div>

      {/* Participants */}
      <div className="bg-[var(--hover)] border border-[var(--border)] rounded-xl p-3">
        <div className="flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Users size={14} className="text-brand-500" />
          <span className="font-semibold text-[var(--text-primary)]">{participantCount}</span>
          <span>participant{participantCount !== 1 ? 's' : ''} in room</span>
        </div>
      </div>

      {/* Waiting room */}
      {waitingList.length > 0 && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
              <Clock size={14} className="text-orange-400" />
              Waiting Room ({waitingList.length})
            </p>
            {waitingList.length > 1 && (
              <button onClick={admitAll}
                className="text-xs text-brand-500 font-semibold hover:underline">
                Admit All
              </button>
            )}
          </div>
          <div className="space-y-2">
            {waitingList.map(req => (
              <div key={req.id}
                className="flex items-center gap-3 bg-[var(--sidebar-bg)] border border-orange-500/30 rounded-xl p-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold flex-shrink-0">
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

      {waitingList.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Clock size={28} className="mx-auto text-[var(--text-secondary)] opacity-40 mb-2" />
            <p className="text-sm text-[var(--text-secondary)]">No one in waiting room</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="space-y-2">
        <button onClick={onStartCall}
          className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
          <Video size={16} /> Start Video Feed
        </button>
        <button onClick={endMeeting}
          className="w-full py-2.5 bg-[var(--hover)] border border-[var(--border)] text-red-400 rounded-xl text-sm font-semibold transition-all hover:border-red-400">
          End Meeting
        </button>
      </div>
    </div>
  );
}

// ── PARTICIPANT VIEW ──────────────────────────────────
function ParticipantView({ meeting, meetingId, uid, userName }) {
  const [status, setStatus] = useState('requesting'); // requesting | waiting | admitted | rejected

  useEffect(() => {
    if (!meetingId || !uid) return;

    // Request to join
    const reqRef = doc(db, 'meetings', meetingId, 'waiting', uid);
    setDoc(reqRef, {
      uid, name: userName, requestedAt: serverTimestamp(), status: 'waiting',
    });

    // Watch for admission/rejection
    const unsub = onSnapshot(reqRef, snap => {
      if (!snap.exists()) {
        // Removed from waiting = admitted or rejected
        // Check admitted collection
        getDoc(doc(db, 'meetings', meetingId, 'admitted', uid)).then(admSnap => {
          if (admSnap.exists()) setStatus('admitted');
          else setStatus('rejected');
        });
      } else {
        const d = snap.data();
        if (d.status === 'rejected') setStatus('rejected');
        else setStatus('waiting');
      }
    });

    return () => { unsub(); deleteDoc(reqRef).catch(() => {}); };
  }, [meetingId, uid, userName]);

  const hostName = meeting?.hostName || 'The host';
  const meetingName = meeting?.name || 'this meeting';
  const participantCount = Object.keys(meeting?.participants || {}).length;
  const hostOnline = meeting?.hostOnline !== false;

  return (
    <div className="flex flex-col items-center justify-center h-full p-6 gap-6 text-center">
      {/* Meeting info */}
      <div>
        <h2 className="font-bold text-lg text-[var(--text-primary)]">{meetingName}</h2>
        <div className="flex items-center justify-center gap-2 mt-2">
          <StatusBadge status={meeting?.status || 'not_started'} />
        </div>
        <div className="flex items-center justify-center gap-3 mt-3 text-xs text-[var(--text-secondary)]">
          <span className="flex items-center gap-1">
            {hostOnline ? <Wifi size={11} className="text-brand-500" /> : <WifiOff size={11} />}
            {hostName} {hostOnline ? 'online' : 'offline'}
          </span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Users size={11} />
            {participantCount} inside
          </span>
        </div>
      </div>

      {/* Status */}
      <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
        status === 'admitted' ? 'bg-brand-500/15' :
        status === 'rejected' ? 'bg-red-500/15' :
        'bg-orange-500/15'
      }`}>
        {status === 'admitted' ? <UserCheck size={28} className="text-brand-500" /> :
         status === 'rejected' ? <X size={28} className="text-red-400" /> :
         <Clock size={28} className="text-orange-400 animate-pulse" />}
      </div>

      <div>
        {status === 'waiting' || status === 'requesting' ? (
          <>
            <p className="font-semibold text-[var(--text-primary)]">Waiting for host approval</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">
              {hostName} will admit you shortly
            </p>
          </>
        ) : status === 'admitted' ? (
          <>
            <p className="font-semibold text-brand-500">Host admitted you!</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">Joining meeting…</p>
          </>
        ) : (
          <>
            <p className="font-semibold text-red-400">Host declined your request</p>
            <p className="text-sm text-[var(--text-secondary)] mt-1">You were not admitted to this meeting</p>
          </>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  Main MeetingRoom component
// ═══════════════════════════════════════════════════════
export default function MeetingRoom({ meetingCode, isHost = false, onStartCall, onClose }) {
  const { user, profile } = useAuth();
  const [meeting, setMeeting] = useState(null);
  const [loading, setLoading] = useState(true);
  const meetingId = meetingCode;

  useEffect(() => {
    if (!meetingId) return;

    // Host creates the meeting doc
    if (isHost) {
      setDoc(doc(db, 'meetings', meetingId), {
        code: meetingCode,
        name: `${profile?.name || 'My'}'s Meeting`,
        hostId: user.uid,
        hostName: profile?.name || 'Host',
        hostOnline: true,
        status: 'waiting',
        participants: { [user.uid]: { name: profile?.name || 'Host', joinedAt: serverTimestamp() } },
        createdAt: serverTimestamp(),
      }, { merge: true });
    }

    const unsub = onSnapshot(doc(db, 'meetings', meetingId), snap => {
      setMeeting(snap.exists() ? snap.data() : null);
      setLoading(false);
    });

    // Mark host online/offline
    if (isHost) {
      return () => {
        updateDoc(doc(db, 'meetings', meetingId), { hostOnline: false }).catch(() => {});
        unsub();
      };
    }
    return unsub;
  }, [meetingId, isHost, user?.uid]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-[var(--text-secondary)]">Loading meeting…</p>
        </div>
      </div>
    );
  }

  if (!meeting && !isHost) {
    return (
      <div className="flex items-center justify-center h-full p-6 text-center">
        <div>
          <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="font-semibold text-[var(--text-primary)]">Meeting not found</p>
          <p className="text-sm text-[var(--text-secondary)] mt-1">The room code may be invalid or the meeting has ended</p>
          <button onClick={onClose} className="mt-4 px-4 py-2 bg-brand-500 text-white rounded-xl text-sm font-semibold">
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[300] bg-[var(--sidebar-bg)] flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
        <button onClick={onClose} className="text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors">
          ← Back
        </button>
        <p className="text-sm font-semibold text-[var(--text-primary)]">Meeting Room</p>
        <div className="w-12" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isHost ? (
          <HostView meeting={meeting} meetingId={meetingId} onStartCall={onStartCall} />
        ) : (
          <ParticipantView
            meeting={meeting}
            meetingId={meetingId}
            uid={user?.uid}
            userName={profile?.name || 'Guest'}
          />
        )}
      </div>
    </div>
  );
}
