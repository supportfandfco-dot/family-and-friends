// ═══════════════════════════════════════════════════════════
//  UnifyAIOverlay — Clean, calm AI assistant panel
//  Routing is invisible. No model names exposed to users.
// ═══════════════════════════════════════════════════════════
import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Sparkles, Cpu } from 'lucide-react';
import useAIStore from './useAIStore';
import { overlayAsk, unifiedAnswer, buildChatContextString } from './unifyService';
import { localChatSummary, analyzeConversationMood, extractKeywords } from './localIntelligence.js';
import { shouldSynthesize } from './aiRouter.js';

function AmbientOrbs() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
      <div className="absolute -top-20 -left-20 w-64 h-64 rounded-full opacity-15 blur-[80px]"
        style={{ background: 'radial-gradient(circle,#630ed4,transparent)' }}/>
      <div className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full opacity-10 blur-[80px]"
        style={{ background: 'radial-gradient(circle,#06b6d4,transparent)' }}/>
    </div>
  );
}

// Phase indicator — minimal, no model names
function ThinkingIndicator({ phase, isSynthesis }) {
  const labels = {
    thinking: isSynthesis ? 'Analysing…' : 'Thinking…',
    merging:  'Synthesizing…',
    done:     '',
  };
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className="flex gap-1">
        {[0,1,2].map(i => (
          <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ background: '#630ed4', animationDelay: `${i * 0.15}s` }}/>
        ))}
      </div>
      <span className="text-[11px]" style={{ color: 'rgba(203,195,215,0.5)', fontFamily: 'Geist,system-ui' }}>
        {labels[phase] || 'Processing…'}
      </span>
    </div>
  );
}

function MessageBubble({ role, text, phase, isFallback, streaming }) {
  const isAI = role === 'assistant';

  if (!isAI) return (
    <div className="flex justify-end mb-4">
      <div className="max-w-[80%] px-4 py-3 rounded-2xl rounded-tr-sm"
        style={{ background: 'linear-gradient(135deg,rgba(99,14,212,0.2),rgba(6,182,212,0.12))', border: '1px solid rgba(99,14,212,0.2)' }}>
        <p className="text-[14px] leading-relaxed" style={{ color: '#e5e2e1', fontFamily: 'Geist,system-ui' }}>{text}</p>
      </div>
    </div>
  );

  return (
    <div className="flex gap-3 mb-4">
      <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center border border-white/10 mt-0.5"
        style={{ background: isFallback ? 'rgba(34,197,94,0.1)' : 'rgba(99,14,212,0.1)' }}>
        {isFallback
          ? <Cpu size={14} style={{ color: '#22c55e' }}/>
          : <Sparkles size={14} style={{ color: '#630ed4' }}/>}
      </div>
      <div className="flex-1 min-w-0">
        {phase && phase !== 'done' && <ThinkingIndicator phase={phase} isSynthesis={streaming?.isSynthesis}/>}
        <div className="rounded-2xl p-4"
          style={{
            background: 'rgba(24,24,24,0.7)',
            backdropFilter: 'blur(20px)',
            border: `1px solid ${isFallback ? 'rgba(34,197,94,0.15)' : 'rgba(99,14,212,0.15)'}`,
          }}>
          {isFallback && (
            <p className="text-[10px] mb-2 font-medium" style={{ color: '#22c55e', fontFamily: 'Geist,system-ui' }}>
              Using local intelligence
            </p>
          )}
          {!text && phase ? (
            <div className="space-y-2">
              {[100,82,65].map((w,i) => (
                <div key={i} className="h-3 rounded-full animate-pulse" style={{ width:`${w}%`, background:'rgba(99,14,212,0.08)' }}/>
              ))}
            </div>
          ) : (
            <p className="text-[14px] leading-relaxed" style={{ color: '#e5e2e1', fontFamily: 'Geist,system-ui' }}>
              {text}
              {streaming?.active && (
                <span className="inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse"
                  style={{ background: '#630ed4', borderRadius: 1 }}/>
              )}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function SuggestedChips({ context, onSelect }) {
  const chips = context?.type === 'chat'
    ? ['Summarize this chat', 'What should I reply?', 'What\'s the mood?', 'Any action items?']
    : context?.type === 'group'
    ? ['What\'s being discussed?', 'Any unanswered questions?', 'Summarize for me', 'Mood check']
    : ['What can you help with?', 'Help me write something', 'Key insights?'];
  return (
    <div className="flex flex-wrap gap-2 mb-4 px-1">
      {chips.map(c => (
        <button key={c} onClick={() => onSelect(c)}
          className="px-3 py-1.5 rounded-full text-[12px] font-medium transition-all active:scale-95"
          style={{ background:'rgba(99,14,212,0.07)', border:'1px solid rgba(99,14,212,0.18)', color:'#630ed4', fontFamily:'Geist,system-ui' }}>
          {c}
        </button>
      ))}
    </div>
  );
}

export default function UnifyAIOverlay() {
  const {
    overlayOpen, overlayContext, overlayHistory, overlayStreaming,
    closeOverlay, appendOverlayHistory, setOverlayStreaming,
  } = useAIStore();

  const [input, setInput]         = useState('');
  const [currentPhase, setPhase]  = useState(null);
  const [streamText, setStreamText] = useState('');
  const [isFallback, setIsFallback] = useState(false);
  const [isSynthesis, setIsSynthesis] = useState(false);

  const abortRef  = useRef(null);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => { if (overlayOpen) setTimeout(() => inputRef.current?.focus(), 300); }, [overlayOpen]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [overlayHistory, streamText]);

  const buildContext = useCallback(() => buildChatContextString(overlayContext), [overlayContext]);

  // Build an instant local answer for common questions
  const buildLocalAnswer = useCallback((question) => {
    const msgs = overlayContext?.data?.messages;
    if (!msgs?.length) return null;
    const q = question.toLowerCase();
    const mood = analyzeConversationMood(msgs);
    const keywords = extractKeywords(msgs, 5);

    if (q.includes('mood') || q.includes('feel') || q.includes('vibe')) {
      const desc = { positive:'positive and upbeat', negative:'tense', urgent:'urgent', casual:'casual', active:'lively', inquisitive:'full of questions', quiet:'quiet' };
      return `The mood is ${desc[mood] || mood}${keywords.length ? `. Main topics: ${keywords.slice(0,3).join(', ')}` : ''}.`;
    }
    if (q.includes('summar')) return localChatSummary(msgs, overlayContext.data?.partnerName || overlayContext.data?.groupName || 'this chat');
    if (q.includes('topic') || q.includes('about') || q.includes('discuss')) {
      return keywords.length ? `Main topics: ${keywords.join(', ')}.` : 'No clear topics yet.';
    }
    return null;
  }, [overlayContext]);

  const send = useCallback(async (question) => {
    const q = (question || input).trim();
    if (!q || overlayStreaming) return;
    setInput('');
    appendOverlayHistory({ role: 'user', text: q });

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const context = buildContext();
    const localAnswer = buildLocalAnswer(q);
    const synthesis = shouldSynthesize(q + (context || ''));

    setOverlayStreaming(true);
    setPhase('thinking');
    setStreamText('');
    setIsFallback(false);
    setIsSynthesis(synthesis);

    try {
      await overlayAsk({
        question: q,
        context,
        signal: abortRef.current.signal,
        onProgress: ({ phase }) => { if (phase) setPhase(phase); },
        onDone: (text, fallback) => {
          setStreamText('');
          setPhase('done');
          setOverlayStreaming(false);
          appendOverlayHistory({ role: 'assistant', text, isFallback: !!fallback });
        },
        onError: () => {
          const fallback = localAnswer || 'Could not process right now.';
          setStreamText('');
          setPhase('done');
          setOverlayStreaming(false);
          appendOverlayHistory({ role: 'assistant', text: fallback, isFallback: true });
        },
      });
    } catch {
      setOverlayStreaming(false);
      setPhase(null);
    }
  }, [input, overlayStreaming, buildContext, buildLocalAnswer, appendOverlayHistory, setOverlayStreaming]);

  const stop = () => {
    abortRef.current?.abort();
    setOverlayStreaming(false);
    setPhase(null);
    setStreamText('');
  };

  if (!overlayOpen) return null;

  const contextLabel = overlayContext?.type === 'chat'  ? `Chat · ${overlayContext.data?.partnerName || ''}` :
                       overlayContext?.type === 'group' ? `Group · ${overlayContext.data?.groupName  || ''}` : null;

  return (
    <>
      <div className="fixed inset-0 z-[400]" style={{ background:'rgba(0,0,0,0.6)', backdropFilter:'blur(8px)' }} onClick={closeOverlay}/>
      <div className="fixed bottom-0 left-0 right-0 z-[401] flex flex-col"
        style={{
          maxHeight:'88vh',
          background:'rgba(12,12,12,0.95)',
          backdropFilter:'blur(40px)',
          WebkitBackdropFilter:'blur(40px)',
          borderTop:'1px solid rgba(255,255,255,0.06)',
          borderRadius:'28px 28px 0 0',
          animation:'unify-up 0.35s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
        <AmbientOrbs/>

        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 relative z-10">
          <div className="w-10 h-1 rounded-full" style={{ background:'rgba(255,255,255,0.12)' }}/>
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background:'rgba(99,14,212,0.12)', border:'1px solid rgba(99,14,212,0.25)' }}>
              <Sparkles size={16} style={{ color:'#630ed4' }}/>
            </div>
            <div>
              <h2 className="font-bold text-[15px]" style={{ color:'#630ed4', fontFamily:'Geist,system-ui', letterSpacing:'-0.02em' }}>
                UnifyAI
              </h2>
              <p className="text-[10px] mt-0.5" style={{ color:'rgba(203,195,215,0.4)', fontFamily:'Geist,system-ui' }}>
                {contextLabel || 'Intelligent assistant'}
              </p>
            </div>
          </div>
          <button onClick={closeOverlay}
            className="w-8 h-8 rounded-full flex items-center justify-center active:scale-90"
            style={{ background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.08)' }}>
            <X size={15} style={{ color:'rgba(229,226,225,0.6)' }}/>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-2 relative z-10" style={{ minHeight:120, maxHeight:'56vh' }}>
          {overlayHistory.length === 0 && !overlayStreaming && (
            <SuggestedChips context={overlayContext} onSelect={q => send(q)}/>
          )}
          {overlayHistory.map((msg, i) => (
            <MessageBubble key={i} role={msg.role} text={msg.text} isFallback={msg.isFallback}/>
          ))}
          {overlayStreaming && (
            <MessageBubble
              role="assistant"
              text={streamText}
              phase={currentPhase}
              isFallback={isFallback}
              streaming={{ active: true, isSynthesis }}
            />
          )}
          <div ref={bottomRef}/>
        </div>

        {/* Input */}
        <div className="px-4 pb-6 pt-3 relative z-10">
          <div className="flex items-end gap-3 rounded-2xl px-4 py-3"
            style={{ background:'rgba(28,28,28,0.8)', backdropFilter:'blur(20px)', border:'1px solid rgba(99,14,212,0.15)' }}>
            <textarea ref={inputRef} value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder="Ask anything…"
              rows={1} className="flex-1 bg-transparent resize-none outline-none text-[15px] leading-relaxed"
              style={{ color:'#e5e2e1', fontFamily:'Geist,system-ui', scrollbarWidth:'none', maxHeight:100, caretColor:'#630ed4' }}/>
            <button onClick={overlayStreaming ? stop : send}
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all active:scale-90"
              style={{
                background: overlayStreaming ? 'rgba(255,180,180,0.1)' : 'rgba(99,14,212,0.15)',
                border: `1px solid ${overlayStreaming ? 'rgba(255,100,100,0.3)' : 'rgba(99,14,212,0.3)'}`,
              }}>
              {overlayStreaming
                ? <div className="w-3 h-3 rounded-sm" style={{ background:'#ffb4ab' }}/>
                : <Send size={15} style={{ color:'#630ed4' }}/>}
            </button>
          </div>
        </div>
      </div>
      <style>{`@keyframes unify-up { from { transform:translateY(100%); opacity:0; } to { transform:translateY(0); opacity:1; } }`}</style>
    </>
  );
}
