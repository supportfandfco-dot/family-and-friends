// ═══════════════════════════════════════════════════════════
//  MediaIntelligence — AI image analysis with cinematic UI
//  Scanning animation · Floating tags · Streaming analysis
// ═══════════════════════════════════════════════════════════
import { useState, useEffect, useRef } from 'react';
import { Sparkles, X, Copy, Check, Wand2 } from 'lucide-react';
import { analyzeImageBase64, generateCaption } from './unifyService';
import useAIStore from './useAIStore';

// ── Scanning line animation ──────────────────────────────────
function ScanLine({ active }) {
  if (!active) return null;
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl z-20">
      <div className="absolute left-0 right-0 h-0.5 opacity-80"
        style={{
          background: 'linear-gradient(90deg, transparent, #4cd7f6, transparent)',
          boxShadow: '0 0 12px #4cd7f6',
          animation: 'scan-line 2s ease-in-out infinite',
        }}/>
      {/* Grid overlay */}
      <div className="absolute inset-0 opacity-10"
        style={{
          backgroundImage: 'linear-gradient(rgba(76,215,246,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(76,215,246,0.5) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}/>
    </div>
  );
}

// ── Floating tag ─────────────────────────────────────────────
function FloatingTag({ label, icon, color, style }) {
  return (
    <div className="absolute flex items-center gap-1.5 px-3 py-1.5 rounded-full animate-fade-in"
      style={{
        background: 'rgba(255,255,255,0.12)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(255,255,255,0.2)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        fontSize: 12,
        color: 'white',
        fontFamily: 'Geist, system-ui',
        fontWeight: 600,
        ...style,
      }}>
      {icon && <span style={{ color, fontSize: 14 }}>{icon}</span>}
      {label}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────
export default function MediaIntelligence({ imageBase64, mimeType = 'image/jpeg', onClose, onCaptionReady }) {
  const { setMediaAnalysis } = useAIStore();
  const [analysisText, setAnalysisText] = useState('');
  const [caption, setCaption] = useState('');
  const [loading, setLoading] = useState(false);
  const [captionLoading, setCaptionLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [tags, setTags] = useState([]);
  const [done, setDone] = useState(false);
  const [copiedCaption, setCopiedCaption] = useState(false);
  const abortRef = useRef(null);

  // Convert a Firebase Storage URL or data-URL into raw base64 + mime
  const prepareImage = async (src) => {
    if (src.startsWith('http://') || src.startsWith('https://')) {
      const res  = await fetch(src);
      const blob = await res.blob();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve({ b64: reader.result.split(',')[1], mime: blob.type || 'image/jpeg' });
        reader.readAsDataURL(blob);
      });
    }
    const b64  = src.includes(',') ? src.split(',')[1] : src;
    const mime = src.startsWith('data:') ? src.split(';')[0].split(':')[1] : mimeType;
    return { b64, mime };
  };

  useEffect(() => {
    if (!imageBase64) return;
    setScanning(true);
    setLoading(true);
    setAnalysisText('');
    setTags([]);
    setDone(false);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;

    prepareImage(imageBase64).then(({ b64, mime }) => {
      if (signal.aborted) return;
      return analyzeImageBase64(
        b64, mime,
        (_, full) => { setAnalysisText(full); },
        (full) => {
          setAnalysisText(full);
          setLoading(false);
          setScanning(false);
          setDone(true);
          const words = full.split(' ').filter(w => w.length > 5).slice(0, 6);
          setTags(words.slice(0, 3));
        },
        signal,
      );
    }).catch(() => {
      setLoading(false);
      setScanning(false);
    });

    return () => abortRef.current?.abort();
  }, [imageBase64]);

  const handleGenerateCaption = async () => {
    if (!imageBase64) return;
    setCaptionLoading(true);
    setCaption('');
    try {
      const { b64, mime } = await prepareImage(imageBase64);
      const cap = await generateCaption(b64, mime);
      setCaption(cap);
      onCaptionReady?.(cap);
    } catch (e) {
      setCaption(e?.message || 'Could not generate caption.');
    } finally {
      setCaptionLoading(false);
    }
  };

  const copyCaption = () => {
    navigator.clipboard.writeText(caption).catch(() => {});
    setCopiedCaption(true);
    setTimeout(() => setCopiedCaption(false), 2000);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Image with scan overlay */}
      <div className="relative rounded-2xl overflow-hidden"
        style={{
          aspectRatio: '4/3',
          border: '1px solid rgba(76,215,246,0.3)',
          boxShadow: scanning ? '0 0 30px rgba(76,215,246,0.2)' : '0 0 20px rgba(208,188,255,0.15)',
          transition: 'box-shadow 0.5s',
        }}>
        <img src={imageBase64} alt="" className="w-full h-full object-cover"/>
        <ScanLine active={scanning}/>

        {/* Floating tags */}
        {done && tags[0] && (
          <FloatingTag label={tags[0]} icon="◆" color="#4cd7f6" style={{ top: '12%', left: '8%', animationDelay: '0.2s' }}/>
        )}
        {done && tags[1] && (
          <FloatingTag label={tags[1]} icon="◈" color="#d0bcff" style={{ top: '45%', right: '6%', animationDelay: '0.5s' }}/>
        )}
        {done && tags[2] && (
          <FloatingTag label={tags[2]} icon="◉" color="#ffb0cd" style={{ bottom: '20%', left: '15%', animationDelay: '0.8s' }}/>
        )}

        {/* Scanning indicator */}
        {scanning && (
          <div className="absolute bottom-3 left-0 right-0 flex justify-center">
            <div className="flex items-center gap-2 px-4 py-2 rounded-full"
              style={{ background: 'rgba(14,14,14,0.8)', backdropFilter: 'blur(16px)', border: '1px solid rgba(76,215,246,0.3)' }}>
              <div className="w-1.5 h-1.5 rounded-full animate-ping" style={{ background: '#4cd7f6' }}/>
              <span className="text-[11px] font-bold tracking-widest" style={{ color: '#4cd7f6', fontFamily: 'Geist, system-ui' }}>
                ANALYZING
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Analysis block */}
      <div className="rounded-2xl p-4"
        style={{
          background: 'rgba(14,14,14,0.7)',
          backdropFilter: 'blur(24px)',
          border: '1px solid rgba(208,188,255,0.12)',
          boxShadow: '0 0 20px rgba(208,188,255,0.08)',
        }}>
        <div className="flex items-center gap-2 mb-3">
          <Sparkles size={13} style={{ color: '#d0bcff' }}/>
          <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: '#d0bcff', fontFamily: 'Geist, system-ui', letterSpacing: '0.12em' }}>
            UnifyAI Analysis
          </span>
        </div>

        {loading && !analysisText ? (
          <div className="space-y-2">
            {[100, 85, 70].map((w, i) => (
              <div key={i} className="h-3 rounded-full animate-pulse"
                style={{ width: `${w}%`, background: 'rgba(208,188,255,0.08)' }}/>
            ))}
          </div>
        ) : (
          <p className="text-[14px] leading-relaxed" style={{ color: '#e5e2e1', fontFamily: 'Geist, system-ui' }}>
            {analysisText}
            {loading && <span className="inline-block w-0.5 h-3.5 ml-0.5 align-middle animate-pulse" style={{ background: '#d0bcff', borderRadius: 1 }}/>}
          </p>
        )}
      </div>

      {/* Caption generator */}
      <div className="rounded-2xl p-4"
        style={{
          background: 'rgba(14,14,14,0.6)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,176,205,0.12)',
        }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Wand2 size={13} style={{ color: '#ffb0cd' }}/>
            <span className="text-[11px] font-bold tracking-widest uppercase" style={{ color: '#ffb0cd', fontFamily: 'Geist, system-ui', letterSpacing: '0.12em' }}>
              Caption Generator
            </span>
          </div>
          {caption && (
            <button onClick={copyCaption}
              className="w-7 h-7 rounded-lg flex items-center justify-center active:scale-90"
              style={{ background: 'rgba(255,176,205,0.1)' }}>
              {copiedCaption ? <Check size={12} style={{ color: '#ffb0cd' }}/> : <Copy size={12} style={{ color: '#ffb0cd' }}/>}
            </button>
          )}
        </div>

        {caption ? (
          <p className="text-[14px] leading-relaxed mb-3" style={{ color: '#e5e2e1', fontFamily: 'Geist, system-ui' }}>
            "{caption}"
          </p>
        ) : (
          <p className="text-[13px] mb-3" style={{ color: 'rgba(203,195,215,0.4)', fontFamily: 'Geist, system-ui' }}>
            Generate an AI caption to share with your status or message.
          </p>
        )}

        <button onClick={handleGenerateCaption} disabled={captionLoading}
          className="w-full py-2.5 rounded-xl text-[13px] font-semibold transition-all active:scale-95"
          style={{
            background: captionLoading ? 'rgba(255,176,205,0.05)' : 'rgba(255,176,205,0.12)',
            border: '1px solid rgba(255,176,205,0.2)',
            color: '#ffb0cd',
            fontFamily: 'Geist, system-ui',
          }}>
          {captionLoading ? 'Generating...' : caption ? 'Regenerate Caption' : 'Generate Caption'}
        </button>
      </div>

      <style>{`
        @keyframes scan-line {
          0%   { top: 0%;   opacity: 0; }
          10%  { opacity: 0.8; }
          90%  { opacity: 0.8; }
          100% { top: 100%; opacity: 0; }
        }
      `}</style>
    </div>
  );
}
