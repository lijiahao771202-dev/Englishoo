/**
 * Robust Text-to-Speech utility
 * 
 * Strategy:
 * 1. Primary: Use Online Dictionary Audio (Youdao) for words/short phrases.
 *    - Very reliable, high quality US English pronunciation.
 *    - Works on almost all devices without setup.
 *    - Avoids browser compatibility issues with SpeechSynthesis.
 * 2. Fallback: Web Speech API (speechSynthesis) for longer text or offline use.
 */

export const initTTS = () => {
  // Initialize Web Speech API just in case we need it
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
    }
  }
};

// Keep track of the current audio to allow cancellation
let currentAudio: HTMLAudioElement | null = null;

// Global playback ID to prevent race conditions
// Every speak() call increments this. Async callbacks check if their ID matches current.
let currentPlaybackId = 0;

let startTimeout: any = null; // Track pending start timeout
let lastSpokenText: string = ''; // Track last spoken text
let debounceTimeout: any = null; // Debounce rapid calls

interface SpeakOptions {
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
  forceNative?: boolean; // Force using Web Speech API
}

export const stopAll = () => {
  // Increment ID to invalidate any pending async operations (e.g. audio loading)
  currentPlaybackId++;

  if (startTimeout) {
    clearTimeout(startTimeout);
    startTimeout = null;
  }

  // 1. Stop HTML Audio
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0; // Reset
    currentAudio = null;
  }

  // 2. Stop Web Speech API
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  if (debounceTimeout) {
    clearTimeout(debounceTimeout);
    debounceTimeout = null;
  }
};

// Alias for backward compatibility
export const cancelSpeech = stopAll;

export const speak = (text: string, options: SpeakOptions = {}) => {
  if (!text) return;

  // [Debounce Strategy]
  // Ignore duplicate calls for the same text within a short window
  if (text === lastSpokenText && debounceTimeout) {
    console.log('[TTS] Debounce: ignoring duplicate call for', text);
    return;
  }

  // Stop everything before starting new
  stopAll();

  // Capture the ID for this specific playback attempt
  const myPlaybackId = currentPlaybackId;

  // Reset debounce timer
  lastSpokenText = text;
  debounceTimeout = setTimeout(() => {
    debounceTimeout = null;
    lastSpokenText = '';
  }, 300);

  const { rate = 1.0, onStart, onEnd, onError, forceNative = false } = options;

  // Helper to check validity
  const isValid = () => currentPlaybackId === myPlaybackId;

  const safeStart = () => {
    if (isValid()) {
      if (onStart) onStart();
      window.dispatchEvent(new CustomEvent('tts-state-change', { detail: { isPlaying: true } }));
    }
  };

  const safeEnd = () => {
    // Note: We dispatch global state change even if logically invalid, to ensure UI resets
    // But we only call user callback if valid
    if (isValid() && onEnd) onEnd();
    window.dispatchEvent(new CustomEvent('tts-state-change', { detail: { isPlaying: false } }));
  };

  // Strategy 1: Online Audio (Best for words/short phrases)
  // Using Youdao Dictionary API (Type 2 = US English)
  if (text.length < 100 && !forceNative) {
    try {
      const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=2`);
      audio.playbackRate = rate;

      audio.onplay = () => {
        if (!isValid()) {
          audio.pause();
          return;
        }
        console.log(`[TTS #${myPlaybackId}] Playing online audio: ${text}`);
        safeStart();
      };

      audio.onended = () => {
        if (currentAudio === audio) currentAudio = null;
        safeEnd();
      };

      audio.onerror = (e) => {
        if (!isValid()) return;
        console.warn('TTS: Online audio failed, falling back to Native', e);
        speakNative(text, rate, safeStart, safeEnd, onError, myPlaybackId);
      };

      currentAudio = audio;

      // Attempt play
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          if (!isValid()) return; // Ignored if we cancelled/switched

          // Auto-play policy blocking or network error
          console.warn('TTS: Auto-play prevented or network error', error);
          speakNative(text, rate, safeStart, safeEnd, onError, myPlaybackId);
        });
      }
      return;
    } catch (e) {
      if (!isValid()) return;
      console.error('TTS: Error creating audio', e);
      speakNative(text, rate, safeStart, safeEnd, onError, myPlaybackId);
      return;
    }
  }

  // Strategy 2: Native Web Speech API
  speakNative(text, rate, safeStart, safeEnd, onError, myPlaybackId);
};

const speakNative = (
  text: string,
  rate: number,
  onStart: (() => void) | undefined,
  onEnd: (() => void) | undefined,
  onError: ((err: any) => void) | undefined,
  playbackId: number
) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    if (onError) onError('Speech synthesis not supported');
    return;
  }

  // Check validity immediate
  if (currentPlaybackId !== playbackId) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.lang = 'en-US';

  const voices = window.speechSynthesis.getVoices();
  const preferredVoice =
    voices.find(v => v.name.includes('Microsoft') && v.lang.startsWith('en')) ||
    voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||
    voices.find(v => v.name === 'Samantha') ||
    voices.find(v => v.lang === 'en-US');

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  // Fix for garbage collection
  (window as any).currentUtterance = utterance;

  utterance.onstart = () => {
    if (currentPlaybackId === playbackId && onStart) onStart();
  };

  utterance.onend = () => {
    if ((window as any).currentUtterance === utterance) {
      (window as any).currentUtterance = null;
    }
    if (currentPlaybackId === playbackId && onEnd) onEnd();
  };

  utterance.onerror = (e) => {
    if ((window as any).currentUtterance === utterance) {
      (window as any).currentUtterance = null;
    }
    if (currentPlaybackId !== playbackId) return;

    // Ignore interruption errors
    if (e.error === 'interrupted' || e.error === 'canceled') return;

    console.error('TTS: Native error', e);
    if (onError) onError(e);
    if (onEnd) onEnd();
  };

  // Small delay to ensure cancellation took effect
  startTimeout = setTimeout(() => {
    startTimeout = null;
    if (currentPlaybackId === playbackId) {
      console.log(`[TTS #${playbackId}] Executing Native speak: ${text}`);
      window.speechSynthesis.speak(utterance);
    }
  }, 50);
};
