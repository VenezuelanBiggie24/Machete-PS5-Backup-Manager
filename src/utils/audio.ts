const getAudioContext = (() => {
  let ctx: AudioContext | null = null;
  return () => {
    if (!ctx) {
      ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return ctx;
  };
})();

export const playHoverSound = () => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.05);
    
    gain.gain.setValueAtTime(0.02, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {
    // Ignore audio context errors
  }
};

export const playScanSound = () => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(1200, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.03, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  } catch (e) { }
};

export const playSuccessSound = () => {
  try {
    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    
    const playNote = (freq: number, startTime: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.05, startTime + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 1.0);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 1.0);
    };

    playNote(440, ctx.currentTime); // A4
    playNote(554.37, ctx.currentTime + 0.1); // C#5
    playNote(659.25, ctx.currentTime + 0.2); // E5
  } catch (e) {}
};
