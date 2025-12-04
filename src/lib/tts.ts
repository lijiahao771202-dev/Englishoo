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

// Global cancellation flag to prevent race conditions
let isCancelled = false;
let startTimeout: any = null; // Track pending start timeout

interface SpeakOptions {
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (err: any) => void;
  forceNative?: boolean; // Force using Web Speech API (useful for long text where we want consistent voice)
}

export const stopAll = () => {
  isCancelled = true;
  
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
  
  // 3. Clear any ongoing timeouts or pending promises (conceptually)
  // (handled by checking isCancelled in async callbacks)
};

// Alias for backward compatibility
export const cancelSpeech = stopAll;

export const speak = (text: string, options: SpeakOptions = {}) => {
  if (!text) return;

  // Reset cancellation flag for new session
  isCancelled = false;

  const { rate = 1.0, onStart, onEnd, onError, forceNative = false } = options;

  // STRICT STOP before starting anything new
  stopAll();
  isCancelled = false; // Reset again because stopAll sets it to true

  // Helper to wrap callbacks with cancellation check
  const safeStart = () => {
      if (!isCancelled && onStart) onStart();
  };
  const safeEnd = () => {
      if (!isCancelled && onEnd) onEnd();
      // We don't reset isCancelled here to allow debounce/overlap protection
  };

  // Strategy 1: Online Audio (Best for words/short phrases)
  // Using Youdao Dictionary API (Type 2 = US English)
  if (text.length < 100 && !forceNative) {
    try {
      const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=2`);
      audio.playbackRate = rate;
      
      audio.onplay = () => {
        console.log('TTS: Playing online audio');
        safeStart();
      };
      
      audio.onended = () => {
        safeEnd();
        if (currentAudio === audio) currentAudio = null;
      };

      audio.onerror = (e) => {
        if (isCancelled) return;
        console.warn('TTS: Online audio failed, falling back to Web Speech API', e);
        speakNative(text, rate, safeStart, safeEnd, onError);
      };
      
      currentAudio = audio;
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          if (isCancelled) return; // Ignore errors if we cancelled
          console.warn('TTS: Auto-play prevented or network error', error);
          speakNative(text, rate, safeStart, safeEnd, onError);
        });
      }
      return;
    } catch (e) {
      if (isCancelled) return;
      console.error('TTS: Error creating audio', e);
      speakNative(text, rate, safeStart, safeEnd, onError);
      return;
    }
  }

  // Strategy 2: Native Web Speech API (For long text)
  speakNative(text, rate, safeStart, safeEnd, onError);
};

const speakNative = (
  text: string, 
  rate: number,
  onStart?: () => void,
  onEnd?: () => void,
  onError?: (err: any) => void
) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    console.warn('TTS: Speech synthesis not supported');
    if (onError) onError('Speech synthesis not supported');
    return;
  }

  // Double check cancellation
  if (isCancelled) return;

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = rate;
  utterance.lang = 'en-US';

  // Try to find a good voice
  const voices = window.speechSynthesis.getVoices();
  const preferredVoice = 
    voices.find(v => v.name.includes('Microsoft') && v.lang.startsWith('en')) || // Edge/Windows
    voices.find(v => v.name.includes('Google') && v.lang.startsWith('en')) ||    // Chrome
    voices.find(v => v.name === 'Samantha') ||                                   // macOS
    voices.find(v => v.lang === 'en-US');

  if (preferredVoice) {
    utterance.voice = preferredVoice;
  }

  // Fix for Chrome/Safari garbage collection bug
  (window as any).currentUtterance = utterance;
  
  utterance.onstart = () => {
    if (!isCancelled && onStart) onStart();
  };

  utterance.onend = () => {
    if ((window as any).currentUtterance === utterance) {
      (window as any).currentUtterance = null;
    }
    if (!isCancelled && onEnd) onEnd();
  };

  utterance.onerror = (e) => {
    if ((window as any).currentUtterance === utterance) {
      (window as any).currentUtterance = null;
    }
    
    if (isCancelled) return; // Ignore if cancelled
    
    // Enhanced check for interruption
    if (e.error === 'interrupted' || e.error === 'canceled') {
      return;
    }
    
    console.error('TTS: Native speech error', e.error, e);
    if (onError) onError(e);
    // Even on error, we should probably call onEnd to reset UI state
    if (onEnd) onEnd(); 
  };

  // Small delay to ensure cancellation took effect and browser is ready
  // Increased to 100ms to fix race condition where cancel() isn't finished
  startTimeout = setTimeout(() => {
      startTimeout = null;
      if (!isCancelled) {
        console.log('TTS: Executing speak()', { text: text.substring(0, 20) + '...' });
        window.speechSynthesis.speak(utterance);
      }
  }, 100);
};
