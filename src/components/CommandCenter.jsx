// ═══════════════════════════════════════════════════════════════
//  Command Center — Real-time communication dashboard
//  Driven entirely by actual data. No AI-generated assumptions.
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback } from 'react';
import {
  Clock, CheckCircle2, MessageCircle, AlertCircle,
  Calendar, Handshake, BrainCircuit, Zap, Activity,
  ArrowRight, RefreshCw,
} from 'lucide-react';
import {
  db, auth,
} from '../firebase';
import {
  doc, onSnapshot, getDoc, collection, query,
  where, orderBy, limit, getDocs,
} from 'firebase/firestore';
import TasksDashboard from './CommandCenter/TasksDashboard';

// ── helpers ───────────────────────────────────────────────────
function toMs(ts) {
  if (!ts) return 0;
  if (ts.seconds) return ts.seconds * 1000;
  return Number(ts);
}

function relLabel(ms) {
  if (!ms) return '';
  const diff = Date.now() - ms;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmtTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (isToday) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// ── "While You Were Away" — computed purely from chats/groups props ──
function buildAwayUpdates(chats = [], groups = [], uid, lastSeenMs) {
  const cutoff = lastSeenMs || (Date.now() - 8 * 60 * 60 * 1000); // default 8h
  const updates = [];

  [...chats, ...groups].forEach(chat => {
    const lm = chat.lastMessage;
    if (!lm) return;
    if (lm.senderId === uid) return; // I sent it
    const msgMs = toMs(lm.timestamp);
    if (msgMs < cutoff) return; // before I was last active
    const unread = chat.unread?.[uid] || 0;
    if (unread === 0) return; // already read

    updates.push({
      id: chat.id,
      isGroup: !!chat.members,
      name: chat.name || lm.senderName || 'Contact',
      preview: (lm.content || lm.text || '').slice(0, 90),
      senderName: lm.senderName || '',
      unread,
      ts: msgMs,
    });
  });

  return updates.sort((a, b) => b.ts - a.ts);
}

// ── "Waiting For Reply" — I sent last, they haven't replied ──
// Detected from chats where lastMessage.senderId === uid
function buildWaitingForMe(chats = [], groups = [], uid) {
  const waiting = [];
  [...chats, ...groups].forEach(chat => {
    const lm = chat.lastMessage;
    if (!lm) return;
    if (lm.senderId !== uid) return; // they replied last, not waiting
    const msgMs = toMs(lm.timestamp);
    const ageMs = Date.now() - msgMs;
    if (ageMs < 5 * 60 * 1000) return; // less than 5 min, too soon
    waiting.push({
      id: chat.id,
      isGroup: !!chat.members,
      name: chat.name || 'Contact',
      preview: (lm.content || lm.text || '').slice(0, 60),
      ts: msgMs,
      age: relLabel(msgMs),
    });
  });
  return waiting.sort((a, b) => a.ts - b.ts); // oldest first
}

// ═══════════════════════════════════════════════════════════════
//  Component
// ═══════════════════════════════════════════════════════════════
export default function CommandCenter({ chats, groups, user, onSelectChat, onSelectGroup }) {
  const uid = user?.uid;

  // Real-time command center doc (commitments, decisions, waitingFor, timeline)
  const [ccData, setCcData]       = useState(null);
  const [ccLoading, setCcLoading] = useState(true);

  // User's lastSeen from Firestore (for "while you were away")
  const [lastSeenMs, setLastSeenMs] = useState(null);

  // Derived from props (fully local, no Firestore needed)
  const [awayUpdates, setAwayUpdates] = useState([]);
  const [waitingForMe, setWaitingForMe] = useState([]);

  // ── subscribe to commandCenter doc ──────────────────────────
  useEffect(() => {
    if (!uid) return;
    const ref = doc(db, 'users', uid, 'commandCenter', 'data');
    const unsub = onSnapshot(ref, snap => {
      setCcData(snap.exists() ? snap.data() : {});
      setCcLoading(false);
    });
    return unsub;
  }, [uid]);

  // ── fetch user's lastSeen once ────────────────────────────────
  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, 'users', uid)).then(snap => {
      if (snap.exists()) {
        const ls = snap.data().lastSeen;
        setLastSeenMs(toMs(ls));
      }
    }).catch(() => {});
  }, [uid]);

  // ── recompute derived sections when props change ──────────────
  useEffect(() => {
    setAwayUpdates(buildAwayUpdates(chats, groups, uid, lastSeenMs));
    setWaitingForMe(buildWaitingForMe(chats, groups, uid));
  }, [chats, groups, uid, lastSeenMs]);

  // ── unread count (from props, real-time) ──────────────────────
  const unreadCount = [...(chats || []), ...(groups || [])]
    .reduce((acc, c) => acc + (c.unread?.[uid] || 0), 0);

  // ── unanswered questions from ccData.waitingFor ───────────────
  // These are set by useIntelligenceEngine when it detects a
  // question was asked and user never replied
  const unansweredQs = ccData?.waitingFor || [];

  // ── navigation helper — robust, never fails silently ──────────
  const openChat = useCallback(async (id, isGroup) => {
    if (!id) return;
    if (isGroup) {
      const g = (groups || []).find(g => g.id === id);
      if (g) { onSelectGroup(g); return; }
      // Group not in list yet — fetch it
      try {
        const snap = await getDoc(doc(db, 'groups', id));
        if (snap.exists()) onSelectGroup({ id: snap.id, ...snap.data() });
      } catch {}
    } else {
      const c = (chats || []).find(c => c.id === id);
      if (c) { onSelectChat(c); return; }
      // Chat not in list yet — fetch it
      try {
        const snap = await getDoc(doc(db, 'chats', id));
        if (snap.exists()) onSelectChat({ id: snap.id, ...snap.data() });
      } catch {}
    }
  }, [chats, groups, onSelectChat, onSelectGroup]);

  // ── loading ───────────────────────────────────────────────────
  if (ccLoading) {
    return (
      <div className="p-8 flex flex-col items-center justify-center animate-fade-in text-center mt-10">
        <Zap className="animate-pulse text-brand-500 mb-4" size={32} />
        <h3 className="font-semibold text-[var(--text-primary)]">Loading Command Center</h3>
        <p className="text-sm text-[var(--text-secondary)] mt-2">Reading your messages…</p>
      </div>
    );
  }

  return (
    <div className="p-5 animate-slide-up pb-24 overflow-y-auto h-full space-y-6">

      {/* ── KPI CARDS ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard icon={<MessageCircle size={20} className="text-brand-500" />}
          value={unreadCount} label="Unread" />
        <KpiCard icon={<Clock size={20} className="text-orange-500" />}
          value={waitingForMe.length} label="Sent, No Reply" />
        <KpiCard icon={<CheckCircle2 size={20} className="text-blue-500" />}
          value={ccData?.commitments?.length || 0} label="Commitments" />
        <KpiCard icon={<AlertCircle size={20} className="text-red-500" />}
          value={unansweredQs.length} label="Need Reply" />
      </div>

      {/* ── WHILE YOU WERE AWAY ────────────────────────────────── */}
      <Section icon={<Activity size={16} className="text-brand-500" />} title="While You Were Away">
        {awayUpdates.length > 0 ? (
          <div className="space-y-2">
            {awayUpdates.map(u => (
              <button key={u.id}
                onClick={() => openChat(u.id, u.isGroup)}
                className="w-full text-left bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-xl p-4 shadow-sm hover:border-brand-400 transition-all group">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-[var(--text-primary)]">
                    {u.isGroup ? '👥 ' : '💬 '}{u.name}
                  </span>
                  <span className="text-[10px] text-[var(--text-secondary)]">{relLabel(u.ts)}</span>
                </div>
                {u.isGroup && u.senderName && (
                  <p className="text-[11px] text-brand-500 mb-0.5">{u.senderName}</p>
                )}
                <p className="text-sm text-[var(--text-secondary)] truncate">{u.preview}</p>
                {u.unread > 1 && (
                  <span className="mt-1.5 inline-block text-[10px] font-semibold bg-brand-500/10 text-brand-500 px-2 py-0.5 rounded-full">
                    +{u.unread} messages
                  </span>
                )}
              </button>
            ))}
          </div>
        ) : (
          <EmptyCard text="You're all caught up. No new messages since you were last active." />
        )}
      </Section>

      {/* ── WAITING FOR REPLY (unanswered questions) ───────────── */}
      <Section icon={<Clock size={16} className="text-orange-500" />} title="Need Your Reply">
        {unansweredQs.length > 0 ? (
          <div className="space-y-2">
            {unansweredQs.map((w, i) => (
              <button key={w.msgId || i}
                onClick={() => openChat(w.chatId, w.chatType === 'group')}
                className="w-full text-left bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-xl p-4 shadow-sm hover:border-orange-400 transition-all">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm text-[var(--text-primary)]">{w.senderName}</span>
                  <span className="text-[10px] text-[var(--text-secondary)]">{relLabel(w.ts)}</span>
                </div>
                <p className="text-sm text-orange-400/90 truncate">❓ {w.text}</p>
                <p className="text-[10px] text-[var(--text-secondary)] mt-1">in {w.source}</p>
              </button>
            ))}
          </div>
        ) : (
          <EmptyCard text="No unanswered questions detected." />
        )}
      </Section>

      {/* ── SENT, WAITING FOR THEIR REPLY ──────────────────────── */}
      {waitingForMe.length > 0 && (
        <Section icon={<ArrowRight size={16} className="text-blue-400" />} title="Sent — Awaiting Response">
          <div className="space-y-2">
            {waitingForMe.map(w => (
              <button key={w.id}
                onClick={() => openChat(w.id, w.isGroup)}
                className="w-full text-left bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-xl p-3 shadow-sm hover:border-blue-400 transition-all">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm text-[var(--text-primary)]">
                    {w.isGroup ? '👥 ' : '💬 '}{w.name}
                  </span>
                  <span className="text-[10px] text-[var(--text-secondary)]">{w.age}</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">{w.preview}</p>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* ── ACTION ITEMS / TASKS ────────────────────────────────── */}
      <section>
        <TasksDashboard onOpenChat={(chatId, type) => openChat(chatId, type === 'group')} />
      </section>

      {/* ── COMMITMENTS ─────────────────────────────────────────── */}
      <Section icon={<Handshake size={16} className="text-orange-500" />} title="Commitments Made">
        {ccData?.commitments?.length > 0 ? (
          <div className="space-y-2">
            {ccData.commitments.map((w) => (
              <button key={w.id}
                onClick={() => w.chatId && openChat(w.chatId, w.chatType === 'group')}
                className={`w-full text-left bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-xl p-3 shadow-sm transition-all ${w.chatId ? 'hover:border-orange-400 cursor-pointer' : 'cursor-default'}`}>
                <p className="font-medium text-sm text-[var(--text-primary)]">{w.msg}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">{w.source}</p>
                  <div className="flex items-center gap-2">
                    {w.ts && <p className="text-[10px] text-[var(--text-secondary)]">{fmtTime(w.ts)}</p>}
                    {w.chatId && <p className="text-[10px] text-brand-500">Open →</p>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyCard text="No commitments detected yet. They appear when someone says 'I'll do X' or 'I will send Y'." />
        )}
      </Section>

      {/* ── KEY DECISIONS ───────────────────────────────────────── */}
      <Section icon={<BrainCircuit size={16} className="text-blue-500" />} title="Key Decisions">
        {ccData?.decisions?.length > 0 ? (
          <div className="space-y-2">
            {ccData.decisions.map((w) => (
              <button key={w.id}
                onClick={() => w.chatId && openChat(w.chatId, w.chatType === 'group')}
                className={`w-full text-left bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-xl p-3 shadow-sm transition-all ${w.chatId ? 'hover:border-blue-400 cursor-pointer' : 'cursor-default'}`}>
                <p className="font-medium text-sm text-[var(--text-primary)]">{w.msg}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className="text-[10px] text-[var(--text-secondary)] uppercase tracking-wider">in {w.source}</p>
                  <div className="flex items-center gap-2">
                    {w.ts && <p className="text-[10px] text-[var(--text-secondary)]">{fmtTime(w.ts)}</p>}
                    {w.chatId && <p className="text-[10px] text-brand-500">Open →</p>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <EmptyCard text="No decisions recorded yet. They appear when someone says 'we decided' or 'confirmed'." />
        )}
      </Section>

      {/* ── TIMELINE ────────────────────────────────────────────── */}
      <Section icon={<Calendar size={16} className="text-[var(--text-secondary)]" />} title="Timeline">
        {ccData?.timeline?.length > 0 ? (
          <div className="relative border-l-2 border-[var(--border)] ml-3 pl-4 space-y-4">
            {ccData.timeline.map((event) => (
              <button key={event.id || `${event.chatId}-${event.ts}`}
                onClick={() => event.chatId && openChat(event.chatId, event.chatType === 'group')}
                className={`w-full text-left relative ${event.chatId ? 'cursor-pointer' : 'cursor-default'}`}>
                <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-brand-500 ring-4 ring-[var(--sidebar-bg)]" />
                <p className="text-[10px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                  {fmtTime(event.ts)} · {event.source}
                </p>
                <p className="text-sm text-[var(--text-primary)] mt-0.5">{event.description}</p>
              </button>
            ))}
          </div>
        ) : (
          <EmptyCard text="Timeline builds automatically as important events are detected in your conversations." />
        )}
      </Section>

    </div>
  );
}

// ── sub-components ────────────────────────────────────────────

function KpiCard({ icon, value, label }) {
  return (
    <div className="bg-[var(--sidebar-bg)] border border-[var(--border)] p-3 rounded-2xl shadow-sm text-center">
      <div className="flex justify-center mb-1.5 opacity-80">{icon}</div>
      <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
      <p className="text-[11px] font-medium text-[var(--text-secondary)] uppercase tracking-wider">{label}</p>
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="font-semibold text-sm text-[var(--text-primary)] uppercase tracking-widest">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function EmptyCard({ text }) {
  return (
    <p className="text-sm text-[var(--text-secondary)] bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-xl p-4">
      {text}
    </p>
  );
}
