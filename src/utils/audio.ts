import { invoke } from '@tauri-apps/api/core';

// Global Mute State (Defaults to unmuted false)
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

export const getAudioContext = (): AudioContext => {
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!sharedAudioCtx || sharedAudioCtx.state === 'closed' || (sharedAudioCtx.state as string) === 'interrupted') {
    sharedAudioCtx = new AudioContextClass();
  }
  return sharedAudioCtx;
};

// Reliable WebKit / Chromium Audio Unlocker
export const unlockAudio = () => {
  try {
    let ctx = getAudioContext();
    if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
      ctx.resume().then(() => {
        // macOS WebKit inactivity zombie detection:
        // If it's still suspended after a successful resume resolution, the context is dead.
        if (ctx.state === 'suspended') {
          try { ctx.close(); } catch (_) {}
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          sharedAudioCtx = new AudioContextClass();
          sharedAudioCtx.resume().catch(() => {});
        }
      }).catch(() => {
        try { ctx.close(); } catch (_) {}
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        sharedAudioCtx = new AudioContextClass();
        sharedAudioCtx.resume().catch(() => {});
      });
    }

    // Play a single silent PCM sample to prime WebKit's hardware audio pipeline
    const buffer = ctx.createBuffer(1, 1, 22050);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(0);
  } catch (_) {}
};

if (typeof window !== 'undefined') {
  const handleUserInteraction = () => {
    unlockAudio();
  };

  window.addEventListener('pointerdown', handleUserInteraction, { passive: true });
  window.addEventListener('click', handleUserInteraction, { passive: true });
  window.addEventListener('keydown', handleUserInteraction, { passive: true });
  window.addEventListener('touchstart', handleUserInteraction, { passive: true });
  window.addEventListener('focus', handleUserInteraction, { passive: true });
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
    if (ctx.state === 'suspended' || (ctx.state as string) === 'interrupted') {
    }
    const now = ctx.currentTime + 0.008;
    
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
      try {
        osc.disconnect();
        filter.disconnect();
        gain.disconnect();
      } catch (_) {}
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
    unlockAudio();
    const ctx = getAudioContext();
    const now = ctx.currentTime + 0.01;

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
      try {
        subOsc.disconnect();
        subGain.disconnect();
      } catch (_) {}
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
        try {
          osc.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch (_) {}
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
 * Dual-Engine: Native OS CoreAudio/Process Player (Zero WebKit Restrictions) + HTML5 Audio Fallback
 */
let bgmAudioElement: HTMLAudioElement | null = null;
let currentBgmPath: string | null = null;
let currentBlobUrl: string | null = null;
let isNativePlaying = false;

export const isBgmPlaying = () => {
  return isNativePlaying || (bgmAudioElement !== null && !bgmAudioElement.paused);
};

export const playBgmTheme = async (audioDataUriOrPath: string, gamePath?: string) => {
  try {
    if (isMuted) return;
    const targetPath = gamePath || audioDataUriOrPath;
    if (currentBgmPath === targetPath && isBgmPlaying()) return;

    stopBgmTheme(false);
    currentBgmPath = targetPath;

    // 1. Primary Engine: Native OS Backend Playback (Hardware-accelerated, zero WebKit autoplay blocking)
    try {
      const nativePlayed = await invoke<boolean>('play_game_soundtrack', { path: targetPath });
      if (nativePlayed) {
        isNativePlaying = true;
        return;
      }
    } catch (nativeErr) {
      console.warn("[AudioEngine] Native soundtrack player fallback:", nativeErr);
    }

    // 2. Secondary Engine: Web Audio / HTML5 Audio Element Fallback
    if (audioDataUriOrPath && audioDataUriOrPath.startsWith('data:')) {
      let playUrl = audioDataUriOrPath;
      try {
        const parts = audioDataUriOrPath.split(',');
        if (parts.length >= 2) {
          const base64Data = parts[1];
          const mimeMatch = parts[0].match(/:(.*?);/);
          const mimeType = mimeMatch ? mimeMatch[1] : 'audio/wav';
          const binaryString = atob(base64Data);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: mimeType });
          playUrl = URL.createObjectURL(blob);
          currentBlobUrl = playUrl;
        }
      } catch (_) {}

      const audio = new Audio();
      audio.src = playUrl;
      audio.loop = true;
      audio.volume = 0.05;
      bgmAudioElement = audio;

      await audio.play();

      // Smooth volume fade-in
      let vol = 0.05;
      const fadeTimer = setInterval(() => {
        if (!bgmAudioElement || bgmAudioElement !== audio) {
          clearInterval(fadeTimer);
          return;
        }
        vol = Math.min(vol + 0.05, 0.70);
        audio.volume = vol;
        if (vol >= 0.70) {
          clearInterval(fadeTimer);
        }
      }, 30);
    }
  } catch (e) {
    console.warn("[AudioEngine] playBgmTheme error:", e);
  }
};

export const stopBgmTheme = (smooth = true) => {
  currentBgmPath = null;

  // Stop native backend audio player
  if (isNativePlaying) {
    invoke('stop_game_soundtrack').catch(() => {});
    isNativePlaying = false;
  }

  // Stop HTML5 audio player
  if (bgmAudioElement) {
    const audio = bgmAudioElement;
    bgmAudioElement = null;

    if (smooth && audio.volume > 0.1) {
      const fadeOutTimer = setInterval(() => {
        if (audio.volume > 0.1) {
          audio.volume = Math.max(0, audio.volume - 0.1);
        } else {
          clearInterval(fadeOutTimer);
          audio.pause();
          audio.src = '';
        }
      }, 25);
    } else {
      audio.pause();
      audio.src = '';
    }
  }

  if (currentBlobUrl) {
    try {
      URL.revokeObjectURL(currentBlobUrl);
    } catch (_) {}
    currentBlobUrl = null;
  }
};
