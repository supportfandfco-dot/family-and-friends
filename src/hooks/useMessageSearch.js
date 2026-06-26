// ═══════════════════════════════════════════════════════
//  useMessageSearch — Indexed, debounced, instant search
//  Handles 50k+ messages with O(n) indexed lookup.
// ═══════════════════════════════════════════════════════
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// Build a lowercase search index — one pass, O(n)
function buildIndex(messages) {
  return messages.map(m => ({
    id:    m.id,
    text: (m.content || '').toLowerCase(),
  }));
}

export default function useMessageSearch(messages) {
  const [query, setQuery]   = useState('');
  const [active, setActive] = useState(false);
  const [resultIdx, setResultIdx] = useState(0);
  const debounceRef = useRef(null);

  // Rebuild index only when messages change
  const index = useMemo(() => buildIndex(messages), [messages]);

  // Debounced query update — 150ms feels instant but avoids per-keystroke scan
  const handleQueryChange = useCallback((val) => {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQuery(val);
      setResultIdx(0);
    }, 150);
  }, []);

  // Compute matching IDs — O(n) scan on the prebuilt index
  const matchIds = useMemo(() => {
    if (!active || !query.trim() || query.trim().length < 2) return [];
    const q = query.toLowerCase();
    return index.filter(e => e.text.includes(q)).map(e => e.id);
  }, [active, query, index]);

  const total     = matchIds.length;
  const currentId = matchIds[resultIdx] ?? null;
  const currentMsg = currentId ? messages.find(m => m.id === currentId) : null;

  const prev = useCallback(() => {
    setResultIdx(i => (i > 0 ? i - 1 : total - 1));
  }, [total]);

  const next = useCallback(() => {
    setResultIdx(i => (i < total - 1 ? i + 1 : 0));
  }, [total]);

  const open  = useCallback(() => { setActive(true); setResultIdx(0); }, []);
  const close = useCallback(() => { setActive(false); setQuery(''); setResultIdx(0); }, []);

  // Cleanup on unmount
  useEffect(() => () => clearTimeout(debounceRef.current), []);

  return {
    searchActive: active,
    searchQuery:  query,
    matchIds,
    totalResults: total,
    resultIdx,
    currentMsg,
    handleQueryChange,
    openSearch:  open,
    closeSearch: close,
    prevResult:  prev,
    nextResult:  next,
  };
}
