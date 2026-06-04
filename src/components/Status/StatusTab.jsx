// ═══════════════════════════════════════════════════════
//  StatusTab — Main Status/Stories List
//  Family & Friends · Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { Plus, Camera, Eye, Clock, ChevronRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { db, collection, query, where, onSnapshot, orderBy } from '../../firebase';
import StatusCreator from './StatusCreator';
import StatusViewer from './StatusViewer';

// Ring color: green = has unseen, gray = all seen
function StatusRing({ seen, size = 48 }) {
  return (
    <div className={`rounded-full p-0.5 ${seen ? 'bg-[var(--border)]' : 'bg-gradient-to-tr from-brand-400 to-brand-600'}`}
      style={{ width: size + 4, height: size + 4, flexShrink: 0 }}>
      <div className="w-full h-full rounded-full bg-[var(--sidebar-bg)] p-0.5">
        <div className="w-full h-full rounded-full overflow-hidden" />
      </div>
    </div>
  );
}

export default function StatusTab() {
  const { user, profile } = useAuth();
  const [allStatuses, setAllStatuses] = useState([]);
  const [showCreator, setShowCreator] = useState(false);
  const [viewerGroups, setViewerGroups] = useState(null);
  const [viewerStart, setViewerStart]   = useState(0);

  // ── Subscribe to statuses ─────────────────────────────
  useEffect(() => {
    if (!user) return;
    const now = new Date().toISOString();
    // Get all non-expired statuses
    const q = query(
      collection(db, 'statuses'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      const items = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => {
          // Filter expired
          if (!s.expiresAt) return true;
          return new Date(s.expiresAt) > new Date();
        });
      setAllStatuses(items);
    });
    return unsub;
  }, [user]);

  // ── Group by user ─────────────────────────────────────
  const myStatuses = allStatuses.filter(s => s.uid === user?.uid);
  const myUid = user?.uid;
  const myContacts = profile?.contacts || [];

  // Filter other users' statuses based on their privacy settings
  const othersMap  = {};
  allStatuses.filter(s => s.uid !== myUid).forEach(s => {
    // Check privacy
    const p = s.privacy || 'contacts';
    const pc = s.privacyContacts || [];

    if (p === 'contacts') {
      // Only show if viewer is in author's contacts OR author is in viewer's contacts
      if (!myContacts.includes(s.uid)) return;
    } else if (p === 'except') {
      // Show to all contacts EXCEPT the listed ones
      if (!myContacts.includes(s.uid)) return;
      if (pc.includes(myUid)) return;
    } else if (p === 'only') {
      // Show ONLY to listed contacts
      if (!pc.includes(myUid)) return;
    }

    if (!othersMap[s.uid]) othersMap[s.uid] = { uid: s.uid, name: s.authorName, avatar: s.authorAvatar, statuses: [] };
    othersMap[s.uid].statuses.push(s);
  });
  const otherGroups = Object.values(othersMap);

  const hasSeen = (group) => group.statuses.every(s => s.viewers?.includes(user?.uid));

  const openViewer = (groups, idx) => {
    setViewerGroups(groups);
    setViewerStart(idx);
  };

  // ── Time ago ──────────────────────────────────────────
  const timeAgo = (ts) => {
    if (!ts) return '';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60)   return 'just now';
    if (diff < 3600) return `${Math.floor(diff/60)}m ago`;
    return `${Math.floor(diff/3600)}h ago`;
  };

  const timeLeft = (expiresAt) => {
    if (!expiresAt) return '';
    const diff = (new Date(expiresAt) - Date.now()) / 1000 / 3600;
    if (diff < 1) return `${Math.floor(diff*60)}m left`;
    return `${Math.floor(diff)}h left`;
  };

  return (
    <div className="bg-[var(--sidebar-bg)] flex flex-col">
      <div className="px-4 pt-2 pb-1">
        <p className="text-xs text-[var(--text-secondary)]">Moments disappear after 24 hours</p>
      </div>
      <div>

        {/* My Moments */}
        <div className="px-4 py-4 border-b border-[var(--border)]">
          <div className="text-xs font-bold text-[var(--text-secondary)] mb-3">MY MOMENTS</div>
          <div className="flex items-center gap-3">
            {/* Avatar with ring */}
            <div className="relative cursor-pointer" onClick={() => myStatuses.length > 0
              ? openViewer([{ uid:user.uid, name:'My Moments', avatar:profile?.avatar, statuses:myStatuses }], 0)
              : setShowCreator(true)}>
              <div className={`w-14 h-14 rounded-full overflow-hidden border-2 ${myStatuses.length>0?'border-brand-500':'border-[var(--border)]'}`}>
                {profile?.avatar
                  ? <img src={profile.avatar} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full bg-brand-500/20 flex items-center justify-center font-bold text-brand-500 text-lg">
                      {profile?.name?.[0]?.toUpperCase()}
                    </div>
                }
              </div>
              {/* Add button */}
              <button onClick={e=>{e.stopPropagation();setShowCreator(true)}}
                className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-brand-500 border-2 border-[var(--sidebar-bg)] flex items-center justify-center">
                <Plus size={12} className="text-white" />
              </button>
            </div>

            <div className="flex-1">
              <div className="font-bold text-[var(--text-primary)] text-sm">My Moments</div>
              {myStatuses.length > 0 ? (
                <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1">
                  <Clock size={10}/> {timeLeft(myStatuses[0]?.expiresAt)} · {myStatuses.length} update{myStatuses.length>1?'s':''}
                </div>
              ) : (
                <div className="text-xs text-[var(--text-secondary)]">Tap to add moment</div>
              )}
            </div>

            <button onClick={() => setShowCreator(true)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-brand-500/10 text-brand-500 text-xs font-bold hover:bg-brand-500/20 transition-colors">
              <Plus size={12}/> Add
            </button>
          </div>

          {/* My status previews */}
          {myStatuses.length > 0 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {myStatuses.map((s, i) => (
                <button key={s.id}
                  onClick={() => openViewer([{ uid:user.uid, name:'My Moments', avatar:profile?.avatar, statuses:myStatuses }], i)}
                  className="flex-shrink-0 w-16 h-20 rounded-xl overflow-hidden relative border-2 border-brand-500">
                  {s.type==='text'
                    ? <div className="w-full h-full flex items-center justify-center p-1" style={{ background:s.bg }}>
                        <p className="text-white text-xs text-center line-clamp-3" style={{ fontSize:8 }}>{s.text}</p>
                      </div>
                    : <img src={s.mediaUrl} alt="" className="w-full h-full object-cover" />
                  }
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 p-1">
                    <div className="flex items-center gap-0.5">
                      <Eye size={8} className="text-white/70"/>
                      <span className="text-white/70 text-[8px]">{s.viewers?.length||0}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Recent updates */}
        {otherGroups.length > 0 && (
          <div className="px-4 py-4">
            <div className="text-xs font-bold text-[var(--text-secondary)] mb-3">RECENT MOMENTS</div>
            <div className="space-y-1">
              {otherGroups.map((group, i) => {
                const seen = hasSeen(group);
                const latest = group.statuses[0];
                return (
                  <button key={group.uid}
                    onClick={() => openViewer(otherGroups, i)}
                    className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-[var(--hover)] transition-colors text-left">
                    {/* Avatar with ring */}
                    <div className={`w-14 h-14 rounded-full overflow-hidden flex-shrink-0 p-0.5 ${seen ? 'bg-[var(--border)]' : 'bg-gradient-to-tr from-brand-400 to-brand-600'}`}>
                      <div className="w-full h-full rounded-full overflow-hidden bg-[var(--sidebar-bg)] p-0.5">
                        <div className="w-full h-full rounded-full overflow-hidden">
                          {group.avatar
                            ? <img src={group.avatar} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full bg-brand-500/20 flex items-center justify-center font-bold text-brand-500">
                                {group.name?.[0]?.toUpperCase()}
                              </div>
                          }
                        </div>
                      </div>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className={`font-bold text-sm truncate ${seen ? 'text-[var(--text-secondary)]' : 'text-[var(--text-primary)]'}`}>
                        {group.name}
                      </div>
                      <div className="text-xs text-[var(--text-secondary)] flex items-center gap-1 mt-0.5">
                        <Clock size={10}/>
                        {timeAgo(latest?.createdAt)}
                        {!seen && <span className="w-1.5 h-1.5 rounded-full bg-brand-500 ml-1" />}
                      </div>
                    </div>

                    {/* Preview thumbnail */}
                    <div className="w-12 h-16 rounded-xl overflow-hidden flex-shrink-0">
                      {latest?.type === 'text'
                        ? <div className="w-full h-full flex items-center justify-center p-1" style={{ background:latest.bg }}>
                            <p className="text-white text-center" style={{ fontSize:7, lineHeight:1.2 }}>{latest.text?.slice(0,20)}</p>
                          </div>
                        : latest?.mediaUrl
                          ? <img src={latest.mediaUrl} alt="" className="w-full h-full object-cover" />
                          : <div className="w-full h-full bg-brand-900 flex items-center justify-center">
                              <Camera size={14} className="text-brand-400" />
                            </div>
                      }
                    </div>

                    <ChevronRight size={16} className="text-[var(--text-secondary)]" />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state */}
        {otherGroups.length === 0 && myStatuses.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
            <div className="w-20 h-20 rounded-3xl bg-brand-500/10 flex items-center justify-center mb-4">
              <Camera size={36} className="text-brand-500" />
            </div>
            <h3 className="font-bold text-[var(--text-primary)] text-lg mb-2">No Moments Yet</h3>
            <p className="text-[var(--text-secondary)] text-sm mb-6">Share your moments with text, photos and more</p>
            <button onClick={() => setShowCreator(true)}
              className="flex items-center gap-2 px-6 py-3 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-bold transition-colors">
              <Plus size={16}/> Add Moment
            </button>
          </div>
        )}
      </div>

      {/* Status Creator Modal */}
      {showCreator && (
        <StatusCreator onClose={() => setShowCreator(false)} onPosted={() => setShowCreator(false)} />
      )}

      {/* Status Viewer */}
      {viewerGroups && (
        <StatusViewer groups={viewerGroups} startGroupIndex={viewerStart} onClose={() => setViewerGroups(null)} />
      )}
    </div>
  );
}
