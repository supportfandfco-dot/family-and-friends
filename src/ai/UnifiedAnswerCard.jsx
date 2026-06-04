// ═══════════════════════════════════════════════════════════
//  UnifiedAnswerCard — Triple-Engine Synthesis
//  Theme-aware: works in both light and dark mode
// ═══════════════════════════════════════════════════════════
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Sparkles, X, Copy, Check, ChevronDown, ChevronUp, Zap, ShieldCheck, Share2 } from 'lucide-react';
import { MODELS } from './unifyService';

function Shimmer({ width = '100%', height = 14 }) {
  return (
    <div className="rounded-full animate-pulse" style={{
      width, height,
      background: 'var(--hover)',
    }}/>
  );
}

function ModelCard({ model, result }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = MODELS[model];
  if (!cfg) return null;
  const hasText = result?.text;
  const isLoading = !result;
  const isError = result?.error;

  return (
    <div className="rounded-xl p-4 transition-all duration-300 cursor-pointer active:scale-[0.99]"
      style={{
        background: 'var(--hover)',
        border: '1px solid var(--border)',
      }}
      onClick={() => hasText && setExpanded(v => !v)}>
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `${cfg.color}18`, border: `1px solid ${cfg.color}33`, color: cfg.color }}>
          <span className="font-bold text-[14px]">{cfg.icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="font-bold text-sm text-[var(--text-primary)]">{cfg.label}</span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-[var(--text-secondary)]">{cfg.sublabel || 'AI'}</span>
          </div>
          {isLoading && (
            <div className="mt-1.5 space-y-1.5">
              <Shimmer width="90%"/>
              <Shimmer width="65%"/>
            </div>
          )}
          {isError && <p className="text-[12px] mt-1 text-red-400">Unavailable</p>}
          {hasText && (
            <div className={`text-sm text-[var(--text-secondary)] leading-snug mt-0.5 ${!expanded ? 'line-clamp-2' : ''} markdown-body`}>
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{result.text}</ReactMarkdown>
            </div>
          )}
        </div>
        {hasText && (
          expanded
            ? <ChevronUp size={14} className="text-[var(--text-secondary)] flex-shrink-0 mt-1"/>
            : <ChevronDown size={14} className="text-[var(--text-secondary)] flex-shrink-0 mt-1"/>
        )}
      </div>
    </div>
  );
}

function UnifiedBlock({ text, loading, error }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    if (!text) return;
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative rounded-xl p-5 transition-all duration-500"
      style={{
        background: 'var(--input-bg)',
        border: '1px solid var(--border)',
        boxShadow: '0 0 20px rgba(99,14,212,0.08)',
      }}>
      {/* Gradient border accent */}
      <div className="absolute inset-0 rounded-xl pointer-events-none" style={{
        padding: 1,
        background: 'linear-gradient(135deg, rgba(99,14,212,0.4), rgba(0,103,128,0.3))',
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
      }}/>

      {/* Header */}
      <div className="flex items-center gap-3 mb-4 relative z-10">
        <div className="flex -space-x-2">
          {Object.values(MODELS).map((m, i) => (
            <div key={m.id} className="w-8 h-8 rounded-full flex items-center justify-center border-2"
              style={{
                background: `${m.color}18`,
                borderColor: 'var(--sidebar-bg)',
                color: m.color,
                zIndex: 10 - i,
              }}>
              <span className="font-bold text-[12px]">{m.icon}</span>
            </div>
          ))}
        </div>
        <div>
          <span className="text-[12px] font-bold tracking-wide" style={{ color: '#630ed4' }}>
            Triple-Engine Synthesis
          </span>
          <p className="text-[11px] text-[var(--text-secondary)]">
            {Object.values(MODELS).map(m => m.label).join(' + ')}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="text-[14px] leading-relaxed text-[var(--text-primary)] relative z-10">
        {error ? (
          <p className="text-red-400 text-sm">{error}</p>
        ) : loading && !text ? (
          <div className="space-y-2">
            <Shimmer/>
            <Shimmer width="85%"/>
            <Shimmer width="70%"/>
          </div>
        ) : (
          <div className="markdown-body space-y-2">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || ''}</ReactMarkdown>
            {loading && (
              <span className="inline-block w-1.5 h-4 ml-1 align-middle animate-pulse bg-brand-500 rounded-sm"/>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-[var(--border)] flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          {loading ? (
            <>
              <Zap size={14} className="text-brand-500 animate-pulse"/>
              <span className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wider">
                Unifying Results...
              </span>
            </>
          ) : (
            <>
              <ShieldCheck size={14} className="text-green-500"/>
              <span className="text-[11px] font-bold text-[var(--text-secondary)]">Validated Synthesis</span>
            </>
          )}
        </div>
        {text && !loading && (
          <button onClick={copy}
            className="text-brand-500 hover:opacity-70 transition-opacity active:scale-95 p-1">
            {copied ? <Check size={15}/> : <Share2 size={15}/>}
          </button>
        )}
      </div>
    </div>
  );
}

export default function UnifiedAnswerCard({
  title,
  responses, // Ignore responses, keep only unified out
  unified,
  unifiedLoading,
  text,
  loading,
  error,
  onClose,
  className = '',
}) {
  const isMultiModel = !!responses;
  const finalLoading = isMultiModel ? unifiedLoading : loading;
  const finalText = isMultiModel ? unified : text;

  return (
    <div className={`relative ${className}`}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {title && (
            <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">{title}</h2>
          )}
        </div>
        {onClose && (
          <button onClick={onClose}
            className="p-1.5 rounded-full hover:bg-[var(--hover)] text-[var(--text-secondary)] transition-colors">
            <X size={15}/>
          </button>
        )}
      </div>

      <div className="relative rounded-xl p-5 transition-all duration-500"
        style={{
          background: 'var(--input-bg)',
          border: '1px solid var(--border)',
        }}>
        {/* Content */}
        <div className="text-[14px] leading-relaxed text-[var(--text-primary)] relative z-10">
          {error ? (
            <p className="text-red-400 text-sm">{error}</p>
          ) : finalLoading && !finalText ? (
            <div className="flex items-center gap-2 text-brand-500 font-medium">
              <Zap size={16} className="animate-pulse" />
              <span>Analyzing conversations...</span>
            </div>
          ) : (
            <div className="markdown-body space-y-2">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{finalText || ''}</ReactMarkdown>
              {finalLoading && (
                <span className="inline-block w-1.5 h-4 ml-1 align-middle animate-pulse bg-brand-500 rounded-sm"/>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
