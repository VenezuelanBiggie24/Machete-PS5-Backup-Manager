// PlayStation Legacy & PS5 UI Sound Engine (Synthesized via Web Audio API)
const getAudioContext = (() => {
  let ctx: AudioContext | null = null;
  return () => {
    if (!ctx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      ctx = new AudioContextClass();
    }
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  };
})();

// Pre-allocated white noise buffer for blade/machete sound to avoid memory allocations
let cachedNoiseBuffer: AudioBuffer | null = null;
const getNoiseBuffer = (ctx: AudioContext): AudioBuffer => {
  if (!cachedNoiseBuffer || cachedNoiseBuffer.sampleRate !== ctx.sampleRate) {
    const bufferSize = Math.floor(ctx.sampleRate * 0.15);
    cachedNoiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = cachedNoiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }
  }
  return cachedNoiseBuffer;
};

// Throttle hover sounds to avoid audio distortion during fast cursor movements
let lastHoverTime = 0;

/**
 * PS Tile Navigation (Hover / Focus sound)
 * Warm, glassy acoustic click inspired by PS5 / PS4 tile focus.
 */
export const playHoverSound = () => {
  try {
    const nowMs = performance.now();
    if (nowMs - lastHoverTime < 45) return; // 45ms throttle
    lastHoverTime = nowMs;

    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.045);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1400, now);

    gain.gain.setValueAtTime(0.035, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.045);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.05);

    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  } catch (_) {}
};

/**
 * PlayStation 'X' Confirm / Selection Chime
 * Dual harmonic glass chime (A5 + E6) with smooth decay.
 */
export const playSelectSound = () => {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    const playHarmonic = (freq: number, gainVol: number, decay: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(gainVol, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + decay);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    };

    playHarmonic(880, 0.05, 0.22);    // A5
    playHarmonic(1318.5, 0.035, 0.3);  // E6
    playHarmonic(1760, 0.015, 0.35);   // A6
  } catch (_) {}
};

/**
 * PlayStation 'Circle' Cancel / Dismiss Sound
 * Soft downward glassy drop.
 */
export const playCancelSound = () => {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(329.63, now + 0.12); // E4

    gain.gain.setValueAtTime(0.04, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } catch (_) {}
};

/**
 * PS5 Atmospheric Boot / Scan Ambient Sweep
 * Dreamy multi-layered harmonic chord wash when scanning drives.
 */
export const playScanSound = () => {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    // PS5 Ambient Chord: C5, E5, G5, B5, D6
    const chord = [523.25, 659.25, 783.99, 987.77, 1174.66];

    chord.forEach((freq, index) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      const startTime = now + index * 0.035;
      const duration = 0.65;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(2500, startTime);
      filter.frequency.exponentialRampToValueAtTime(800, startTime + duration);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.03, startTime + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);

      osc.onended = () => {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    });
  } catch (_) {}
};

/**
 * Machetear Sound (Cyberpunk PS Blade Glitch / Hard Delete)
 * Visceral digital blade slice followed by a deep sub impact.
 */
export const playMacheteSound = () => {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // 1. Digital Blade Whoosh (Pre-allocated Filtered Noise Burst)
    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 4.0;
    filter.frequency.setValueAtTime(3200, now);
    filter.frequency.exponentialRampToValueAtTime(400, now + 0.12);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.08, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);

    whiteNoise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    whiteNoise.start(now);
    whiteNoise.stop(now + 0.12);

    // 2. Sub-Bass Impact (PS Glitch Punch)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(120, now);
    subOsc.frequency.exponentialRampToValueAtTime(30, now + 0.2);

    subGain.gain.setValueAtTime(0.09, now);
    subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.2);

    whiteNoise.onended = () => {
      whiteNoise.disconnect();
      filter.disconnect();
      noiseGain.disconnect();
    };

    subOsc.onended = () => {
      subOsc.disconnect();
      subGain.disconnect();
    };
  } catch (_) {}
};

/**
 * PlayStation Trophy / Transfer Complete Chime
 * Sparkling crystal arpeggio tribute to the PlayStation Trophy chime.
 */
export const playSuccessSound = () => {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    // Ascending crystal notes: E5, G#5, B5, E6
    const notes = [659.25, 830.61, 987.77, 1318.51];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = now + i * 0.07;
      const duration = 0.55;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.045, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  } catch (_) {}
};
