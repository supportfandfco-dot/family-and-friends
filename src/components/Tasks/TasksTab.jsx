import React, { useState, useEffect, useMemo } from 'react';
import { 
  Check, Circle, Plus, Trash2, ListTodo, Flame, MessageSquare, 
  Calendar as CalendarIcon, Cloud, Share2, MessageCircle, ExternalLink, 
  Clock, CheckCircle2, ChevronRight, AlertCircle, CalendarPlus, X
} from 'lucide-react';
import toast from 'react-hot-toast';
import { 
  auth, db, createFFTask, toggleFFTask, deleteFFTask, subscribeToFFTasks, 
  googleCachedAccessToken, signInWithGoogle 
} from '../../firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { generateCommandCenterInsights } from '../../ai/unifyService';

export default function TasksTab({ chats, groups, user, onSelectChat, onSelectGroup }) {
  const [tasks, setTasks] = useState([]);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [loadingAi, setLoadingAi] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedTask, setSelectedTask] = useState(null);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = subscribeToFFTasks(user.uid, (data) => {
      setTasks(data);
    });
    return () => unsub();
  }, [user]);

  // Load AI suggestions
  useEffect(() => {
    if (!chats || !groups || !user) return;
    
    const timeoutId = setTimeout(() => {
      async function fetchInsights() {
        setLoadingAi(true);
        try {
          const insights = await generateCommandCenterInsights(chats, groups, user.uid);
          if (insights && insights.tasks) {
            setAiSuggestions(insights.tasks);
          }
        } catch (err) {
          // Silent — AI insights are non-critical
        } finally {
          setLoadingAi(false);
        }
      }
      fetchInsights();
    }, 1000);
    
    return () => clearTimeout(timeoutId);
  }, [chats, groups, user]);

  const handleToggleTask = async (task) => {
    const isCompleted = task.status === 'completed';
    // Opt update for feel
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: isCompleted ? 'pending' : 'completed' } : t));
    try {
      await toggleFFTask(task.id, isCompleted ? 'pending' : 'completed');
    } catch (e) {
      toast.error('Failed to update task');
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    try {
      await createFFTask({ title: newTaskTitle, source: 'App Task List', dueDate: null });
      setNewTaskTitle('');
    } catch (e) {
      toast.error('Failed to add task');
    }
  };

  const syncToGoogle = async (task) => {
    try {
      let token = googleCachedAccessToken;
      if (!token) {
        const authRes = await signInWithGoogle();
        if (authRes.token) token = authRes.token;
        else throw new Error("No token");
      }
      
      const listRes = await fetch('https://tasks.googleapis.com/tasks/v1/users/@me/lists', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!listRes.ok) {
        let errJson = {};
        try { errJson = await listRes.json(); } catch(e){}
        // Google Calendar API error — handled above
        throw new Error(`Google API Error: ${errJson.error?.message || listRes.statusText}`);
      }
      const listData = await listRes.json();
      const defaultList = listData.items?.[0]?.id || '@default';
      if (!defaultList) throw new Error("No task lists found");

      const res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${defaultList}/tasks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          title: task.title, 
          notes: `Source: ${task.source || ''}\n${task.messageText || ''}`
        })
      });
      
      if (!res.ok) throw new Error("API Error");
      const gData = await res.json();
      
      // Update local task with googleTaskId
      await updateDoc(doc(db, 'users', user.uid, 'tasks', task.id), {
        googleTaskId: gData.id
      });
      
      toast.success('Added to Google Tasks');
    } catch (err) {
      // Silent — task sync error
      toast.error('Failed to sync to Google Tasks');
    }
  };

  const acceptSuggestion = async (s) => {
    try {
      await createFFTask({ title: s.title, dueDate: s.dueDate || null, source: s.source || 'AI Suggestion' });
      setAiSuggestions(prev => prev.filter(x => x.title !== s.title));
      toast.success("Task added");
    } catch (e) {
      toast.error("Could not add task");
    }
  };

  // Stats Logic
  const stats = useMemo(() => {
    let dueToday = 0;
    let upcoming = 0;
    let overdue = 0;
    let completed = 0;
    const now = new Date();
    
    tasks.forEach(t => {
      if (t.status === 'completed') {
        completed++;
        return;
      }
      if (t.dueDate) {
        const d = new Date(t.dueDate);
        if (d.toDateString() === now.toDateString()) dueToday++;
        else if (d < now) overdue++;
        else upcoming++;
      } else {
        upcoming++; // No due date = upcoming
      }
    });
    return { dueToday, upcoming, overdue, completed };
  }, [tasks]);

  const priorityTasks = tasks.filter(t => t.status !== 'completed' && (t.priority === 'high' || (t.dueDate && new Date(t.dueDate) < new Date())));
  const completedTasks = tasks.filter(t => t.status === 'completed');
  const pendingTasks = tasks.filter(t => t.status !== 'completed' && !priorityTasks.includes(t));

  // Group by source
  const groupedTasks = useMemo(() => {
    const map = {};
    pendingTasks.forEach(t => {
      const src = t.source || 'General';
      if (!map[src]) map[src] = [];
      map[src].push(t);
    });
    return map;
  }, [pendingTasks]);

  // Handle open chat lookup
  const navigateToSource = (sourceName) => {
    if (!sourceName) return;
    const s = sourceName.toLowerCase();
    const c = chats?.find(x => x.contactName?.toLowerCase().includes(s));
    if (c) { onSelectChat(c); return; }
    const g = groups?.find(x => x.name?.toLowerCase().includes(s));
    if (g) { onSelectGroup(g); return; }
    toast("Could not locate original chat automatically.");
  };

  return (
    <div className="flex flex-col h-full bg-[var(--bg-primary)] overflow-y-auto w-full pb-20">
      
      {/* Header */}
      <div className="px-6 py-5 border-b border-[var(--border)] sticky top-0 bg-[var(--bg-primary)] z-10 flex flex-col items-start pt-6">
        <h2 className="text-2xl font-black flex items-center gap-2 text-[var(--text-primary)] tracking-tight">
          <ListTodo className="w-6 h-6 text-brand-500" /> Tasks
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mt-1 tracking-wide font-medium">
          Commitments, deadlines, and action items from your conversations.
        </p>
      </div>

      <div className="p-4 md:p-6 space-y-8 max-w-4xl mx-auto w-full">
        
        {/* Quick Stats Strip */}
        <div className="flex flex-wrap gap-2 md:gap-3">
          <div className="flex-1 min-w-[70px] border border-[var(--border)] bg-[var(--sidebar-bg)] rounded-xl p-3 flex flex-col justify-center shadow-sm items-center">
            <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-widest mb-1 text-center">Due Today</span>
            <span className="text-xl font-black text-[var(--text-primary)]">{stats.dueToday}</span>
          </div>
          <div className="flex-1 min-w-[70px] border border-[var(--border)] bg-[var(--sidebar-bg)] rounded-xl p-3 flex flex-col justify-center shadow-sm items-center">
            <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-widest mb-1 text-center">Upcoming</span>
            <span className="text-xl font-black text-[var(--text-primary)]">{stats.upcoming}</span>
          </div>
          <div className="flex-1 min-w-[70px] border border-[var(--border)] bg-[var(--sidebar-bg)] rounded-xl p-3 flex flex-col justify-center shadow-sm items-center">
            <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-widest mb-1 text-center">Overdue</span>
            <span className="text-xl font-black text-red-500">{stats.overdue}</span>
          </div>
          <div className="flex-1 min-w-[70px] border border-[var(--border)] bg-[var(--sidebar-bg)] rounded-xl p-3 flex flex-col justify-center shadow-sm items-center">
            <span className="text-[10px] uppercase font-bold text-[var(--text-secondary)] tracking-widest mb-1 text-center">Completed</span>
            <span className="text-xl font-black text-brand-500">{stats.completed}</span>
          </div>
        </div>

        {/* Priority Section */}
        {priorityTasks.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-xs font-bold text-red-500 uppercase tracking-widest flex items-center gap-1.5 px-1">
              <Flame size={14} /> Needs Attention
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {priorityTasks.map(task => (
                <TaskCard 
                  key={task.id} 
                  task={task} 
                  onToggle={() => handleToggleTask(task)} 
                  onDelete={() => deleteFFTask(task.id)}
                  onSyncGoogle={() => syncToGoogle(task)}
                  onNavigate={() => navigateToSource(task.source)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Main Task Feed (Grouped) */}
        {Object.keys(groupedTasks).length > 0 && (
          <div className="space-y-6">
            {Object.keys(groupedTasks).map(source => (
              <div key={source} className="space-y-3">
                <h3 className="text-[11px] font-black text-[var(--text-primary)] uppercase tracking-widest px-1 flex items-center gap-1.5 opacity-80">
                  <MessageSquare size={12} /> {source}
                </h3>
                <div className="space-y-2">
                  {groupedTasks[source].map(task => (
                    <TaskCard 
                      key={task.id} 
                      task={task} 
                      onToggle={() => handleToggleTask(task)} 
                      onDelete={() => deleteFFTask(task.id)}
                      onSyncGoogle={() => syncToGoogle(task)}
                      onNavigate={() => navigateToSource(task.source)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* AI Suggestions */}
        {aiSuggestions.length > 0 && (
          <div className="space-y-3 pt-4 border-t border-[var(--border)]">
            <h3 className="text-xs font-bold text-brand-500 uppercase tracking-widest flex items-center gap-1.5 px-1">
              <SparklesIcon /> UnifyAI Suggestions
            </h3>
            <div className="space-y-2">
              {aiSuggestions.map((s, idx) => {
                // If it's already in pending tasks, hide it
                if (pendingTasks.find(t => t.title.toLowerCase() === s.title.toLowerCase())) return null;
                return (
                  <div key={idx} className="bg-[var(--sidebar-bg)] border border-[var(--border)] p-3 rounded-2xl flex items-center justify-between gap-3 shadow-sm">
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-[var(--text-primary)]">{s.title}</p>
                      <p className="text-[10px] text-[var(--text-secondary)] mt-1 uppercase tracking-wider font-bold">
                        Source: {s.source} {s.dueDate ? `• Due: ${s.dueDate}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => acceptSuggestion(s)} className="text-xs bg-brand-500/10 text-brand-500 px-3 py-1.5 rounded-lg font-bold hover:bg-brand-500/20 transition-colors">
                        Accept
                      </button>
                      <button onClick={() => setAiSuggestions(prev => prev.filter(x => x.title !== s.title))} className="p-1.5 text-[var(--text-secondary)] hover:bg-[var(--hover)] rounded-full transition-colors">
                        <X size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {tasks.length === 0 && !loadingAi && aiSuggestions.length === 0 && (
          <div className="text-center py-20 px-6 max-w-sm mx-auto">
            <CheckCircle2 className="w-12 h-12 text-brand-500 mx-auto mb-4 opacity-50" />
            <h3 className="text-base font-black text-[var(--text-primary)] mb-1">Everything looks under control.</h3>
            <p className="text-sm text-[var(--text-secondary)]">No pending commitments or deadlines detected from your conversations.</p>
          </div>
        )}

        {/* Add Manual Task */}
        <div className="pt-2">
          <form onSubmit={handleAddTask} className="flex gap-2 relative shadow-lg rounded-2xl">
            <input
              type="text"
              placeholder="Manually add a task..."
              value={newTaskTitle}
              onChange={(e) => setNewTaskTitle(e.target.value)}
              className="flex-1 bg-[var(--sidebar-bg)] border border-[var(--border)] text-[var(--text-primary)] rounded-full pl-5 pr-14 py-3.5 text-sm focus:outline-none focus:border-brand-500 transition-all font-medium"
            />
            <button 
              type="submit"
              disabled={!newTaskTitle.trim()}
              className="absolute right-1.5 top-1.5 bottom-1.5 aspect-square bg-brand-500 text-white rounded-full flex items-center justify-center hover:bg-brand-600 disabled:opacity-50 transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}

const SparklesIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" />
  </svg>
);

function TaskCard({ task, onToggle, onDelete, onSyncGoogle, onNavigate }) {
  const [expanded, setExpanded] = useState(false);
  const isCompleted = task.status === 'completed';

  return (
    <div className={`border border-[var(--border)] rounded-2xl bg-[var(--bg-secondary)] overflow-hidden transition-all ${isCompleted ? 'opacity-60 grayscale-[50%]' : 'hover:border-brand-500 shadow-sm'}`}>
      <div 
        className="p-3.5 flex items-start gap-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className={`mt-0.5 flex-shrink-0 ${isCompleted ? 'text-green-500' : 'text-[var(--text-secondary)] hover:text-brand-500'} transition-colors`}>
          {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
        </button>
        
        <div className={`flex-1 min-w-0 ${isCompleted ? 'line-through opacity-80' : ''}`}>
          <div className="flex justify-between items-start">
            <p className="text-[14px] font-bold text-[var(--text-primary)] pr-2 leading-snug">{task.title}</p>
            {task.googleTaskId && <Cloud size={14} className="text-blue-500 flex-shrink-0 mt-0.5 opacity-80" title="Synced to Google Tasks" />}
          </div>
          
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {task.dueDate && (
              <span className="flex items-center gap-1 text-[10px] bg-[var(--hover)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded uppercase font-black tracking-wider">
                <Clock size={10} /> {new Date(task.dueDate).toLocaleDateString()}
              </span>
            )}
            {task.source && !expanded && (
               <span className="flex items-center gap-1 text-[10px] bg-[var(--sidebar-bg)] border border-[var(--border)] text-[var(--text-secondary)] px-1.5 py-0.5 rounded uppercase font-black tracking-wider shadow-sm">
                 <MessageCircle size={10} /> {task.source}
               </span>
            )}
            {task.confidenceLabel && !expanded && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                task.confidenceLabel === 'high' ? 'bg-green-500/10 text-green-500' :
                task.confidenceLabel === 'medium' ? 'bg-orange-500/10 text-orange-400' :
                'bg-[var(--hover)] text-[var(--text-secondary)]'
              }`}>
                {task.confidenceLabel === 'high' ? '⚡ High' : task.confidenceLabel === 'medium' ? '~ Medium' : '? Low'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Expanded Actions & Context */}
      {expanded && (
        <div className="px-4 pb-4 pt-2 border-t border-[var(--border)] bg-[var(--sidebar-bg)]">
          <div className="mt-2 mb-4 space-y-2">
            {task.messageText && (
              <div>
                <p className="text-[9px] text-[var(--text-secondary)] uppercase font-black tracking-widest mb-1.5">Detected From</p>
                <div className="bg-[var(--hover)] p-3 rounded-xl border border-[var(--border)] text-sm text-[var(--text-primary)] italic border-l-2 border-l-brand-500 drop-shadow-sm">
                  "{task.messageText}"
                </div>
              </div>
            )}
            {task.googleTaskId && (
              <p className="text-[10px] text-blue-500 font-bold uppercase flex items-center gap-1 mt-2">
                <Cloud size={12} /> Synced with Google Tasks
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={(e) => { e.stopPropagation(); onNavigate(); }}
              className="flex items-center gap-1 text-[11px] font-bold bg-[var(--bg-primary)] border border-[var(--border)] shadow-sm text-[var(--text-primary)] px-3 py-2 rounded-xl hover:bg-[var(--hover)] transition-colors flex-1 justify-center whitespace-nowrap"
            >
              <ExternalLink size={12} /> Open Source
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onSyncGoogle(); }}
              disabled={!!task.googleTaskId}
              className="flex items-center gap-1 text-[11px] font-bold bg-[var(--bg-primary)] border border-[var(--border)] shadow-sm text-[var(--text-primary)] px-3 py-2 rounded-xl hover:bg-[var(--hover)] transition-colors flex-[1.5] justify-center disabled:opacity-50 whitespace-nowrap"
            >
              <Cloud size={12} /> {task.googleTaskId ? 'Synced to Google' : '+ Google Tasks'}
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onToggle(); }}
              className="flex items-center gap-1 text-[11px] font-bold bg-[var(--bg-primary)] border border-[var(--border)] shadow-sm text-[var(--text-primary)] px-3 py-2 rounded-xl hover:bg-[var(--hover)] transition-colors flex-1 justify-center whitespace-nowrap"
            >
              {isCompleted ? 'Mark Pending' : 'Mark Complete'}
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              className="aspect-square flex items-center justify-center p-2 text-red-500 bg-[var(--bg-primary)] border border-[var(--border)] shadow-sm rounded-xl hover:bg-red-500/10 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
