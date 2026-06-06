// ═══════════════════════════════════════════════════════
//  CallsTab — Premium calls experience
//  Tabs: Recents | Missed | Contacts | Join | Meeting
// ═══════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react';
import {
  Phone, Video, PhoneCall, PhoneMissed, PhoneIncoming,
  Search, Clock, Users, LogIn, Video as VideoIcon,
  Copy, Check, RefreshCw, X,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db } from '../../firebase';
import {
  collection, query, orderBy, limit, onSnapshot,
} from 'firebase/firestore';
import toast from 'react-hot-toast';
import MeetingRoom from './MeetingRoom';

// ── Helpers ───────────────────────────────────────────
function timeAgo(ts) {
  if (!ts) return '';
  const ms = ts?.seconds ? ts.seconds * 1000 : Number(ts);
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function genRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `FF-${part()}-${part()}`;
}

// ── Call log item ─────────────────────────────────────
function CallLogItem({ log, onCallBack }) {
  const isMissed   = log.status === 'missed';
  const isIncoming = log.direction === 'incoming';
  const Icon = isMissed ? PhoneMissed : isIncoming ? PhoneIncoming : PhoneCall;
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--hover)] transition-all">
      {log.avatar ? (
        <img src={log.avatar} className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold flex-shrink-0">
          {log.name?.[0]?.toUpperCase() || '?'}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className={`font-semibold text-sm truncate ${isMissed ? 'text-red-400' : 'text-[var(--text-primary)]'}`}>
          {log.name || 'Unknown'}
        </p>
        <div className="flex items-center gap-1 mt-0.5">
          <Icon size={11} className={isMissed ? 'text-red-400' : 'text-brand-500'} />
          <span className="text-[11px] text-[var(--text-secondary)]">
            {log.type === 'video' ? 'Video' : 'Voice'} · {timeAgo(log.timestamp)}
          </span>
          {log.duration && <span className="text-[11px] text-[var(--text-secondary)]">· {log.duration}</span>}
        </div>
      </div>
      <button
        onClick={() => onCallBack(log)}
        className="w-9 h-9 rounded-full bg-brand-500/10 hover:bg-brand-500/20 flex items-center justify-center transition-all flex-shrink-0"
      >
        {log.type === 'video' ? <Video size={15} className="text-brand-500" /> : <Phone size={15} className="text-brand-500" />}
      </button>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────
function EmptyState({ icon: Icon, title, sub, action, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center p-10 mt-8 gap-3 text-center">
      <div className="w-16 h-16 rounded-2xl bg-[var(--hover)] flex items-center justify-center mb-1">
        <Icon size={26} className="text-brand-500 opacity-60" />
      </div>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="text-xs text-[var(--text-secondary)] max-w-[200px] leading-relaxed">{sub}</p>
      {action && (
        <button onClick={onAction}
          className="mt-2 px-4 py-2 bg-brand-500/10 text-brand-500 text-xs font-semibold rounded-xl hover:bg-brand-500/20 transition-all flex items-center gap-1.5">
          <RefreshCw size={13} /> {action}
        </button>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════
//  Main CallsTab
// ═══════════════════════════════════════════════════════
export default function CallsTab({ contacts = [], onVoiceCall, onVideoCall }) {
  const { user } = useAuth();
  const [tab, setTab]         = useState('recents');
  const [search, setSearch]   = useState('');
  const [logs, setLogs]       = useState([]);
  const [roomCode, setRoomCode]       = useState('');
  const [joinCode, setJoinCode]       = useState('');
  const [copied, setCopied]           = useState(false);
  const [meetingRoom, setMeetingRoom] = useState(null); // { code, isHost }

  // ── Load call logs from Firestore ──────────────────────
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'users', user.uid, 'callLogs'),
      orderBy('timestamp', 'desc'),
      limit(50)
    );
    return onSnapshot(q, snap => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [user]);

  // ── Generate room code on mount ───────────────────────
  useEffect(() => { setRoomCode(genRoomCode()); }, []);

  const missedLogs   = logs.filter(l => l.status === 'missed');
  const filteredLogs = (tab === 'missed' ? missedLogs : logs)
    .filter(l => !search || l.name?.toLowerCase().includes(search.toLowerCase()));
  const filteredContacts = contacts.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase())
  );

  const handleCopyCode = () => {
    navigator.clipboard.writeText(roomCode)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => toast.error('Could not copy — please copy manually'));
  };

  const handleJoinMeeting = () => {
    const code = joinCode.trim().toUpperCase();
    if (!code) { toast.error('Enter a room code first'); return; }
    setMeetingRoom({ code, isHost: false });
  };

  const handleStartMeeting = () => {
    setMeetingRoom({ code: roomCode, isHost: true });
  };

  const TABS = [
    { id: 'recents',  label: 'Recents',  icon: Clock },
    { id: 'missed',   label: 'Missed',   icon: PhoneMissed },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'join',     label: 'Join',     icon: LogIn },
    { id: 'meeting',  label: 'Meeting',  icon: VideoIcon },
  ];

  return (
    <div className="flex flex-col h-full bg-[var(--sidebar-bg)]">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-3 border-b border-[var(--border)] flex-shrink-0">
        <h2 className="font-bold text-[18px] text-[var(--text-primary)] mb-3">Calls</h2>

        {/* Search — only on recents/missed/contacts tabs */}
        {(tab === 'recents' || tab === 'missed' || tab === 'contacts') && (
          <div className="flex items-center gap-2 bg-[var(--input-bg)] rounded-xl px-3 py-2">
            <Search size={14} className="text-[var(--text-secondary)] flex-shrink-0" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={tab === 'contacts' ? 'Search contacts…' : 'Search calls…'}
              className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none"
            />
            {search && <button onClick={() => setSearch('')}><X size={13} className="text-[var(--text-secondary)]" /></button>}
          </div>
        )}
      </div>

      {/* ── Sub-tabs ────────────────────────────────────── */}
      <div className="flex border-b border-[var(--border)] flex-shrink-0 overflow-x-auto no-scrollbar">
        {TABS.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSearch(''); }}
            className={`flex-shrink-0 flex flex-col items-center gap-0.5 px-4 py-2.5 text-[11px] font-semibold transition-all border-b-2 ${
              tab === t.id
                ? 'border-brand-500 text-brand-500'
                : 'border-transparent text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}>
            <t.icon size={17} />
            {t.label}
            {t.id === 'missed' && missedLogs.length > 0 && (
              <span className="absolute mt-0 ml-4 w-1.5 h-1.5 bg-red-400 rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* ── Content ─────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* RECENTS + MISSED */}
        {(tab === 'recents' || tab === 'missed') && (
          filteredLogs.length > 0 ? (
            <div>
              {filteredLogs.map(log => (
                <CallLogItem key={log.id} log={log}
                  onCallBack={l => l.type === 'video' ? onVideoCall?.(l) : onVoiceCall?.(l)} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={tab === 'missed' ? PhoneMissed : Clock}
              title={tab === 'missed' ? 'No missed calls' : 'No call history'}
              sub={tab === 'missed' ? 'Missed calls will appear here' : 'Start a call from Contacts or tap + to begin'}
              action="Refresh Logs"
              onAction={() => {}}
            />
          )
        )}

        {/* CONTACTS */}
        {tab === 'contacts' && (
          filteredContacts.length > 0 ? (
            <div>
              {filteredContacts.map(contact => (
                <div key={contact.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--hover)] transition-all">
                  {contact.avatar || contact.photoURL ? (
                    <img src={contact.avatar || contact.photoURL} className="w-11 h-11 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                      {contact.name?.[0]?.toUpperCase() || '?'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-[var(--text-primary)] truncate">{contact.name}</p>
                    <p className="text-xs text-[var(--text-secondary)] truncate">{contact.about || contact.phone || 'Family & Friends'}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => onVoiceCall?.(contact)}
                      className="w-9 h-9 rounded-full bg-brand-500/10 hover:bg-brand-500/20 flex items-center justify-center transition-all">
                      <Phone size={15} className="text-brand-500" />
                    </button>
                    <button onClick={() => onVideoCall?.(contact)}
                      className="w-9 h-9 rounded-full bg-blue-500/10 hover:bg-blue-500/20 flex items-center justify-center transition-all">
                      <Video size={15} className="text-blue-400" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Users} title="No contacts" sub="Add contacts to call them directly" />
          )
        )}

        {/* JOIN MEETING */}
        {tab === 'join' && (
          <div className="flex flex-col items-center justify-center p-6 mt-4 gap-6 max-w-sm mx-auto w-full">
            <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center">
              <LogIn size={26} className="text-blue-400" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-lg text-[var(--text-primary)]">Join with Link</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                Paste a shared Family & Friends room link or enter a secure room code
              </p>
            </div>
            <div className="w-full">
              <input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="Paste meeting link or enter code…"
                className="w-full bg-[var(--input-bg)] border border-[var(--border)] rounded-xl px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none focus:border-brand-500 transition-colors text-center tracking-wider font-mono"
              />
            </div>
            <button onClick={handleJoinMeeting}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
              <LogIn size={16} /> JOIN MEETING ROOM
            </button>
            <button onClick={() => setTab('meeting')}
              className="text-sm text-brand-500 hover:underline">
              Or create a new instant meeting
            </button>
            <div className="w-full bg-[var(--hover)] border border-[var(--border)] rounded-xl p-3 flex items-start gap-2">
              <Phone size={13} className="text-[var(--text-secondary)] flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                Family & Friends uses end-to-end encrypted WebRTC tunnels. Only users with the invite code can enter your room.
              </p>
            </div>
          </div>
        )}

        {/* CREATE MEETING */}
        {tab === 'meeting' && (
          <div className="flex flex-col items-center justify-center p-6 mt-4 gap-6 max-w-sm mx-auto w-full">
            <div className="w-16 h-16 rounded-2xl bg-brand-500/10 flex items-center justify-center">
              <VideoIcon size={26} className="text-brand-500" />
            </div>
            <div className="text-center">
              <h3 className="font-bold text-lg text-[var(--text-primary)]">Instant Meeting</h3>
              <p className="text-sm text-[var(--text-secondary)] mt-1 leading-relaxed">
                Generate a private video room and share the code with family or friends
              </p>
            </div>

            {/* Room code display */}
            <div className="w-full bg-[var(--hover)] border border-[var(--border)] rounded-2xl p-4">
              <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Secure Room Code</p>
              <div className="flex items-center justify-between gap-3">
                <p className="font-mono font-bold text-xl text-[var(--text-primary)] tracking-widest">{roomCode}</p>
                <button onClick={handleCopyCode}
                  className="flex items-center gap-1.5 px-3 py-2 bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-lg text-xs font-semibold text-[var(--text-primary)] hover:border-brand-500 transition-all">
                  {copied ? <><Check size={13} className="text-brand-500" /> Copied!</> : <><Copy size={13} /> Copy</>}
                </button>
              </div>
            </div>

            <button onClick={handleStartMeeting}
              className="w-full py-3 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
              <VideoIcon size={16} /> START VIDEO MEETING NOW
            </button>
            <button onClick={() => { setRoomCode(genRoomCode()); }}
              className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1 transition-all">
              <RefreshCw size={12} /> Generate new code
            </button>
            <button onClick={() => setTab('join')}
              className="text-sm text-brand-500 hover:underline">
              Or join an existing meeting
            </button>
            <div className="w-full bg-[var(--hover)] border border-[var(--border)] rounded-xl p-3 flex items-start gap-2">
              <Phone size={13} className="text-[var(--text-secondary)] flex-shrink-0 mt-0.5" />
              <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
                Family & Friends uses end-to-end encrypted WebRTC tunnels. Only users with the invite code can enter your room.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Meeting Room Overlay */}
      {meetingRoom && (
        <MeetingRoom
          meetingCode={meetingRoom.code}
          isHost={meetingRoom.isHost}
          onStartCall={() => {
            setMeetingRoom(null);
            onVideoCall?.({ id: meetingRoom.code, name: `Meeting ${meetingRoom.code}`, isMeeting: true, isHost: meetingRoom.isHost });
          }}
          onClose={() => setMeetingRoom(null)}
        />
      )}
    </div>
  );
}

export default CallsTab;
