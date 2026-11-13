// Unlock audio on interaction so live alerts comply with browser autoplay rules.
export function createNotificationSound({
  target = globalThis.document,
  createContext = () => {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    return AudioContext ? new AudioContext() : null;
  }
} = {}) {
  let context = null, listening = false;
  function unlock() {
    if (!listening) return;
    try {
      if (!context || context.state === 'closed') context = createContext();
      if (context?.state === 'suspended') context.resume().catch(() => {});
    } catch { /* Visual notifications remain available when audio is blocked. */ }
  }
  function start() {
    if (listening) return;
    listening = true;
    target?.addEventListener('pointerdown', unlock, true);
    target?.addEventListener('keydown', unlock, true);
    // A login click may already have activated audio for this document.
    if (globalThis.navigator?.userActivation?.hasBeenActive) unlock();
  }
  function stop() {
    listening = false;
    target?.removeEventListener('pointerdown', unlock, true);
    target?.removeEventListener('keydown', unlock, true);
    const previous = context; context = null;
    try { previous?.close().catch(() => {}); } catch {}
  }
  function play() {
    if (!listening || context?.state !== 'running') return false;
    try {
      const audio = context, startAt = audio.currentTime;
      for (const [frequency, offset] of [[784, 0], [1046.5, 0.14]]) {
        const tone = audio.createOscillator(), gain = audio.createGain();
        tone.type = 'sine';
        tone.frequency.setValueAtTime(frequency, startAt + offset);
        gain.gain.setValueAtTime(0, startAt + offset);
        gain.gain.linearRampToValueAtTime(0.12, startAt + offset + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, startAt + offset + 0.25);
        tone.connect(gain); gain.connect(audio.destination);
        tone.onended = () => { tone.disconnect(); gain.disconnect(); };
        tone.start(startAt + offset); tone.stop(startAt + offset + 0.27);
      }
      return true;
    } catch { return false; }
  }
  return { start, stop, play };
}
