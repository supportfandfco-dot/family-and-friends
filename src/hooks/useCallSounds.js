// ═══════════════════════════════════════════════════════
//  useCallSounds — Modern Ring & Outgoing Tones
//  Family & Friends  ·  Built by Ishrit Sachdeva
// ═══════════════════════════════════════════════════════
import { useRef, useEffect } from 'react';

let _ctx = null;
const getCtx = () => {
  if (!_ctx || _ctx.state === 'closed') {
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
};

// Incoming ring: warm two-tone bell chord, repeats every 2.8s
function createRing(ctx) {
  let stopped = false;
  // Master gain node — setting this to 0 instantly silences all connected oscillators
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(1, ctx.currentTime);
  masterGain.connect(ctx.destination);

  const playChord = () => {
    if (stopped) return;
    const now = ctx.currentTime;
    const tones = [
      { freq: 880, gain: 0.55, start: 0,    dur: 0.6 },
      { freq: 659, gain: 0.45, start: 0.05, dur: 0.5 },
      { freq: 523, gain: 0.35, start: 0.1,  dur: 0.45 },
      { freq: 440, gain: 0.55, start: 0.35, dur: 0.7 },
      { freq: 349, gain: 0.45, start: 0.40, dur: 0.6 },
      { freq: 262, gain: 0.35, start: 0.45, dur: 0.55 },
    ];
    tones.forEach(({ freq, gain: gv, start, dur }) => {
      const osc = ctx.createOscillator();
      const gn  = ctx.createGain();
      const t   = now + start;
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gn);
      gn.connect(masterGain);   // through master, not directly to destination
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(gv, t + 0.02);
      gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  };

  playChord();
  const id = setInterval(playChord, 2800);

  return () => {
    stopped = true;
    clearInterval(id);
    // Ramp master gain to 0 over 30ms — kills any already-scheduled future tones immediately
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.03);
    setTimeout(() => { try { masterGain.disconnect(); } catch {} }, 100);
  };
}

// Outgoing calling tone: smooth rising pulse, repeats every 1.6s
function createCallingTone(ctx) {
  let stopped = false;
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(1, ctx.currentTime);
  masterGain.connect(ctx.destination);

  const playPulse = () => {
    if (stopped) return;
    const now = ctx.currentTime;
    const pairs = [
      { startFreq: 380, endFreq: 480, gain: 0.40, start: 0,    dur: 0.4 },
      { startFreq: 460, endFreq: 560, gain: 0.35, start: 0.45, dur: 0.4 },
    ];
    pairs.forEach(({ startFreq, endFreq, gain: gv, start, dur }) => {
      const osc = ctx.createOscillator();
      const gn  = ctx.createGain();
      const t   = now + start;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(startFreq, t);
      osc.frequency.linearRampToValueAtTime(endFreq, t + dur);
      osc.connect(gn);
      gn.connect(masterGain);   // through master
      gn.gain.setValueAtTime(0, t);
      gn.gain.linearRampToValueAtTime(gv, t + 0.03);
      gn.gain.setValueAtTime(gv, t + dur - 0.05);
      gn.gain.linearRampToValueAtTime(0, t + dur + 0.04);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    });
  };

  playPulse();
  const id = setInterval(playPulse, 1600);

  return () => {
    stopped = true;
    clearInterval(id);
    // Kill all future scheduled audio immediately
    masterGain.gain.cancelScheduledValues(ctx.currentTime);
    masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.03);
    setTimeout(() => { try { masterGain.disconnect(); } catch {} }, 100);
  };
}

export function useCallSounds() {
  const stopRef = useRef(null);

  const stopSounds = () => {
    if (stopRef.current) { stopRef.current(); stopRef.current = null; }
  };

  const startRing = () => {
    stopSounds();
    try { stopRef.current = createRing(getCtx()); } catch {}
  };

  const startCalling = () => {
    stopSounds();
    try { stopRef.current = createCallingTone(getCtx()); } catch {}
  };

  useEffect(() => () => stopSounds(), []);

  return { startRing, startCalling, stopSounds };
}
