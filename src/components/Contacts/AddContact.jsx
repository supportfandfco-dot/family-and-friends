// ═══════════════════════════════════════════════════════
//  AddContact — Search by Name or 6-digit Code
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════
import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { searchUsersByName, getUserByCode, addContact, getContacts } from '../../supabase';
import toast from 'react-hot-toast';
import { Search, X, UserPlus, Check, ArrowLeft, Hash } from 'lucide-react';

export default function AddContact({ onClose, onContactAdded }) {
  const { user } = useAuth();
  const [query,      setQuery]      = useState('');
  const [mode,       setMode]       = useState('name');   // 'name' | 'code'
  const [results,    setResults]    = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [added,      setAdded]      = useState({});
  // Own contact ids, loaded once — the new schema models contacts as a
  // join table (see addContact/getContacts in supabase.js), not an array
  // field on the profile, so it can't be read off `profile.contacts`
  // anymore.
  const [contactIds, setContactIds] = useState(new Set());

  useEffect(() => {
    if (!user?.uid) return;
    getContacts(user.uid).then(contacts => setContactIds(new Set(contacts.map(c => c.id))));
  }, [user?.uid]);

  const handleSearch = useCallback(async (val) => {
    setQuery(val);
    setResults([]);
    const v = val.trim();
    if (!v) return;

    if (mode === 'code') {
      if (v.length !== 6 || !/^\d+$/.test(v)) return;
      setLoading(true);
      try {
        const found = await getUserByCode(v);
        if (found && found.id !== user.uid) setResults([found]);
        else if (!found) toast('No user found with that code');
      } catch { toast.error('Search failed'); }
      finally { setLoading(false); }
      return;
    }

    // Name search
    if (v.length < 2) return;
    setLoading(true);
    try {
      const users = await searchUsersByName(v, user.uid);
      setResults(users);
    } catch { toast.error('Search failed'); }
    finally { setLoading(false); }
  }, [mode, user.uid]);

  const switchMode = (m) => {
    setMode(m);
    setQuery('');
    setResults([]);
  };

  const handleAdd = async (contact) => {
    try {
      if (contactIds.has(contact.id)) { toast('Already in contacts'); return; }
      await addContact(user.uid, contact.id);
      setContactIds(prev => new Set(prev).add(contact.id));
      setAdded(prev => ({ ...prev, [contact.id]: true }));
      toast.success(`${contact.name} added to contacts!`);
      if (onContactAdded) onContactAdded(contact);
    } catch (e) {
      toast.error('Failed to add contact');
    }
  };

  const isContact = (id) => contactIds.has(id) || added[id];

  return (
    <div className="flex flex-col h-full bg-[var(--sidebar-bg)]">

      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-4 border-b border-[var(--border)]">
        <button onClick={onClose} className="p-2 rounded-full hover:bg-[var(--hover)] transition-colors">
          <ArrowLeft size={20} className="text-[var(--text-primary)]" />
        </button>
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Add Contact</h2>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-2 px-4 pt-4">
        <button onClick={() => switchMode('name')}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${mode === 'name' ? 'bg-brand-500 text-white' : 'bg-[var(--hover)] text-[var(--text-secondary)]'}`}>
          <Search size={14}/> By Name
        </button>
        <button onClick={() => switchMode('code')}
          className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-1.5 ${mode === 'code' ? 'bg-brand-500 text-white' : 'bg-[var(--hover)] text-[var(--text-secondary)]'}`}>
          <Hash size={14}/> By Code
        </button>
      </div>

      {/* Search input */}
      <div className="px-4 pt-3">
        <div className="relative">
          {mode === 'name'
            ? <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />
            : <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]" />}
          <input
            key={mode}
            value={query}
            onChange={e => handleSearch(mode === 'code' ? e.target.value.replace(/\D/g,'').slice(0,6) : e.target.value)}
            placeholder={mode === 'name' ? 'Search by name…' : 'Enter 6-digit code…'}
            autoFocus
            inputMode={mode === 'code' ? 'numeric' : 'text'}
            className="w-full pl-9 pr-9 py-3 rounded-2xl bg-[var(--hover)] text-[var(--text-primary)] placeholder-[var(--text-secondary)] border border-[var(--border)] focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm"
          />
          {query && (
            <button onClick={() => { setQuery(''); setResults([]); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]">
              <X size={14} />
            </button>
          )}
        </div>
        <p className="text-xs text-[var(--text-secondary)] mt-2 ml-1">
          {mode === 'name' ? 'Type at least 2 characters' : 'Ask your contact for their 6-digit code from Settings → Profile'}
        </p>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 mt-3 space-y-2">
        {loading && (
          <div className="flex justify-center py-10">
            <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && query && results.length === 0 && (mode === 'code' ? query.length === 6 : query.length >= 2) && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">🔍</div>
            <p className="text-[var(--text-secondary)] text-sm">No users found</p>
            <p className="text-[var(--text-secondary)] text-xs mt-1">They need an account on Family & Friends</p>
          </div>
        )}

        {!loading && results.map(u => (
          <div key={u.id} className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--hover)]">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-brand-500 flex items-center justify-center flex-shrink-0">
              {u.avatar
                ? <img src={u.avatar} className="w-full h-full object-cover" alt={u.name} />
                : <span className="text-white font-bold text-lg">{u.name?.[0]?.toUpperCase()}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-[var(--text-primary)] truncate">{u.name}</p>
              <p className="text-xs text-[var(--text-secondary)] truncate">{u.about || 'Using Family & Friends'}</p>
            </div>
            <button onClick={() => handleAdd(u)} disabled={isContact(u.id)}
              className={`p-2.5 rounded-full transition-all press-scale ${isContact(u.id) ? 'bg-green-500/20 text-green-400 cursor-default' : 'bg-brand-500 text-white hover:bg-brand-400'}`}>
              {isContact(u.id) ? <Check size={18} /> : <UserPlus size={18} />}
            </button>
          </div>
        ))}

        {!query && (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">{mode === 'name' ? '👥' : '#️⃣'}</div>
            <p className="text-[var(--text-secondary)] text-sm">
              {mode === 'name' ? 'Search people by name' : 'Enter a 6-digit code to find someone'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
