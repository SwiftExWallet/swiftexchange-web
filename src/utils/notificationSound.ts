/**
 * Studio-Grade Notification Sound Synthesizer using Web Audio API.
 * Uses acoustic physical modeling (inharmonic partials, mallet strike transient,
 * resonant low-pass filter, and celestial harmonic chords) to produce an ultra-luxurious,
 * organic feel (similar to Apple Pay, Linear, and luxury fintech apps) with 0ms latency.
 */

export type SoundType =
  | 'success'
  | 'error'
  | 'warning'
  | 'info'
  | 'EVM_SWAP'
  | 'SEND'
  | 'RECEIVE'
  | 'BRIDGE'
  | 'STELLAR'
  | 'DYDX'
  | 'SYSTEM'
  | string;

export type SoundPreset = 'luxury_chime' | 'glass_pop' | 'velvet_bell';

let audioCtx: AudioContext | null = null;
let lastPlayTimestamp = 0;
const MIN_SOUND_INTERVAL_MS = 100;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;

  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextClass) return null;

    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContextClass();
    }

    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    return audioCtx;
  } catch {
    return null;
  }
}

// Global user gesture unlock listener for modern browser autoplay policies
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext();
      if (ctx && ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }
    } catch {
      // Ignore
    }
  };

  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
}

/**
 * Creates a soft acoustic mallet strike transient (gives tactile, physical presence).
 */
function createMalletTransient(ctx: AudioContext, destination: AudioNode, startTime: number) {
  try {
    const bufferSize = Math.max(128, Math.floor(ctx.sampleRate * 0.015)); // 15ms buffer
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < bufferSize; i++) {
      // Soft noise with fast exponential decay
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.25));
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, startTime);
    filter.Q.setValueAtTime(2.0, startTime);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.06, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.015);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    noise.start(startTime);
    noise.stop(startTime + 0.015);
  } catch {
    // Graceful fallback if buffer creation fails
  }
}

/**
 * Synthesizes an organic acoustic bell/celeste note with natural inharmonic overtones.
 */
function playAcousticNote(
  ctx: AudioContext,
  destination: AudioNode,
  frequency: number,
  startTime: number,
  volume: number,
  decay: number
) {
  // Acoustic bell partials (fundamental, octave, inharmonic crystal, sparkle)
  const partials = [
    { ratio: 1.0, gain: 1.0, decayMult: 1.0 }, // Fundamental
    { ratio: 2.0, gain: 0.3, decayMult: 0.75 }, // Octave overtone
    { ratio: 2.76, gain: 0.18, decayMult: 0.55 }, // Marimba/celeste inharmonic crystal
    { ratio: 4.07, gain: 0.08, decayMult: 0.4 }, // High sparkle overtone
  ];

  // Soft warming low-pass filter to prevent digital sharpness
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(Math.min(frequency * 4.5, 4800), startTime);
  filter.Q.setValueAtTime(1.2, startTime);
  filter.connect(destination);

  partials.forEach(p => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency * p.ratio, startTime);

    const noteDecay = decay * p.decayMult;
    const initialGain = Math.max(0.0001, volume * p.gain);

    gain.gain.setValueAtTime(0.0001, startTime);
    gain.gain.linearRampToValueAtTime(initialGain, startTime + 0.004); // Fast 4ms warm attack
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + noteDecay);

    osc.connect(gain);
    gain.connect(filter);

    osc.start(startTime);
    osc.stop(startTime + noteDecay);
  });
}

/**
 * Ultra-Luxurious Ascending Fintech Triad (F5 -> A5 -> C6 with high shimmer).
 * Sounds prestigious, clean, and satisfying like high-end fintech confirmations.
 */
function playLuxurySuccess(ctx: AudioContext) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0.32, now);

  createMalletTransient(ctx, master, now);

  // Arpeggiated warm chord: Db5 (554.37Hz) -> F5 (698.46Hz) -> Ab5 (830.61Hz) -> C6 (1046.5Hz)
  const notes = [
    { f: 554.37, time: 0.0, vol: 0.4, decay: 0.55 },
    { f: 698.46, time: 0.07, vol: 0.5, decay: 0.65 },
    { f: 830.61, time: 0.14, vol: 0.6, decay: 0.75 },
    { f: 1046.5, time: 0.21, vol: 0.75, decay: 0.95 },
  ];

  notes.forEach(n => {
    playAcousticNote(ctx, master, n.f, now + n.time, n.vol, n.decay);
  });
}

/**
 * Silky, modern droplet / glass ping for general notifications and system events.
 */
function playGlassInfo(ctx: AudioContext) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0.3, now);

  createMalletTransient(ctx, master, now);

  // Double harmonic chime (E5 -> B5, very clean and discrete)
  playAcousticNote(ctx, master, 659.25, now, 0.45, 0.35); // E5
  playAcousticNote(ctx, master, 987.77, now + 0.05, 0.65, 0.55); // B5
}

/**
 * Warm, resonant velvet bell for alerts & warnings.
 */
function playVelvetWarning(ctx: AudioContext) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0.28, now);

  createMalletTransient(ctx, master, now);

  // Gentle minor-third chord with long velvet decay: G4 + Bb4
  playAcousticNote(ctx, master, 392.0, now, 0.55, 0.65); // G4
  playAcousticNote(ctx, master, 466.16, now + 0.03, 0.55, 0.65); // Bb4
  playAcousticNote(ctx, master, 783.99, now + 0.06, 0.45, 0.5); // G5 soft harmonic
}

/**
 * Soft, discrete double wooden tuck for errors.
 * Informative without causing ear fatigue or unpleasant harshness.
 */
function playDiscreteError(ctx: AudioContext) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.connect(ctx.destination);
  master.gain.setValueAtTime(0.28, now);

  // Soft low acoustic taps (260Hz -> 200Hz)
  playAcousticNote(ctx, master, 277.18, now, 0.6, 0.22); // C#4
  playAcousticNote(ctx, master, 220.0, now + 0.12, 0.7, 0.35); // A3
}

/**
 * Trigger the premium notification sound for a given notification type.
 */
export function playNotificationSound(type: SoundType = 'info'): void {
  try {
    const now = Date.now();
    if (now - lastPlayTimestamp < MIN_SOUND_INTERVAL_MS) {
      return;
    }
    lastPlayTimestamp = now;

    const ctx = getAudioContext();
    if (!ctx) return;

    const playNotes = () => {
      const normalized = String(type).toLowerCase();

      if (
        normalized === 'success' ||
        normalized === 'send' ||
        normalized === 'receive' ||
        normalized === 'evm_swap' ||
        normalized.includes('filled') ||
        normalized.includes('order')
      ) {
        playLuxurySuccess(ctx);
      } else if (
        normalized === 'error' ||
        normalized.includes('fail') ||
        normalized.includes('reject')
      ) {
        playDiscreteError(ctx);
      } else if (normalized === 'warning') {
        playVelvetWarning(ctx);
      } else {
        playGlassInfo(ctx);
      }
    };

    if (ctx.state === 'suspended') {
      ctx.resume().then(playNotes).catch(playNotes);
    } else {
      playNotes();
    }
  } catch {
    // Audio synthesis failure should never crash the UI
  }
}
