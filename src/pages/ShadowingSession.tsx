import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Mic, Play, Square, Wand2, Eye, EyeOff, CheckCircle2, RotateCcw, Award, ChevronRight } from 'lucide-react';
// import { useNavigate } from 'react-router-dom';
import confetti from 'canvas-confetti';
import { useAuth } from '@/contexts/AuthContext';
import { generateShadowingStory, type ShadowingStory } from '@/lib/deepseek';
import { speak, stopAll } from '@/lib/tts';
import { getAllCards } from '@/lib/db';
import { calculateSimilarity, getScoreLevel } from '@/lib/scoring';
import { type WordCard } from '@/types';

// Add Web Speech API types
interface IWindow extends Window {
  webkitSpeechRecognition: any;
  SpeechRecognition: any;
}
declare const window: IWindow;

type Phase = 'setup' | 'generating' | 'practice' | 'summary';
type PracticeMode = 'scenario' | 'words';

interface ShadowingSessionProps {
  onBack: () => void;
  apiKey?: string;
}

export default function ShadowingSession({ onBack, apiKey: propApiKey }: ShadowingSessionProps) {
  // const navigate = useNavigate();
  const { user } = useAuth();

  // State
  const [phase, setPhase] = useState<Phase>('setup');
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('words');
  const [availableWords, setAvailableWords] = useState<WordCard[]>([]);
  const [selectedWords, setSelectedWords] = useState<string[]>([]);
  const [scenarioInput, setScenarioInput] = useState('');
  const [story, setStory] = useState<ShadowingStory | null>(null);

  // Practice State
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isBlindMode, setIsBlindMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [userTranscript, setUserTranscript] = useState('');
  const [lastScore, setLastScore] = useState<number | null>(null);
  const [segmentScores, setSegmentScores] = useState<number[]>([]);
  const [isPlayingAll, setIsPlayingAll] = useState(false); // UI state for play all
  const [showAllWords, setShowAllWords] = useState(false); // Folding state for setup

  // Refs
  const recognitionRef = useRef<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isPlayingRef = useRef(false); // Ref to track play sequence availability

  // Stats
  const [totalScore, setTotalScore] = useState(0);

  // --- Initialization ---

  useEffect(() => {
    loadWords();
  }, []);

  useEffect(() => {
    if (phase === 'summary') {
      confetti({
        particleCount: 200,
        spread: 100,
        origin: { y: 0.6 }
      });
    }
  }, [phase]);

  useEffect(() => {
    // Scroll to current segment
    if (scrollRef.current) {
      const activeEl = scrollRef.current.querySelector('[data-active="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentIndex]);

  const loadWords = async () => {
    try {
      // Get all cards that are not New (i.e. have been learned at least once)
      // Or just get all cards for simplicity
      const allCards = await getAllCards();
      // Filter for cards that have good mastery or are just learned
      // For now, take recent 100 cards to allow selection from a slightly larger pool
      // Sort by createdAt desc (Newest first) as requested
      const sorted = allCards
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 100);
      setAvailableWords(sorted);
    } catch (e) {
      console.error('Failed to load words', e);
    }
  };

  // --- Logic: Generation ---

  const handleGenerate = async () => {
    if (practiceMode === 'words' && selectedWords.length === 0) return;
    if (practiceMode === 'scenario' && !scenarioInput.trim()) return;

    setPhase('generating');
    try {
      // Use prop or fallback to local storage with correct key
      const key = propApiKey || localStorage.getItem('deepseek_api_key') || '';

      let input: string | string[];
      if (practiceMode === 'words') {
        input = selectedWords;
      } else {
        input = scenarioInput;
      }

      const generatedStory = await generateShadowingStory(
        practiceMode === 'scenario' ? 'scenario' : 'learned',
        input,
        key
      );

      setStory(generatedStory);
      setSegmentScores(new Array(generatedStory.sentences.length).fill(0));
      setPhase('practice');
    } catch (e) {
      console.error(e);
      alert('Failed to generate content. Please check your API Key.');
      setPhase('setup');
    }
  };

  // --- Logic: Playback & Recording ---

  const playCurrentAudio = () => {
    if (!story) return;
    const text = story.sentences[currentIndex].text;
    stopAll();
    isPlayingRef.current = false;
    setIsPlayingAll(false);
    speak(text, { rate: 0.9, forceNative: false });
  };

  const stopPlayback = () => {
    stopAll();
    isPlayingRef.current = false;
    setIsPlayingAll(false);
  };

  const playFullStory = (index = 0) => {
    if (!story || index >= story.sentences.length) {
      stopPlayback();
      return;
    }

    // If starting from scratch or specific index
    isPlayingRef.current = true;
    setIsPlayingAll(true);
    setCurrentIndex(index);

    const text = story.sentences[index].text;
    speak(text, {
      rate: 0.9,
      forceNative: false,
      onEnd: () => {
        if (isPlayingRef.current) {
          playFullStory(index + 1);
        }
      },
      onError: () => stopPlayback()
    });
  };

  const toggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const startRecording = () => {
    // Check browser support
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Your browser does not support Speech Recognition. Please use Chrome or Safari.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = true;

      recognition.onstart = () => {
        setIsRecording(true);
        setUserTranscript('');
        transcriptRef.current = '';
      };

      recognition.onresult = (event: any) => {
        const t = Array.from(event.results)
          .map((result: any) => result[0].transcript)
          .join('');
        setUserTranscript(t);
        transcriptRef.current = t;
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsRecording(false);
      };

      recognition.onend = () => {
        setIsRecording(false);
        // Don't score empty
        if (transcriptRef.current.trim().length > 0) {
          performScoring(transcriptRef.current);
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.error(e);
      setIsRecording(false);
    }
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      // Scoring happens in onend
    }
  };

  const performScoring = (transcript: string) => {
    if (!story) return;
    const targetText = story.sentences[currentIndex].text;
    const score = calculateSimilarity(targetText, transcript);
    setLastScore(score);

    // Update segment scores
    const newScores = [...segmentScores];
    newScores[currentIndex] = score;
    setSegmentScores(newScores);
    setTotalScore(prev => prev + score);

    // Auto-advance if score is good?
    // Maybe not auto, let user decide. But provide visual feedback.
  };

  const formatScoreColor = (score: number) => {
    const level = getScoreLevel(score);
    switch (level) {
      case 'perfect': return 'text-green-500';
      case 'good': return 'text-emerald-500';
      case 'average': return 'text-yellow-500';
      case 'retry': return 'text-red-500';
    }
  };

  const handleNext = () => {
    if (!story) return;
    if (currentIndex < story.sentences.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setUserTranscript('');
      setLastScore(null);
    } else {
      setPhase('summary');
    }
  };

  const handlePrev = () => {
    if (currentIndex > 0) {
      setCurrentIndex(prev => prev - 1);
      setUserTranscript('');
      setLastScore(null);
    }
  };

  // --- Renders ---

  const renderSetup = () => (
    <div className="max-w-4xl mx-auto p-6 md:p-8 pb-32">
      <header className="flex items-center gap-4 mb-10">
        <button onClick={onBack} className="p-3 rounded-full hover:bg-black/5 active:bg-black/10 transition-colors">
          <ArrowLeft className="w-6 h-6 text-gray-700" />
        </button>
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-violet-600 to-indigo-600">Shadowing Practice</h1>
          <p className="text-gray-500 mt-1">Select words or a topic to generate a shadowing session.</p>
        </div>
      </header>

      {/* Mode Toggle */}
      <div className="flex p-1 bg-gray-100 rounded-2xl mb-8 w-fit">
        <button
          onClick={() => setPracticeMode('words')}
          className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${practiceMode === 'words' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          From Words
        </button>
        <button
          onClick={() => setPracticeMode('scenario')}
          className={`px-6 py-2.5 rounded-xl text-sm font-semibold transition-all ${practiceMode === 'scenario' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          Custom Scenario
        </button>
      </div>

      {/* Dynamic Content Area */}
      <AnimatePresence mode='wait'>
        {practiceMode === 'words' ? (
          <motion.div
            key="words"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Select Words ({selectedWords.length})</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // Select up to 10 latest words
                    const latest = availableWords.slice(0, 10).map(c => c.word);
                    setSelectedWords(latest);
                  }}
                  className="text-sm px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full font-medium hover:bg-indigo-100"
                >
                  Select Latest 10
                </button>
                <button
                  onClick={() => setSelectedWords([])}
                  className="text-sm text-gray-500 font-medium hover:text-gray-700 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {availableWords.slice(0, showAllWords ? undefined : 20).map(card => {
                const isSelected = selectedWords.includes(card.word);
                return (
                  <button
                    key={card.id}
                    onClick={() => {
                      if (isSelected) setSelectedWords(prev => prev.filter(w => w !== card.word));
                      else if (selectedWords.length < 10) setSelectedWords(prev => [...prev, card.word]);
                    }}
                    className={`p-3 rounded-xl border text-left transition-all ${isSelected
                      ? 'bg-indigo-50 border-indigo-500 ring-1 ring-indigo-500'
                      : 'bg-white border-gray-200 hover:border-indigo-300'
                      }`}
                  >
                    <div className={`font-semibold ${isSelected ? 'text-indigo-700' : 'text-gray-800'}`}>
                      {card.word}
                    </div>
                    <div className="text-xs text-gray-500 truncate mt-1">{card.meaning}</div>
                  </button>
                );
              })}
            </div>

            {/* Show More Button */}
            {!showAllWords && availableWords.length > 20 && (
              <div className="flex justify-center mt-6">
                <button
                  onClick={() => setShowAllWords(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors shadow-sm"
                >
                  Show All ({availableWords.length}) <ChevronRight className="w-4 h-4 rotate-90" />
                </button>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="scenario"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <h2 className="text-xl font-semibold text-gray-800 mb-4">Describe Scenario</h2>
            <textarea
              value={scenarioInput}
              onChange={(e) => setScenarioInput(e.target.value)}
              placeholder="E.g., Ordering coffee at a busy cafe in New York..."
              className="w-full h-48 p-4 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all resize-none text-lg"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generate FAB */}
      <div className="fixed bottom-8 left-0 right-0 flex justify-center px-4">
        <button
          onClick={handleGenerate}
          disabled={practiceMode === 'words' ? selectedWords.length === 0 : !scenarioInput.trim()}
          className="bg-gray-900 text-white pl-6 pr-8 py-4 rounded-full shadow-2xl hover:scale-105 active:scale-95 transition-transform flex items-center gap-3 disabled:opacity-50 disabled:hover:scale-100"
        >
          <Wand2 className="w-5 h-5" />
          <span className="text-lg font-semibold">Generate Session</span>
        </button>
      </div>
    </div >
  );

  const renderLoading = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
      >
        <Wand2 className="w-12 h-12 text-indigo-600 mb-4" />
      </motion.div>
      <h2 className="text-xl font-semibold text-gray-800">Generating Story...</h2>
      <p className="text-gray-500">Weaving your words into a conversation.</p>
    </div>
  );

  const renderPractice = () => {
    if (!story) return null;
    const currentSent = story.sentences[currentIndex];

    return (
      <div className="flex flex-col h-screen bg-gray-50">
        {/* Top Bar */}
        <div className="px-6 py-4 flex items-center justify-between bg-white border-b border-gray-100 z-10">
          <button onClick={() => setPhase('setup')} className="p-2 rounded-full hover:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex items-center gap-2">
            <div className="text-sm font-semibold text-gray-500">
              {currentIndex + 1} / {story.sentences.length}
            </div>
            <div className="w-32 h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${((currentIndex + 1) / story.sentences.length) * 100}%` }}
              />
            </div>
          </div>
          <button
            onClick={() => setIsBlindMode(!isBlindMode)}
            className={`p-2 rounded-full transition-colors ${isBlindMode ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-600'}`}
          >
            {isBlindMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
        </div>

        {/* Main Content (Scrollable) */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-6 space-y-8 scroll-smooth"
        >
          <div className="max-w-2xl mx-auto space-y-12 py-10">
            {story.sentences.map((sent, idx) => {
              const isActive = idx === currentIndex;
              const opacity = isActive ? 1 : 0.4;
              const scale = isActive ? 1 : 0.95;
              const isBlur = isBlindMode && isActive && !userTranscript; // Blur active line if blind mode is on and not yet spoken

              return (
                <motion.div
                  key={idx}
                  data-active={isActive}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity, scale }}
                  className={`transition-all duration-500 ${isActive ? 'my-8' : ''}`}
                >
                  {/* Text */}
                  <div className={`text-2xl md:text-3xl font-bold text-gray-900 leading-normal tracking-tight transition-all duration-300 ${isBlur ? 'blur-md select-none' : ''}`}>
                    {sent.text}
                  </div>

                  {/* Metadata (Phonetics/Translation) */}
                  <AnimatePresence>
                    {(isActive || !isBlindMode) && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="mt-3 space-y-1"
                      >
                        <div className="text-sm font-mono text-indigo-500">{sent.phonetics}</div>
                        <div className="text-lg text-gray-500">{sent.translation}</div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Score Indicator for this segment if done */}
                  {segmentScores[idx] > 0 && (
                    <div className={`mt-2 text-sm font-bold ${formatScoreColor(segmentScores[idx])}`}>
                      Create Score: {segmentScores[idx]}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Controls Footer */}
        <div className="bg-white border-t border-gray-100 p-6 pb-8 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] rounded-t-[2rem]">

          {/* Realtime Feedback Text */}
          <div className="h-12 flex items-center justify-center mb-4">
            {userTranscript ? (
              <div className="text-lg font-medium text-gray-700 px-4 py-1 rounded-lg bg-gray-50 border border-gray-100">
                {userTranscript}
              </div>
            ) : (
              <div className="text-sm text-gray-400">Tap mic and repeat the sentence...</div>
            )}
          </div>

          <div className="flex items-center justify-center gap-8">
            {/* Play Reference */}
            <div className="flex gap-2">
              {/* Play Single */}
              <button
                onClick={playCurrentAudio}
                className="w-14 h-14 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center hover:bg-gray-200 hover:scale-105 transition-all"
                title="Play Sentence"
              >
                <Play className="w-6 h-6 fill-current" />
              </button>
              {/* Play All */}
              <button
                onClick={() => isPlayingAll ? stopPlayback() : playFullStory(0)}
                className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${isPlayingAll ? 'bg-indigo-100 text-indigo-600 animate-pulse' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                title="Play Full Story"
              >
                {isPlayingAll ? <Square className="w-5 h-5 fill-current" /> : <Play className="w-6 h-6 ml-1" />}
                {isPlayingAll && <span className="absolute -top-1 -right-1 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span></span>}
              </button>
            </div>

            {/* Record Button */}
            <button
              onClick={toggleRecording}
              className={`w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-xl hover:scale-105 active:scale-95 ${isRecording
                ? 'bg-red-500 shadow-red-500/30'
                : 'bg-indigo-600 shadow-indigo-600/30'
                }`}
            >
              {isRecording ? (
                <Square className="w-8 h-8 text-white fill-current" />
              ) : (
                <Mic className="w-8 h-8 text-white" />
              )}
            </button>

            {/* Next/Skip */}
            <button
              onClick={handleNext}
              className="w-14 h-14 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center hover:bg-gray-200 hover:scale-105 transition-all"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderSummary = () => {
    // Calculate final stats
    const averageScore = Math.round(segmentScores.reduce((a, b) => a + b, 0) / segmentScores.length);

    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">

        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white rounded-[2rem] shadow-2xl p-8 max-w-sm w-full text-center"
        >
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <Award className="w-10 h-10" />
          </div>
          <h2 className="text-3xl font-bold text-gray-800 mb-2">Practice Complete!</h2>
          <p className="text-gray-500 mb-8">Great job shadowing.</p>

          <div className="bg-gray-50 rounded-2xl p-6 mb-8">
            <div className="text-sm text-gray-500 mb-1">Average Score</div>
            <div className={`text-5xl font-bold ${formatScoreColor(averageScore)}`}>
              {averageScore}
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => {
                setPhase('setup');
                setCurrentIndex(0);
                setSegmentScores([]);
                setUserTranscript('');
              }}
              className="w-full py-4 rounded-xl bg-gray-900 text-white font-semibold shadow-lg hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              Practice Again
            </button>
            <button
              onClick={onBack}
              className="w-full py-4 rounded-xl bg-white border border-gray-200 text-gray-700 font-semibold hover:bg-gray-50 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </motion.div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-white font-sans text-slate-900">
      <AnimatePresence mode='wait'>
        {phase === 'setup' && <motion.div key="setup" exit={{ opacity: 0 }}>{renderSetup()}</motion.div>}
        {phase === 'generating' && <motion.div key="loading" exit={{ opacity: 0 }}>{renderLoading()}</motion.div>}
        {phase === 'practice' && <motion.div key="practice" exit={{ opacity: 0 }}>{renderPractice()}</motion.div>}
        {phase === 'summary' && <motion.div key="summary" exit={{ opacity: 0 }}>{renderSummary()}</motion.div>}
      </AnimatePresence>
    </div>
  );
}
