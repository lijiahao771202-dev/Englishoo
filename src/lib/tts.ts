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

export const speak = (text: string, rate: number = 1.0) => {
  if (!text) return;

  // Stop any currently playing audio
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }

  // Strategy 1: Online Audio (Best for words/short phrases)
  // Using Youdao Dictionary API (Type 2 = US English)
  // This is extremely stable and high quality for English words
  if (text.length < 100) {
    try {
      const audio = new Audio(`https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=2`);
      audio.playbackRate = rate;
      
      audio.onplay = () => console.log('TTS: Playing online audio');
      audio.onerror = (e) => {
        console.warn('TTS: Online audio failed, falling back to Web Speech API', e);
        speakNative(text, rate);
      };
      
      currentAudio = audio;
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(error => {
          console.warn('TTS: Auto-play prevented or network error', error);
          // If blocked or failed, try native
          speakNative(text, rate);
        });
      }
      return;
    } catch (e) {
      console.error('TTS: Error creating audio', e);
      speakNative(text, rate);
      return;
    }
  }

  // Strategy 2: Native Web Speech API (For long text)
  speakNative(text, rate);
};

const speakNative = (text: string, rate: number) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    console.warn('TTS: Speech synthesis not supported');
    return;
  }

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
  
  utterance.onend = () => {
    (window as any).currentUtterance = null;
  };

  window.speechSynthesis.speak(utterance);
};
