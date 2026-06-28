import { useAuth } from '../../contexts/AuthContext';
import React, { useState, useEffect } from 'react';
import { db, toggleFFTask, deleteFFTask } from '../../firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { Check, Circle, Trash2, Calendar, Link } from 'lucide-react';
import toast from 'react-hot-toast';

export default function TasksDashboard({ onOpenChat }) {
  const { user } = useAuth();
  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'users', user.uid, 'tasks'),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, (snap) => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return unsub;
  }, []);

  const handleToggle = async (task) => {
    try {
      const newStatus = task.status === 'completed' ? 'pending' : 'completed';
      await toggleFFTask(task.id, newStatus);
    } catch {
      toast.error('Failed to update task');
    }
  };

  const handleDelete = async (id) => {
    try {
      await deleteFFTask(id);
    } catch {
      toast.error('Failed to delete task');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-3">
        <h3 className="font-semibold text-sm text-[var(--text-primary)] uppercase tracking-widest">Action Items</h3>
      </div>
      {tasks.length === 0 ? (
         <p className="text-sm text-[var(--text-secondary)] bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-xl p-4">No tasks detected.</p>
      ) : (
        <div className="space-y-2">
          {tasks.map(t => (
            <div key={t.id} className={`bg-[var(--sidebar-bg)] border border-[var(--border)] rounded-xl p-3 flex items-start gap-3 shadow-sm transition-opacity ${t.status === 'completed' ? 'opacity-50' : ''}`}>
               <button onClick={() => handleToggle(t)} className="mt-0.5 text-[var(--text-secondary)] hover:text-brand-500">
                 {t.status === 'completed' ? <Check size={18} className="text-brand-500" /> : <Circle size={18} />}
               </button>
               <div className="flex-1">
                 <p className={`font-medium text-sm text-[var(--text-primary)] ${t.status==='completed'?'line-through':''}`}>{t.title}</p>
                 <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-[var(--text-secondary)]">
                   {t.dueDate && <span className="flex items-center gap-1 text-orange-500"><Calendar size={10} /> {t.dueDate}</span>}
                   {t.source && <span className="flex items-center gap-1"><Link size={10} /> {t.source}</span>}
                   {t.chatId && (
                     <button onClick={() => onOpenChat && onOpenChat(t.chatId, t.type)} className="text-brand-500 hover:underline">
                       Open Source Message
                     </button>
                   )}
                 </div>
               </div>
               <button onClick={() => handleDelete(t.id)} className="p-1.5 text-[var(--text-secondary)] hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-colors">
                 <Trash2 size={14} />
               </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
