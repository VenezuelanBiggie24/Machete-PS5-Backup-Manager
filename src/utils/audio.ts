// Global Mute State
let isMuted = typeof window !== 'undefined' && localStorage.getItem('machete_audio_muted') === 'true';

export const isAudioMuted = () => isMuted;

export const setAudioMuted = (muted: boolean) => {
  isMuted = muted;
  try {
    localStorage.setItem('machete_audio_muted', String(muted));
  } catch (_) {}
  if (muted) {
    stopBgmTheme();
  }
};

// PlayStation Legacy & PS5 UI Sound Engine (Synthesized via Web Audio API)
let sharedAudioCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext => {
  if (!sharedAudioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    sharedAudioCtx = new AudioContextClass();
  }
  if (sharedAudioCtx.state === 'suspended') {
    sharedAudioCtx.resume().catch(() => {});
  }
  return sharedAudioCtx;
};

// Automatic WebKit / Safari User Interaction Audio Unlocker
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === 'suspended') {
        ctx.resume().then(() => {
          window.removeEventListener('pointerdown', unlockAudio);
          window.removeEventListener('click', unlockAudio);
          window.removeEventListener('keydown', unlockAudio);
        }).catch(() => {});
      } else {
        window.removeEventListener('pointerdown', unlockAudio);
        window.removeEventListener('click', unlockAudio);
        window.removeEventListener('keydown', unlockAudio);
      }
    } catch (_) {}
  };

  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
}

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

let lastHoverTime = 0;
let hoverPitchIndex = 0;
const HOVER_PITCHES = [587.33, 659.25, 739.99, 880.00, 987.77, 880.00, 739.99]; // Pentatonic D major sweep

export const playHoverSound = () => {
  try {
    if (isMuted) return;
    const nowMs = performance.now();
    if (nowMs - lastHoverTime < 35) return; // 35ms silky throttle for smooth card sweeping
    lastHoverTime = nowMs;

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    
    // Organic tactile pitch sweep across game boxes
    hoverPitchIndex = (hoverPitchIndex + 1) % HOVER_PITCHES.length;
    const baseFreq = HOVER_PITCHES[hoverPitchIndex];

    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.linearRampToValueAtTime(baseFreq * 0.65, now + 0.05);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.008);
    gain.gain.linearRampToValueAtTime(0.0001, now + 0.055);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.06);

    osc.onended = () => {
      osc.disconnect();
      filter.disconnect();
      gain.disconnect();
    };
  } catch (e) {
    console.error("playHoverSound error:", e);
  }
};

/**
 * Authentic PlayStation 5 Game Focus / Selection Swell
 * The iconic airy crystalline shimmer + resonant harmonic chime that plays
 * when selecting a game on the PS5 home screen before starting it.
 */
export const playPS5GameSelectSound = () => {
  try {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    // 1. Warm Sub-Bass Focus Thump (Controller / Console Haptic resonance)
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(130, now);
    subOsc.frequency.linearRampToValueAtTime(35, now + 0.22);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.25, now + 0.02);
    subGain.gain.linearRampToValueAtTime(0.0001, now + 0.22);

    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(now);
    subOsc.stop(now + 0.25);

    subOsc.onended = () => {
      subOsc.disconnect();
      subGain.disconnect();
    };

    // 2. The Airy Crystalline Whoosh Swell (Filtered pink noise sweep)
    const noise = ctx.createBufferSource();
    noise.buffer = getNoiseBuffer(ctx);
    const noiseFilter = ctx.createBiquadFilter();
    const noiseGain = ctx.createGain();

    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(700, now);
    noiseFilter.frequency.linearRampToValueAtTime(2800, now + 0.15);
    noiseFilter.Q.setValueAtTime(2.5, now);

    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.12, now + 0.06);
    noiseGain.gain.linearRampToValueAtTime(0.0001, now + 0.26);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + 0.28);

    noise.onended = () => {
      try {
        noise.disconnect();
        noiseFilter.disconnect();
        noiseGain.disconnect();
      } catch (_) {}
    };

    // 3. Iconic PlayStation 5 Crystal Harmonic Chimes (Ethereal Chord: D5, A5, F#6, D7)
    const ps5Harmonics = [
      { freq: 587.33, vol: 0.20, delay: 0.00, dur: 0.55 }, // D5 (Fundamental base)
      { freq: 880.00, vol: 0.22, delay: 0.02, dur: 0.65 }, // A5 (Fifth resonance)
      { freq: 1479.98, vol: 0.16, delay: 0.04, dur: 0.70 }, // F#6 (Major third shimmer)
      { freq: 2349.32, vol: 0.10, delay: 0.06, dur: 0.80 }, // D7 (Crystal sparkle)
    ];

    ps5Harmonics.forEach(({ freq, vol, delay, dur }) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      const startTime = now + delay;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);
      osc.frequency.linearRampToValueAtTime(freq + 4, startTime + dur);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(3600, startTime);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(vol, startTime + 0.025);
      gain.gain.linearRampToValueAtTime(0.0001, startTime + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + dur);

      osc.onended = () => {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
    });
  } catch (e) {
    console.error("playPS5GameSelectSound error:", e);
  }
};

/**
 * PlayStation 'X' Confirm / Selection Chime
 * Dual harmonic glass chime (A5 + E6) with smooth decay.
 */
export const playSelectSound = () => {
  try {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    const playHarmonic = (freq: number, gainVol: number, decay: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(gainVol, now + 0.01);
      gain.gain.linearRampToValueAtTime(0.0001, now + decay);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + decay);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    };

    playHarmonic(880, 0.20, 0.25);    // A5
    playHarmonic(1318.5, 0.15, 0.32); // E6
    playHarmonic(1760, 0.08, 0.38);   // A6
  } catch (e) {
    console.error("playSelectSound error:", e);
  }
};

/**
 * PlayStation 'Circle' Cancel / Dismiss Sound
 * Soft downward glassy drop.
 */
export const playCancelSound = () => {
  try {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.linearRampToValueAtTime(329.63, now + 0.12); // E4

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.01);
    gain.gain.linearRampToValueAtTime(0.0001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);

    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
  } catch (e) {
    console.error("playCancelSound error:", e);
  }
};



/**
 * PS5 Atmospheric Boot / Scan Ambient Sweep
 * Dreamy multi-layered harmonic chord wash when scanning drives.
 */
export const playScanSound = () => {
  try {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
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
      filter.frequency.linearRampToValueAtTime(800, startTime + duration);

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.08, startTime + 0.08);
      gain.gain.linearRampToValueAtTime(0.0001, startTime + duration);

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
  } catch (e) {
    console.error("playScanSound error:", e);
  }
};

/**
 * Machetear Sound (Cyberpunk PS Blade Glitch / Hard Delete)
 * Visceral digital blade slice followed by a deep sub impact.
 */
export const playMacheteSound = () => {
  try {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;

    // 1. Digital Blade Whoosh (Pre-allocated Filtered Noise Burst)
    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = getNoiseBuffer(ctx);

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 4.0;
    filter.frequency.setValueAtTime(3200, now);
    filter.frequency.linearRampToValueAtTime(400, now + 0.12);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(0.18, now + 0.01);
    noiseGain.gain.linearRampToValueAtTime(0.0001, now + 0.12);

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
    subOsc.frequency.linearRampToValueAtTime(30, now + 0.2);

    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.20, now + 0.02);
    subGain.gain.linearRampToValueAtTime(0.0001, now + 0.2);

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
  } catch (e) {
    console.error("playMacheteSound error:", e);
  }
};

/**
 * PlayStation Trophy / Transfer Complete Chime
 * Sparkling crystal arpeggio tribute to the PlayStation Trophy chime.
 */
export const playSuccessSound = () => {
  try {
    if (isMuted) return;
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
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

      gain.gain.setValueAtTime(0.001, startTime);
      gain.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
      gain.gain.linearRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);

      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
    });
  } catch (e) {
    console.error("playSuccessSound error:", e);
  }
};

/**
 * PS5 Game Background Music / Soundtrack Player (snd0.at9)
 */
let bgmSourceNode: AudioBufferSourceNode | null = null;
let bgmGainNode: GainNode | null = null;
let currentBgmAudio: HTMLAudioElement | null = null;
let currentBgmPath: string | null = null;
let currentBlobUrl: string | null = null;

export const isBgmPlaying = () => {
  if (bgmSourceNode) return true;
  return currentBgmAudio !== null && !currentBgmAudio.paused;
};

export const playBgmTheme = async (audioDataUri: string, gamePath?: string) => {
  try {
    if (isMuted) return;
    if (currentBgmPath === gamePath && isBgmPlaying()) {
      return;
    }
    stopBgmTheme(false);
    currentBgmPath = gamePath || null;

    // Convert data URI to ArrayBuffer
    const parts = audioDataUri.split(',');
    if (parts.length < 2) return;
    const base64Data = parts[1];
    if (!base64Data) return;

    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {});
    }

    // Try Web Audio API decodeAudioData for low-latency, hardware-accelerated playback
    try {
      const buffer = await ctx.decodeAudioData(bytes.buffer.slice(0));
      const source = ctx.createBufferSource();
      const gain = ctx.createGain();

      source.buffer = buffer;
      source.loop = true;

      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.65, now + 0.4);

      source.connect(gain);
      gain.connect(ctx.destination);

      source.start(now);
      bgmSourceNode = source;
      bgmGainNode = gain;
      return;
    } catch (decodeErr) {
      console.warn("Web Audio decodeAudioData failed, falling back to Blob audio element:", decodeErr);
    }

    // Fallback: Blob URL on HTMLAudioElement
    const blob = new Blob([bytes], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    currentBlobUrl = url;
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0.65;
    currentBgmAudio = audio;
    await audio.play().catch((e) => console.warn("Blob audio playback warning:", e));
  } catch (e) {
    console.error("playBgmTheme error:", e);
  }
};

export const stopBgmTheme = (smooth = true) => {
  currentBgmPath = null;

  // 1. Stop Web Audio source
  if (bgmSourceNode && bgmGainNode) {
    const source = bgmSourceNode;
    const gain = bgmGainNode;
    bgmSourceNode = null;
    bgmGainNode = null;

    if (!smooth) {
      try {
        source.stop();
        source.disconnect();
        gain.disconnect();
      } catch (_) {}
    } else {
      try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0.001, now + 0.3);
        setTimeout(() => {
          try {
            source.stop();
            source.disconnect();
            gain.disconnect();
          } catch (_) {}
        }, 350);
      } catch (_) {
        try {
          source.stop();
          source.disconnect();
          gain.disconnect();
        } catch (_) {}
      }
    }
  }

  // 2. Stop HTMLAudioElement fallback
  if (currentBgmAudio) {
    const audio = currentBgmAudio;
    currentBgmAudio = null;
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
    } catch (_) {}
  }

  // Revoke Blob URL
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }
};


