// ═══════════════════════════════════════════════════════
//  MediaGallery — All shared photos/videos in a chat
// ═══════════════════════════════════════════════════════
import { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { X, Image, Download } from 'lucide-react';
import { format } from 'date-fns';

function downloadImg(url, name = 'image.jpg') {
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
}

export default function MediaGallery({ chatId, isGroup, onClose, onViewImage }) {
  const [media, setMedia] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!chatId) return;
    const col = isGroup ? 'groups' : 'chats';
    getDocs(query(
      collection(db, col, chatId, 'messages'),
      where('type', 'in', ['image', 'video']),
      orderBy('timestamp', 'desc'),
      limit(100)
    )).then(snap => {
      setMedia(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [chatId, isGroup]);

  // Group by month
  const grouped = {};
  media.forEach(m => {
    const ts = m.timestamp?.seconds ? m.timestamp.seconds * 1000 : Date.now();
    const key = format(new Date(ts), 'MMMM yyyy');
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(m);
  });

  return (
    <div className="fixed inset-0 z-[400] bg-[var(--sidebar-bg)] flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border)] flex-shrink-0">
        <button onClick={onClose}
          className="w-9 h-9 rounded-xl hover:bg-[var(--hover)] flex items-center justify-center">
          <X size={20} className="text-[var(--text-secondary)]"/>
        </button>
        <div>
          <h2 className="font-bold text-[var(--text-primary)]">Media</h2>
          <p className="text-xs text-[var(--text-secondary)]">{media.length} item{media.length !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {loading && (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
          </div>
        )}

        {!loading && media.length === 0 && (
          <div className="flex flex-col items-center justify-center h-60 gap-3">
            <div className="w-14 h-14 rounded-2xl bg-[var(--hover)] flex items-center justify-center">
              <Image size={24} className="text-[var(--text-secondary)] opacity-50"/>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">No photos or videos shared yet</p>
          </div>
        )}

        {Object.entries(grouped).map(([month, items]) => (
          <div key={month} className="mb-4">
            <p className="text-xs font-bold text-[var(--text-secondary)] uppercase tracking-widest mb-2 px-1">{month}</p>
            <div className="grid grid-cols-3 gap-1">
              {items.map(m => (
                <button key={m.id}
                  onClick={() => onViewImage ? onViewImage(m.content) : setSelected(m.content)}
                  className="aspect-square rounded-xl overflow-hidden bg-[var(--hover)] relative group">
                  <img src={m.content} alt="" className="w-full h-full object-cover"/>
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-end justify-end p-1.5">
                    <button
                      onClick={e => { e.stopPropagation(); downloadImg(m.content); }}
                      className="opacity-0 group-hover:opacity-100 w-7 h-7 rounded-lg bg-black/50 flex items-center justify-center transition-all">
                      <Download size={13} className="text-white"/>
                    </button>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Full screen viewer */}
      {selected && (
        <div className="fixed inset-0 z-[500] bg-black/95 flex items-center justify-center"
          onClick={() => setSelected(null)}>
          <img src={selected} alt="" className="max-w-full max-h-full object-contain"/>
          <button onClick={() => setSelected(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
            <X size={20} className="text-white"/>
          </button>
          <button onClick={() => downloadImg(selected)}
            className="absolute bottom-6 right-6 w-10 h-10 rounded-full bg-black/50 flex items-center justify-center">
            <Download size={18} className="text-white"/>
          </button>
        </div>
      )}
    </div>
  );
}
