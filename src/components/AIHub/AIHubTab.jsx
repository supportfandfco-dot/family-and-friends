// ═══════════════════════════════════════════════════════════════
//  AIHubTab — Agent Mode management UI
//  4 global modes + per-contact overrides + quiet hours + logs
// ═══════════════════════════════════════════════════════════════
import React, { useState, useEffect, useCallback } from 'react';
import {
  db, auth, sendMessage, getUserById,
} from '../../firebase';
import {
  collection, query, orderBy, onSnapshot,
  doc, updateDoc, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '../../contexts/AuthContext';
import {
  Bot, Check, X, ShieldAlert, Save, ChevronDown,
  Clock, User, Zap, Shield, Ban, Users,
} from 'lucide-react';
import toast from 'react-hot-toast';

// ── Mode definitions ─────────────────────────────────────────
const GLOBAL_MODES = [
  {
    id: 'disabled',
    label: 'Disabled',
    sub: 'Agent is completely off',
    icon: Ban,
    color: 'text-[var(--text-secondary)]',
    bg: 'bg-[var(--hover)]',
    border: 'border-[var(--border)]',
  },
  {
    id: 'approval',
    label: 'Approval Required',
    sub: 'Agent proposes replies, you approve each one',
    icon: Shield,
    color: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
  },
  {
    id: 'trusted_auto',
    label: 'Trusted Contacts',
    sub: 'Auto-reply to contacts you mark as Auto, approval for the rest',
    icon: Users,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
  },
  {
    id: 'full_auto',
    label: 'Full Auto Pilot',
    sub: 'Auto-reply to everyone unless a contact is set to Disabled',
    icon: Zap,
    color: 'text-brand-500',
    bg: 'bg-brand-500/10',
    border: 'border-brand-500/30',
  },
];

const CONTACT_OVERRIDES = [
  { id: 'inherit', label: 'Inherit', sub: 'Follow global mode' },
  { id: 'auto',    label: 'Auto',    sub: 'Always auto-reply' },
  { id: 'approval',label: 'Approval',sub: 'Always require approval' },
  { id: 'disabled',label: 'Off',     sub: 'Never reply' },
];

const OVERRIDE_COLORS = {
  inherit:  'bg-[var(--hover)] text-[var(--text-secondary)] border-[var(--border)]',
  auto:     'bg-brand-500/10 text-brand-500 border-brand-500/30',
  approval: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  disabled: 'bg-red-500/10 text-red-400 border-red-500/30',
};

const LOG_STATUS_STYLE = {
  pending:    'bg-orange-500/10 text-orange-400',
  auto_sent:  'bg-brand-500/10 text-brand-500',
  approved:   'bg-green-500/10 text-green-500',
  rejected:   'bg-red-500/10 text-red-400',
};

// ── Component ─────────────────────────────────────────────────
export default function AIHubTab() {
  const { profile, updateProfile, user } = useAuth();

  // Settings state
  const [agentMode, setAgentMode]             = useState('disabled');
  const [rules, setRules]                     = useState('');
  const [quietHours, setQuietHours]           = useState({ enabled: false, start: '22:00', end: '07:00' });
  const [contactSettings, setContactSettings] = useState({});
  const [saving, setSaving]                   = useState(false);

  // UI state
  const [tab, setTab]             = useState('config');  // config | contacts | logs
  const [contacts, setContacts]   = useState([]);
  const [logs, setLogs]           = useState([]);
  const [expandedLog, setExpanded]= useState(null);

  // ── Load profile settings ────────────────────────────────────
  useEffect(() => {
    if (!profile) return;
    // Support legacy autoPilotEnabled boolean
    const mode = profile.agentMode ||
      (profile.autoPilotEnabled ? 'approval' : 'disabled');
    setAgentMode(mode);
    setRules(profile.autoPilotRules || '');
    setQuietHours(profile.agentQuietHours || { enabled: false, start: '22:00', end: '07:00' });
    setContactSettings(profile.agentContactSettings || {});
  }, [profile]);

  // ── Load contacts ────────────────────────────────────────────
  useEffect(() => {
    if (!profile?.contacts?.length) { setContacts([]); return; }
    Promise.all(profile.contacts.map(id => getUserById(id)))
      .then(list => setContacts(list.filter(Boolean)));
  }, [profile?.contacts]);

  // ── Subscribe to agent logs ──────────────────────────────────
  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'users', auth.currentUser.uid, 'agentLogs'),
      orderBy('timestamp', 'desc')
    );
    return onSnapshot(q, snap => setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
  }, []);

  // ── Save all settings ────────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    try {
      await updateProfile({
        agentMode,
        autoPilotEnabled: agentMode !== 'disabled',  // backward compat
        autoPilotRules: rules,
        agentQuietHours: quietHours,
        agentContactSettings: contactSettings,
      });
      toast.success('Agent settings saved');
    } catch {
      toast.error('Failed to save settings');
    }
    setSaving(false);
  };

  // ── Per-contact override ─────────────────────────────────────
  const setContactOverride = (contactId, value) => {
    setContactSettings(prev => ({ ...prev, [contactId]: value }));
  };

  // ── Approve pending log ──────────────────────────────────────
  const handleApprove = async (log) => {
    try {
      await sendMessage(log.chatId, log.senderId, log.replyText, 'text');
      await updateDoc(doc(db, 'users', user.uid, 'agentLogs', log.id), {
        status: 'approved',
        approvedAt: serverTimestamp(),
      });
      toast.success('Reply sent');
    } catch {
      toast.error('Failed to send reply');
    }
  };

  const handleReject = async (id) => {
    try {
      await updateDoc(doc(db, 'users', user.uid, 'agentLogs', id), {
        status: 'rejected',
      });
    } catch {
      toast.error('Failed to reject');
    }
  };

  const pendingCount = logs.filter(l => l.status === 'pending').length;
  const currentMode  = GLOBAL_MODES.find(m => m.id === agentMode) || GLOBAL_MODES[0];

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="px-4 pt-5 pb-3 border-b border-[var(--border)]">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center ${currentMode.bg}`}>
            <currentMode.icon size={20} className={currentMode.color} />
          </div>
          <div>
            <h2 className="font-bold text-[var(--text-primary)]">Agent Mode</h2>
            <p className="text-xs text-[var(--text-secondary)]">{currentMode.sub}</p>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-[var(--hover)] p-1 rounded-xl">
          {[
            { id: 'config',   label: 'Configure' },
            { id: 'contacts', label: `Contacts (${contacts.length})` },
            { id: 'logs',     label: `Logs${pendingCount ? ` · ${pendingCount}` : ''}` },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                tab === t.id
                  ? 'bg-[var(--sidebar-bg)] text-[var(--text-primary)] shadow-sm'
                  : 'text-[var(--text-secondary)]'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab Content ────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto pb-24">

        {/* ╔══ CONFIG TAB ══╗ */}
        {tab === 'config' && (
          <div className="p-4 space-y-5 animate-fade-in">

            {/* Global mode selector */}
            <section>
              <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2">Global Mode</p>
              <div className="space-y-2">
                {GLOBAL_MODES.map(m => (
                  <button key={m.id} onClick={() => setAgentMode(m.id)}
                    className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                      agentMode === m.id
                        ? `${m.bg} ${m.border}`
                        : 'bg-[var(--sidebar-bg)] border-[var(--border)] hover:border-brand-400'
                    }`}>
                    <m.icon size={18} className={agentMode === m.id ? m.color : 'text-[var(--text-secondary)]'} />
                    <div className="flex-1">
                      <p className={`text-sm font-semibold ${agentMode === m.id ? m.color : 'text-[var(--text-primary)]'}`}>
                        {m.label}
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)]">{m.sub}</p>
                    </div>
                    {agentMode === m.id && <Check size={16} className={m.color} />}
                  </button>
                ))}
              </div>
            </section>

            {/* Rules textarea */}
            {agentMode !== 'disabled' && (
              <section>
                <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-1">Automation Rules</p>
                <p className="text-[11px] text-[var(--text-secondary)] mb-2">
                  Write plain-English rules. Example: "If Mom asks where I am, reply I'm on my way." "If anyone messages after 10pm, say I'll respond in the morning."
                </p>
                <textarea
                  value={rules}
                  onChange={e => setRules(e.target.value)}
                  rows={5}
                  className="w-full bg-[var(--hover)] border border-[var(--border)] rounded-xl p-3 text-[var(--text-primary)] text-sm resize-none focus:outline-none focus:border-brand-500 transition-colors"
                  placeholder={"If Mom asks where I am → reply I'm on my way\nIf Rahul messages → say I'll call back soon\nFor work messages → ask to email instead"}
                />
              </section>
            )}

            {/* Quiet hours */}
            {agentMode !== 'disabled' && (
              <section>
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">Quiet Hours</p>
                    <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                      Auto-replies become approval-only during this window
                    </p>
                  </div>
                  <button
                    onClick={() => setQuietHours(q => ({ ...q, enabled: !q.enabled }))}
                    className={`w-10 h-5 rounded-full p-0.5 transition-colors flex-shrink-0 ${
                      quietHours.enabled ? 'bg-brand-500' : 'bg-[var(--border)]'
                    }`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${
                      quietHours.enabled ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
                {quietHours.enabled && (
                  <div className="flex gap-3 mt-2">
                    {[['start', 'From'], ['end', 'Until']].map(([key, label]) => (
                      <div key={key} className="flex-1">
                        <p className="text-[10px] text-[var(--text-secondary)] mb-1">{label}</p>
                        <input
                          type="time"
                          value={quietHours[key]}
                          onChange={e => setQuietHours(q => ({ ...q, [key]: e.target.value }))}
                          className="w-full bg-[var(--hover)] border border-[var(--border)] rounded-lg px-3 py-2 text-[var(--text-primary)] text-sm focus:outline-none focus:border-brand-500"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* Save button */}
            <button onClick={handleSave} disabled={saving}
              className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2">
              <Save size={15} />
              {saving ? 'Saving…' : 'Save Agent Settings'}
            </button>
          </div>
        )}

        {/* ╔══ CONTACTS TAB ══╗ */}
        {tab === 'contacts' && (
          <div className="p-4 space-y-3 animate-fade-in">
            <p className="text-[11px] text-[var(--text-secondary)] leading-relaxed">
              Override the global mode for individual contacts. Changes take effect immediately after saving.
            </p>

            {contacts.length === 0 && (
              <div className="text-center py-12 text-[var(--text-secondary)]">
                <Users size={28} className="mx-auto mb-2 opacity-40" />
                <p className="text-sm">No contacts yet</p>
              </div>
            )}

            {contacts.map(contact => {
              const override = contactSettings[contact.id] || 'inherit';
              return (
                <div key={contact.id}
                  className="bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-xl p-3 shadow-sm">
                  <div className="flex items-center gap-2.5 mb-2.5">
                    {contact.photoURL
                      ? <img src={contact.photoURL} className="w-8 h-8 rounded-full object-cover" />
                      : <div className="w-8 h-8 rounded-full bg-brand-500 flex items-center justify-center text-white text-sm font-bold">
                          {contact.name?.[0]?.toUpperCase()}
                        </div>
                    }
                    <div>
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{contact.name}</p>
                      <p className="text-[10px] text-[var(--text-secondary)]">{contact.phone || contact.email || ''}</p>
                    </div>
                  </div>
                  <div className="flex gap-1.5 flex-wrap">
                    {CONTACT_OVERRIDES.map(opt => (
                      <button key={opt.id}
                        onClick={() => setContactOverride(contact.id, opt.id)}
                        className={`px-3 py-1 rounded-lg text-[11px] font-semibold border transition-all ${
                          override === opt.id
                            ? OVERRIDE_COLORS[opt.id]
                            : 'bg-[var(--hover)] text-[var(--text-secondary)] border-[var(--border)]'
                        }`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {contacts.length > 0 && (
              <button onClick={handleSave} disabled={saving}
                className="w-full py-2.5 bg-brand-500 hover:bg-brand-600 disabled:opacity-60 text-white rounded-xl text-sm font-semibold transition-colors flex items-center justify-center gap-2 mt-4">
                <Save size={15} />
                {saving ? 'Saving…' : 'Save Contact Settings'}
              </button>
            )}
          </div>
        )}

        {/* ╔══ LOGS TAB ══╗ */}
        {tab === 'logs' && (
          <div className="p-4 space-y-3 animate-fade-in">

            {/* Pending approval banner */}
            {pendingCount > 0 && (
              <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-3 flex items-center gap-2">
                <ShieldAlert size={16} className="text-orange-400 flex-shrink-0" />
                <p className="text-xs text-orange-400 font-semibold">
                  {pendingCount} reply{pendingCount > 1 ? 's' : ''} waiting for your approval
                </p>
              </div>
            )}

            {logs.length === 0 && (
              <div className="text-center py-12 border border-[var(--border)] rounded-2xl bg-[var(--sidebar-bg)]">
                <Bot size={24} className="mx-auto text-[var(--text-secondary)] mb-2 opacity-40" />
                <p className="text-sm font-medium text-[var(--text-primary)]">No actions logged</p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">Agent hasn't processed any messages yet</p>
              </div>
            )}

            {logs.map(log => {
              const isExpanded = expandedLog === log.id;
              return (
                <div key={log.id}
                  className={`bg-[var(--sidebar-bg)] border rounded-xl shadow-sm transition-all ${
                    log.status === 'pending' ? 'border-orange-500/40' : 'border-[var(--border)]'
                  } ${log.status !== 'pending' && log.status !== 'auto_sent' ? 'opacity-60' : ''}`}>

                  {/* Log header — always visible */}
                  <button className="w-full flex items-center justify-between p-3 text-left"
                    onClick={() => setExpanded(isExpanded ? null : log.id)}>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-[var(--hover)] flex items-center justify-center flex-shrink-0">
                        <Bot size={14} className="text-[var(--text-secondary)]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {log.chatName || log.senderName || 'Unknown'}
                        </p>
                        <p className="text-[10px] text-[var(--text-secondary)] truncate">{log.reason}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                      {log.quiet && <Clock size={11} className="text-orange-400" title="Quiet hours" />}
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${LOG_STATUS_STYLE[log.status] || 'bg-[var(--hover)] text-[var(--text-secondary)]'}`}>
                        {log.status === 'auto_sent' ? 'auto' : log.status}
                      </span>
                      <ChevronDown size={14} className={`text-[var(--text-secondary)] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2 border-t border-[var(--border)]">
                      <div className="pt-2">
                        <p className="text-[10px] text-[var(--text-secondary)] mb-1">Trigger message:</p>
                        <p className="text-xs text-[var(--text-primary)] bg-[var(--hover)] rounded-lg p-2">
                          "{log.triggerMsg}"
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] text-[var(--text-secondary)] mb-1">
                          {log.status === 'auto_sent' ? 'Sent reply:' : 'Proposed reply:'}
                        </p>
                        <p className="text-xs text-[var(--text-primary)] bg-[var(--hover)] rounded-lg p-2">
                          "{log.replyText}"
                        </p>
                      </div>
                      {log.quiet && (
                        <p className="text-[10px] text-orange-400 flex items-center gap-1">
                          <Clock size={10} /> Sent during quiet hours — queued for approval
                        </p>
                      )}
                      {log.status === 'pending' && (
                        <div className="flex gap-2 pt-1">
                          <button onClick={() => handleApprove(log)}
                            className="flex-1 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-lg flex justify-center items-center gap-1.5 text-xs font-semibold transition-colors">
                            <Check size={13} /> Approve & Send
                          </button>
                          <button onClick={() => handleReject(log.id)}
                            className="flex-1 py-2 bg-[var(--hover)] border border-[var(--border)] text-[var(--text-primary)] rounded-lg flex justify-center items-center gap-1.5 text-xs font-semibold transition-colors">
                            <X size={13} /> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
