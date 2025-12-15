/**
 * @module Source of truth for sound effects
 * @description Provides real-time synthesized sound effects using Web Audio API.
 * No external assets required.
 * @author Trae-Architect
 */

// Singleton AudioContext
let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;

const initAudio = () => {
    if (!audioCtx) {
        // Handle browser compatibility
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
            audioCtx = new AudioContext();
            masterGain = audioCtx.createGain();
            masterGain.gain.value = 0.5; // Default volume 50%
            masterGain.connect(audioCtx.destination);
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
};

// Helper: Play a tone
const playTone = (freq: number, type: OscillatorType, duration: number, startTime: number = 0, vol: number = 1) => {
    const ctx = initAudio();
    if (!ctx || !masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + startTime);

    gain.gain.setValueAtTime(vol, ctx.currentTime + startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + startTime + duration);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start(ctx.currentTime + startTime);
    osc.stop(ctx.currentTime + startTime + duration);
};

// Helper: Play a Marimba-style note
const playMarimba = (freq: number, startTime: number = 0, vol: number = 0.5) => {
    const ctx = initAudio();
    if (!ctx || !masterGain) return;

    const t = ctx.currentTime + startTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Marimba has strong fundamental and 4th harmonic (double octave)
    // We simulate this with a sine wave and a subtle overtone
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, t);

    // Woody envelope: Fast attack, exponential decay
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.005); // Impact
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3); // Decay

    // Optional: Add a subtle 4th harmonic for "bar" resonance
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(freq * 4, t);
    gain2.gain.setValueAtTime(0, t);
    gain2.gain.linearRampToValueAtTime(vol * 0.1, t + 0.005);
    gain2.gain.exponentialRampToValueAtTime(0.01, t + 0.15); // Faster decay for harmonic

    osc.connect(gain);
    osc2.connect(gain2);
    gain.connect(masterGain);
    gain2.connect(masterGain);

    osc.start(t);
    osc.stop(t + 0.35);
    osc2.start(t);
    osc2.stop(t + 0.35);
};

// 1. Simple Crisp Click (Marimba Tick)
export const playClickSound = (() => {
    // Prevent rapid-fire clicks
    let lastTime = 0;
    return () => {
        const now = Date.now();
        if (now - lastTime < 50) return;
        lastTime = now;

        // High pitched short marimba stroke (Wood block feel)
        const ctx = initAudio();
        if (!ctx || !masterGain) return;

        // Use a higher pitch with very short decay for "click"
        playMarimba(1200, 0, 0.2);
    };
})();

// 2. Know/Pass Sound (Warm Marimba Chord)
export const playKnowSound = () => {
    // A nice Major chord or interval on Marimba
    playMarimba(523.25, 0, 0.4);       // C5
    playMarimba(659.25, 0.05, 0.3);    // E5 (slightly delayed like a strum)
};

// 3. Success (Spelling Complete - Chime)
export const playSuccessSound = () => {
    // C Major Arpeggio: C5, E5, G5, C6
    playTone(523.25, 'sine', 0.3, 0, 0.4);
    playTone(659.25, 'sine', 0.3, 0.1, 0.4);
    playTone(783.99, 'sine', 0.4, 0.2, 0.4);
    playTone(1046.50, 'sine', 0.6, 0.3, 0.3);
};

// 4. Fail (Incorrect - Low Thud)
export const playFailSound = () => {
    const ctx = initAudio();
    if (!ctx || !masterGain) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(100, ctx.currentTime + 0.3); // Pitch Drop

    gain.gain.setValueAtTime(0.5, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(masterGain);

    osc.start();
    osc.stop(ctx.currentTime + 0.3);
};

// 5. Review Button Sounds (1-4)
// 1: Again (Fail-like but softer)
export const playReviewAgainSound = () => {
    playTone(180, 'triangle', 0.25, 0, 0.4);
};

// 2: Hard (Neutral)
export const playReviewHardSound = () => {
    playTone(400, 'sine', 0.2, 0, 0.4);
};

// 3: Good (Positive)
export const playReviewGoodSound = () => {
    playTone(600, 'sine', 0.2, 0, 0.4);
    playTone(800, 'sine', 0.3, 0.1, 0.2); // Upward
};

// 4: Easy (High Positive)
export const playReviewEasySound = () => {
    playTone(800, 'sine', 0.15, 0, 0.4);
    playTone(1200, 'sine', 0.3, 0.1, 0.3); // Bright
};

// 6. Spelling Success (Same as generic success for now, or more sparkly)
export const playSpellingSuccessSound = () => {
    playSuccessSound();
};

// 7. Session Complete (Fanfare)
export const playSessionCompleteSound = () => {
    // Victory Fanfare
    // C E G C G E C
    const now = 0;
    playTone(523.25, 'triangle', 0.2, now, 0.5);       // C5
    playTone(523.25, 'triangle', 0.2, now + 0.15, 0.5); // C5
    playTone(523.25, 'triangle', 0.2, now + 0.3, 0.5);  // C5
    playTone(659.25, 'triangle', 0.6, now + 0.5, 0.5);  // E5 (Long)
    playTone(523.25, 'triangle', 0.2, now + 0.9, 0.5);  // C5
    playTone(659.25, 'triangle', 0.8, now + 1.1, 0.5);  // E5 (Longer)
};

// Settings
export const setMasterVolume = (val: number) => {
    if (masterGain) {
        masterGain.gain.value = Math.max(0, Math.min(1, val));
    }
};

// Legacy alias
export const playPassSound = playKnowSound;
