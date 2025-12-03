/**
 * Simple sound effect manager using Web Audio API
 * No external assets required
 */

const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
let audioCtx: AudioContext | null = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export type SoundType = 'success' | 'failure' | 'neutral' | 'click';

export function playSound(type: SoundType) {
  try {
    const ctx = getAudioContext();
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);

    const now = ctx.currentTime;

    switch (type) {
      case 'success':
        // Pleasant "Ding" - Sine wave, High pitch
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, now); // A5
        oscillator.frequency.exponentialRampToValueAtTime(440, now + 0.5); // Drop slightly
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.5);
        oscillator.start(now);
        oscillator.stop(now + 0.5);
        break;

      case 'failure':
        // Dull "Buzz" - Sawtooth, Low pitch
        oscillator.type = 'sawtooth';
        oscillator.frequency.setValueAtTime(150, now);
        oscillator.frequency.linearRampToValueAtTime(100, now + 0.3);
        gainNode.gain.setValueAtTime(0.1, now);
        gainNode.gain.linearRampToValueAtTime(0.01, now + 0.3);
        oscillator.start(now);
        oscillator.stop(now + 0.3);
        break;

      case 'neutral':
        // Neutral "Pop"
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(400, now);
        gainNode.gain.setValueAtTime(0.05, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        oscillator.start(now);
        oscillator.stop(now + 0.1);
        break;

      case 'click':
        // Short click
        oscillator.type = 'square';
        oscillator.frequency.setValueAtTime(800, now);
        gainNode.gain.setValueAtTime(0.02, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
        oscillator.start(now);
        oscillator.stop(now + 0.05);
        break;
    }
  } catch (e) {
    console.error('Failed to play sound:', e);
  }
}
