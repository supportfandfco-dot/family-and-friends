// ═══════════════════════════════════════════════════════
//  ChatList — WhatsApp-style layout
//  Bottom nav: Chats | Moments | Command | Agent | Calls
//  Chat tab sub-tabs: All | Unread | Groups
//  Long-press context menu: Archive / Unarchive
// ═══════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  db, subscribeToChats, subscribeToGroups, getUserById,
  subscribeToPresence,
} from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { format, isToday, isYesterday } from 'date-fns';
import {
  Search, Plus, Settings, MessageCircle, Users, Phone,
  Star, User, Sparkles, Zap, ListTodo, Bot, Archive,
  ArchiveRestore, BellOff, Trash2, X,
} from 'lucide-react';
import AddContact from '../Contacts/AddContact';
import StatusTab from '../Status/StatusTab';
import TasksTab from '../Tasks/TasksTab';
import { CreateGroupModal } from '../Groups/GroupChat';
import CommandCenter from '../CommandCenter';
import AIHubTab from '../AIHub/AIHubTab';
import { Bot as BotIcon } from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────
const LOGO = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHJ4PSIxMiIgZmlsbD0iIzIyYzU1ZSIvPjxwYXRoIGQ9Ik0yMCAxMEMxNC40NzcgMTAgMTAgMTQuNDc3IDEwIDIwQzEwIDIxLjg5NiAxMC41MTIgMjMuNjcgMTEuNDA2IDI1LjE5NEw5LjUgMzFMMTUuNDcgMjkuMTI0QzE2LjkzNSAyOS45MTggMTguNjEyIDMwLjM3NSAyMC40MDYgMzAuMzc1QzI1LjkyOSAzMC4zNzUgMzAuNDA2IDI1Ljg5OCAzMC40MDYgMjAuMzc1QzMwLjQwNiAxNC44NTIgMjUuNTIzIDEwIDIwIDEwWiIgZmlsbD0id2hpdGUiLz48L3N2Zz4=';

function formatLastTime(ts) {
  if (!ts) return '';
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (isToday(date)) return format(date, 'HH:mm');
  if (isYesterday(date)) return 'Yesterday';
  return format(date, 'dd/MM/yy');
}

function getLastMsgPreview(msg, currentUid) {
  if (!msg) return 'Tap to start chatting';
  const prefix = msg.senderId === currentUid ? 'You: ' : '';
  switch (msg.type) {
    case 'image': return `${prefix}📷 Photo`;
    case 'voice': return `${prefix}🎙️ Voice note`;
    case 'file':  return `${prefix}📄 ${msg.fileName || 'File'}`;
    default:      return prefix + (msg.content || '');
  }
}

// ── Archive helpers ───────────────────────────────────────
async function setArchived(id, isGroup, archived) {
  const col = isGroup ? 'groups' : 'chats';
  await updateDoc(doc(db, col, id), { archived });
}

// ── Long-press hook ───────────────────────────────────────
function useLongPress(onLongPress, ms = 500) {
  const timer = useRef(null);
  const start = useCallback((e) => {
    // Don't block scroll
    timer.current = setTimeout(() => { onLongPress(e); }, ms);
  }, [onLongPress, ms]);
  const cancel = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return { onPointerDown: start, onPointerUp: cancel, onPointerLeave: cancel };
}

// ── Context menu component ────────────────────────────────
function ContextMenu({ x, y, item, onClose, onArchive }) {
  const isArchived = item?.archived;
  return (
    <div className="fixed inset-0 z-50" onClick={onClose}>
      <div
        className="absolute bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-2xl shadow-2xl py-1.5 w-48 overflow-hidden"
        style={{ left: Math.min(x, window.innerWidth - 200), top: Math.min(y, window.innerHeight - 120) }}
        onClick={e => e.stopPropagation()}
      >
        <button
          onClick={() => { onArchive(!isArchived); onClose(); }}
          className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-[var(--text-primary)] hover:bg-[var(--hover)] transition-colors"
        >
          {isArchived
            ? <><ArchiveRestore size={16} className="text-brand-500" /> Unarchive</>
            : <><Archive size={16} className="text-brand-500" /> Archive</>
          }
        </button>
      </div>
    </div>
  );
}

// ── Chat row ──────────────────────────────────────────────
function ChatRow({ chat, partner, isActive, uid, online, onSelect, onLongPress }) {
  const lp = useLongPress(onLongPress);
  const unread = chat.unread?.[uid] || 0;
  return (
    <button
      {...lp}
      onClick={() => onSelect(partner, chat.id)}
      className="w-full flex items-center gap-3 px-4 py-3 transition-all active:scale-[0.98] touch-none"
      style={{
        background: isActive ? 'var(--hover)' : 'transparent',
        borderLeft: isActive ? '3px solid #22c55e' : '3px solid transparent',
      }}
    >
      <div className="relative flex-shrink-0">
        {partner?.avatar ? (
          <img src={partner.avatar} alt="" className="w-12 h-12 rounded-full object-cover" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center text-white font-bold text-lg">
            {partner?.name?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        {online && (
          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-brand-400 border-2 border-[var(--sidebar-bg)]" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className={`font-semibold truncate ${unread ? 'text-[var(--text-primary)]' : 'text-[var(--text-primary)]'}`}>
            {partner?.name || 'Loading...'}
          </span>
          <span className={`text-[11px] ml-2 flex-shrink-0 ${unread ? 'text-brand-500 font-semibold' : 'text-[var(--text-secondary)]'}`}>
            {formatLastTime(chat.lastMessage?.timestamp)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <span className="text-[13px] text-[var(--text-secondary)] truncate">
            {getLastMsgPreview(chat.lastMessage, uid)}
          </span>
          {unread > 0 && (
            <span className="ml-2 flex-shrink-0 min-w-[20px] h-5 bg-brand-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center px-1.5">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ── Group row ─────────────────────────────────────────────
function GroupRow({ group, isActive, uid, onSelect, onLongPress }) {
  const lp = useLongPress(onLongPress);
  const unread = group.unread?.[uid] || 0;
  return (
    <button
      {...lp}
      onClick={() => onSelect(group)}
      className="w-full flex items-center gap-3 px-4 py-3 transition-all active:scale-[0.98] touch-none"
      style={{
        background: isActive ? 'var(--hover)' : 'transparent',
        borderLeft: isActive ? '3px solid #22c55e' : '3px solid transparent',
      }}
    >
      {group.photoURL ? (
        <img src={group.photoURL} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
      ) : (
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center flex-shrink-0">
          <Users size={20} className="text-white" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-[var(--text-primary)] truncate">{group.name}</span>
          <span className={`text-[11px] ml-2 flex-shrink-0 ${unread ? 'text-brand-500 font-semibold' : 'text-[var(--text-secondary)]'}`}>
            {formatLastTime(group.lastMessage?.timestamp)}
          </span>
        </div>
        <div className="flex items-center justify-between mt-0.5">
          <p className="text-[13px] text-[var(--text-secondary)] truncate">
            {group.lastMessage ? getLastMsgPreview(group.lastMessage, uid) : `${group.members?.length || 0} members`}
          </p>
          {unread > 0 && (
            <span className="ml-2 flex-shrink-0 min-w-[20px] h-5 bg-brand-500 text-white text-[11px] font-bold rounded-full flex items-center justify-center px-1.5">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

// ═══════════════════════════════════════════════════════
//  Main component
// ═══════════════════════════════════════════════════════
export default function ChatList({ onSelectChat, onSelectGroup, onOpenSettings, activeChat, onAddContact }) {
  const { user, profile } = useAuth();

  // Bottom nav tab
  const [bottomTab, setBottomTab] = useState('chats'); // chats | moments | command | agent | calls

  // Chat sub-tab (within chats bottom tab)
  const [chatSubTab, setChatSubTab] = useState('all'); // all | unread | groups

  // Data
  const [chats, setChats]             = useState([]);
  const [groups, setGroups]           = useState([]);
  const [contacts, setContacts]       = useState([]);
  const [onlineMap, setOnlineMap]     = useState({});
  const [chatPreviews, setChatPreviews] = useState({});
  const [search, setSearch]           = useState('');
  const [showCreateGroup, setShowCreateGroup] = useState(false);

  // Context menu state
  const [menu, setMenu] = useState(null); // { x, y, item, isGroup }

  // ── Subscriptions ─────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    return subscribeToChats(user.uid, raw =>
      setChats(raw.sort((a, b) =>
        (b.lastMessage?.timestamp?.seconds || 0) - (a.lastMessage?.timestamp?.seconds || 0)
      ))
    );
  }, [user]);

  useEffect(() => {
    if (!user) return;
    return subscribeToGroups(user.uid, setGroups);
  }, [user]);

  useEffect(() => {
    if (!profile?.contacts?.length) { setContacts([]); return; }
    Promise.all(profile.contacts.map(id => getUserById(id)))
      .then(list => setContacts(list.filter(Boolean)));
  }, [profile?.contacts]);

  // Load chat partner profiles
  useEffect(() => {
    if (!user || !chats.length) return;
    chats.forEach(async chat => {
      const partnerId = chat.participants?.find(id => id !== user.uid);
      if (partnerId && !chatPreviews[chat.id]) {
        const p = await getUserById(partnerId);
        if (p) setChatPreviews(prev => ({ ...prev, [chat.id]: p }));
      }
    });
  }, [chats, user]);

  // Presence
  useEffect(() => {
    if (!user || !chats.length) return;
    const unsubs = chats.map(chat => {
      const pid = chat.participants?.find(id => id !== user.uid);
      if (!pid) return null;
      return subscribeToPresence(pid, s =>
        setOnlineMap(prev => ({ ...prev, [pid]: s?.state === 'online' }))
      );
    }).filter(Boolean);
    return () => unsubs.forEach(u => u?.());
  }, [chats, user]);

  // ── Derived lists ─────────────────────────────────────
  const allChats = chats.filter(c => {
    if (c.archived) return false;
    const p = chatPreviews[c.id];
    return !search || p?.name?.toLowerCase().includes(search.toLowerCase());
  });
  const unreadChats = allChats.filter(c => (c.unread?.[user?.uid] || 0) > 0);
  const allGroups = groups.filter(g => {
    if (g.archived) return false;
    return !search || g.name?.toLowerCase().includes(search.toLowerCase());
  });
  const unreadGroups = allGroups.filter(g => (g.unread?.[user?.uid] || 0) > 0);
  const archivedChats = chats.filter(c => c.archived);
  const archivedGroups = groups.filter(g => g.archived);

  // Total unread counts for bottom tab badges
  const totalChatUnread = [...chats, ...groups]
    .filter(c => !c.archived)
    .reduce((sum, c) => sum + (c.unread?.[user?.uid] || 0), 0);

  // ── Context menu handlers ─────────────────────────────
  const openMenu = useCallback((e, item, isGroup) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = e.currentTarget?.getBoundingClientRect?.() || { left: e.clientX, top: e.clientY };
    setMenu({ x: rect.left + 60, y: rect.top, item, isGroup });
  }, []);

  const handleArchive = useCallback(async (archived) => {
    if (!menu) return;
    await setArchived(menu.item.id, menu.isGroup, archived);
  }, [menu]);

  // ── Which list to show ────────────────────────────────
  const listItems = () => {
    if (chatSubTab === 'all')    return { chats: allChats, groups: [] };
    if (chatSubTab === 'unread') return { chats: unreadChats, groups: unreadGroups };
    if (chatSubTab === 'groups') return { chats: [], groups: allGroups };
    return { chats: allChats, groups: [] };
  };
  const { chats: visibleChats, groups: visibleGroups } = listItems();

  const hasArchived = archivedChats.length > 0 || archivedGroups.length > 0;

  // ── Bottom nav items ──────────────────────────────────
  const bottomTabs = [
    { id: 'chats',   icon: MessageCircle, label: 'Chats',   badge: totalChatUnread },
    { id: 'moments', icon: Star,          label: 'Moments', badge: 0 },
    { id: 'command', icon: Zap,           label: 'Command', badge: 0 },
    { id: 'agent',   icon: BotIcon,       label: 'Agent',   badge: 0 },
    { id: 'calls',   icon: Phone,         label: 'Calls',   badge: 0 },
  ];

  return (
    <div className="flex flex-col h-full bg-[var(--sidebar-bg)]">

      {/* ── Top header (always visible) ─────────────────── */}
      <div className="px-4 pt-5 pb-3 border-b border-[var(--border)] flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-brand-500 flex items-center justify-center">
            <MessageCircle size={16} className="text-white" />
          </div>
          <h1 className="font-display font-bold text-[17px] text-[var(--text-primary)]">
            Family <span className="text-brand-500">&</span> Friends
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onAddContact?.()}
            className="w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center transition-all"
          >
            <Plus size={20} className="text-[var(--text-secondary)]" />
          </button>
          <button
            onClick={onOpenSettings}
            className="w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center transition-all"
          >
            <Settings size={18} className="text-[var(--text-secondary)]" />
          </button>
        </div>
      </div>

      {/* ── Chats panel ─────────────────────────────────── */}
      {bottomTab === 'chats' && (
        <>
          {/* Search bar */}
          <div className="px-3 py-2 flex-shrink-0">
            <div className="flex items-center gap-2 bg-[var(--input-bg)] rounded-xl px-3 py-2">
              <Search size={15} className="text-[var(--text-secondary)] flex-shrink-0" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search"
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] outline-none"
              />
              {search && (
                <button onClick={() => setSearch('')}>
                  <X size={14} className="text-[var(--text-secondary)]" />
                </button>
              )}
            </div>
          </div>

          {/* Sub-tabs: All | Unread | Groups */}
          <div className="flex px-3 gap-2 pb-2 flex-shrink-0 overflow-x-auto no-scrollbar">
            {[
              { id: 'all',    label: 'All' },
              { id: 'unread', label: `Unread${totalChatUnread ? ` ${totalChatUnread}` : ''}` },
              { id: 'groups', label: 'Groups' },
            ].map(st => (
              <button
                key={st.id}
                onClick={() => setChatSubTab(st.id)}
                className={`flex-shrink-0 px-4 py-1 rounded-full text-sm font-medium transition-all ${
                  chatSubTab === st.id
                    ? 'bg-brand-500/15 text-brand-500'
                    : 'bg-[var(--hover)] text-[var(--text-secondary)]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>

          {/* Scrollable list */}
          <div className="flex-1 overflow-y-auto">
            {/* Archived row */}
            {hasArchived && (
              <button
                onClick={() => setChatSubTab('archived')}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--hover)] transition-all border-b border-[var(--border)]"
              >
                <div className="w-12 h-12 rounded-full bg-[var(--hover)] flex items-center justify-center flex-shrink-0">
                  <Archive size={20} className="text-[var(--text-secondary)]" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-[var(--text-primary)]">Archived</p>
                  <p className="text-xs text-[var(--text-secondary)]">{archivedChats.length + archivedGroups.length} conversation{archivedChats.length + archivedGroups.length !== 1 ? 's' : ''}</p>
                </div>
              </button>
            )}

            {/* Archived view */}
            {chatSubTab === 'archived' ? (
              <>
                <div className="px-4 py-2 text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest">
                  Archived
                </div>
                {archivedChats.map(chat => {
                  const partner = chatPreviews[chat.id];
                  return (
                    <ChatRow
                      key={chat.id}
                      chat={chat}
                      partner={partner}
                      isActive={activeChat?.type === 'chat' && activeChat?.id === chat.id}
                      uid={user.uid}
                      online={false}
                      onSelect={onSelectChat}
                      onLongPress={e => openMenu(e, chat, false)}
                    />
                  );
                })}
                {archivedGroups.map(group => (
                  <GroupRow
                    key={group.id}
                    group={group}
                    isActive={activeChat?.type === 'group' && activeChat?.id === group.id}
                    uid={user.uid}
                    onSelect={onSelectGroup}
                    onLongPress={e => openMenu(e, group, true)}
                  />
                ))}
              </>
            ) : (
              <>
                {/* Create group button in groups sub-tab */}
                {chatSubTab === 'groups' && (
                  <button
                    onClick={() => setShowCreateGroup(true)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-[var(--hover)] border-b border-[var(--border)] transition-all"
                  >
                    <div className="w-12 h-12 rounded-full bg-[var(--hover)] flex items-center justify-center">
                      <Plus size={20} className="text-brand-500" />
                    </div>
                    <span className="font-medium text-[var(--text-primary)]">New Group</span>
                  </button>
                )}

                {/* Direct chats (All + Unread sub-tabs) */}
                {visibleChats.map(chat => {
                  const partner = chatPreviews[chat.id];
                  const pid = chat.participants?.find(id => id !== user.uid);
                  return (
                    <ChatRow
                      key={chat.id}
                      chat={chat}
                      partner={partner}
                      isActive={activeChat?.type === 'chat' && activeChat?.id === chat.id}
                      uid={user.uid}
                      online={!!onlineMap[pid]}
                      onSelect={onSelectChat}
                      onLongPress={e => openMenu(e, chat, false)}
                    />
                  );
                })}

                {/* Groups (All + Unread + Groups sub-tabs) */}
                {(chatSubTab === 'all' || chatSubTab === 'unread' || chatSubTab === 'groups') &&
                  visibleGroups.map(group => (
                    <GroupRow
                      key={group.id}
                      group={group}
                      isActive={activeChat?.type === 'group' && activeChat?.id === group.id}
                      uid={user.uid}
                      onSelect={onSelectGroup}
                      onLongPress={e => openMenu(e, group, true)}
                    />
                  ))
                }

                {/* Empty states */}
                {visibleChats.length === 0 && visibleGroups.length === 0 && (
                  <div className="flex flex-col items-center justify-center p-10 mt-6 gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-[var(--hover)] flex items-center justify-center">
                      <MessageCircle size={24} className="text-brand-500 opacity-70" />
                    </div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {chatSubTab === 'unread' ? 'No unread messages' : chatSubTab === 'groups' ? 'No groups yet' : 'No conversations yet'}
                    </p>
                    <p className="text-xs text-[var(--text-secondary)] text-center max-w-[200px]">
                      {chatSubTab === 'groups' ? 'Create a group to get started' : 'Start chatting with your contacts'}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* ── Other bottom tab panels ──────────────────────── */}
      {bottomTab === 'moments' && (
        <div className="flex-1 overflow-y-auto">
          <StatusTab />
        </div>
      )}

      {bottomTab === 'command' && (
        <div className="flex-1 overflow-hidden">
          <CommandCenter
            chats={chats}
            groups={groups}
            user={user}
            onSelectChat={onSelectChat}
            onSelectGroup={onSelectGroup}
          />
        </div>
      )}

      {bottomTab === 'agent' && (
        <div className="flex-1 overflow-hidden">
          <AIHubTab />
        </div>
      )}

      {bottomTab === 'calls' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center p-8">
          <div className="w-14 h-14 rounded-2xl bg-[var(--hover)] flex items-center justify-center">
            <Phone size={24} className="text-brand-500 opacity-70" />
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)]">Calls coming soon</p>
          <p className="text-xs text-[var(--text-secondary)]">Voice & video calls will appear here</p>
        </div>
      )}

      {/* ── Bottom navigation bar ────────────────────────── */}
      <div className="flex-shrink-0 border-t border-[var(--border)] bg-[var(--sidebar-bg)] flex items-center safe-area-bottom">
        {bottomTabs.map(t => {
          const active = bottomTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setBottomTab(t.id)}
              className="flex-1 flex flex-col items-center py-2.5 gap-0.5 relative transition-all"
            >
              <div className="relative">
                <t.icon
                  size={22}
                  className="transition-colors"
                  style={{ color: active ? '#22c55e' : 'var(--text-secondary)' }}
                  strokeWidth={active ? 2.2 : 1.8}
                />
                {t.badge > 0 && (
                  <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 bg-brand-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
                    {t.badge > 99 ? '99+' : t.badge}
                  </span>
                )}
              </div>
              <span
                className="text-[10px] font-medium transition-colors"
                style={{ color: active ? '#22c55e' : 'var(--text-secondary)' }}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Context menu ─────────────────────────────────── */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          item={menu.item}
          onClose={() => setMenu(null)}
          onArchive={handleArchive}
        />
      )}

      {/* ── Create group modal ───────────────────────────── */}
      {showCreateGroup && (
        <CreateGroupModal
          contacts={contacts}
          onClose={() => setShowCreateGroup(false)}
          onCreate={() => { setChatSubTab('groups'); setShowCreateGroup(false); }}
        />
      )}
    </div>
  );
}
